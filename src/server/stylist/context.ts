import "server-only";
import { getDb } from "@/server/db";
import { garments as garmentsTable, outfits as outfitsTable, type Garment } from "@/server/db/schema";
import { DRESS_CODE_FORMALITY, type DressCode, type Season } from "@/lib/domain";
import { addDays, monthOf } from "@/lib/dates";
import { seasonalNeeds } from "@/lib/weather";
import type { HardConstraints } from "@/lib/outfit-rules";
import { getSettings } from "@/server/services/settings";
import { getProfile, activeFeedback, ruleConstraints, listRules } from "@/server/services/preferences";
import { getDays, plansBetween, type DayView } from "@/server/services/plans";
import { listWearLogs } from "@/server/services/wear";
import { outfitGarmentIds } from "@/server/services/outfits";
import { eq } from "drizzle-orm";
import type { EngineContext } from "./engine";

/** With no occasion, dress code or stated preference: halfway between casual and smart casual. */
export const NEUTRAL_FORMALITY = 2.5;

export function seasonFor(date: string, latitude?: number | null): Season {
  const m = monthOf(date);
  const north: Season = m === 12 || m <= 2 ? "winter" : m <= 5 ? "spring" : m <= 8 ? "summer" : "autumn";
  if (latitude !== undefined && latitude !== null && latitude < 0) {
    return ({ winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" } as const)[north];
  }
  return north;
}

const OCCASION_FORMALITY: [RegExp, string, number][] = [
  [/\b(wedding|black tie|gala|funeral)\b/, "a formal event", 4.8],
  [/\binterview\b/, "an interview", 4.3],
  [/\b(presentation|pitch|conference|client|board)\b/, "a presentation", 4],
  [/\b(office|work|meeting)\b/, "work", 3.4],
  [/\b(date|dinner|restaurant|theatre|theater|opera|gallery)\b/, "a date / dinner", 3.2],
  [/\b(party|drinks|bar|pub|gig|concert|club|evening out|night out)\b/, "an evening out", 2.9],
  [/\b(college|lecture|class|seminar|library|uni|university|campus|school|study)\b/, "college", 2.6],
  [/\b(travel|flight|train|airport|road trip)\b/, "travel", 2.2],
  [/\b(hike|hiking|walk|outdoors|park|camping)\b/, "outdoors", 1.8],
  [/\b(gym|run|running|sport|yoga|football|tennis)\b/, "sport", 1],
  [/\b(lounge|lounging|home|chores|errands|weekend)\b/, "a relaxed day", 2],
];

export function occasionFromText(text: string): { occasion: string | null; formality: number | null } {
  const t = text.toLowerCase();
  for (const [re, label, f] of OCCASION_FORMALITY) if (re.test(t)) return { occasion: label, formality: f };
  return { occasion: null, formality: null };
}

/**
 * Best-effort reading of a free-text request for the rule-based stylist: occasion, tone,
 * and garments to use or avoid. An AI model does this properly when one is configured.
 */
export function parsePromptHints(prompt: string, garments: Pick<Garment, "id" | "name">[]) {
  const t = ` ${prompt.toLowerCase()} `;
  let formalityDelta = 0;
  if (/\b(smarter|smart|dressy|sharp|polished|formal)\b/.test(t)) formalityDelta += 0.8;
  if (/\b(casual|relaxed|laid[- ]back|comfy|comfortable|cosy|cozy)\b/.test(t)) formalityDelta -= 0.8;
  let warmthDelta = 0;
  if (/\b(warmer|warm|cosy|cozy|cold)\b/.test(t)) warmthDelta += 1.5;
  if (/\b(cooler|lighter|hot|breathable)\b/.test(t)) warmthDelta -= 1.5;
  const includeIds: number[] = [];
  const excludeIds: number[] = [];
  for (const g of garments) {
    const name = g.name.toLowerCase();
    const idx = t.indexOf(name);
    if (name.length < 4 || idx < 0) continue;
    const before = t.slice(Math.max(0, idx - 24), idx);
    if (/\b(without|avoid|not|no|except|skip|instead of)\b[^.,;]*$/.test(before)) excludeIds.push(g.id);
    else includeIds.push(g.id);
  }
  return { ...occasionFromText(t), formalityDelta, warmthDelta, includeIds, excludeIds };
}

export type ContextOptions = {
  date: string;
  occasion?: string | null;
  prompt?: string;
  includeIds?: number[];
  excludeIds?: number[];
  /** reuse a day view that was already loaded */
  day?: DayView;
  /** garments planned earlier in the same run */
  usage?: Map<number, number>;
  recentWear?: Map<number, string>;
  recentOutfits?: number[][];
  exhausted?: Set<number>;
};

export type StylistContext = {
  engine: EngineContext;
  day: DayView;
  garments: Garment[];
  ruleTexts: string[];
  feedbackNotes: string[];
  hints: ReturnType<typeof parsePromptHints>;
};

export function loadGarments(): Garment[] {
  return getDb().select().from(garmentsTable).all().filter((g) => g.status !== "retired");
}

export async function buildContext(opts: ContextOptions): Promise<StylistContext> {
  const settings = getSettings();
  const profile = getProfile();
  const garments = loadGarments();
  const day = opts.day ?? (await getDays([opts.date])).days[0];
  const hints = parsePromptHints(opts.prompt ?? "", garments);

  // formality target: explicit occasion → prompt → strictest activity dress code → profile default
  const fromOccasion = opts.occasion ? occasionFromText(opts.occasion) : { occasion: null, formality: null };
  const codes = day.activities.map((a) => DRESS_CODE_FORMALITY[a.dressCode as DressCode]).filter((x): x is number => x !== null);
  const fromActivities = codes.length ? Math.max(...codes) : null;
  const actText = day.activities.map((a) => `${a.title} ${a.notes ?? ""}`).join(" ");
  const fromActivityText = occasionFromText(actText);
  const base =
    fromOccasion.formality ?? hints.formality ?? fromActivities ?? fromActivityText.formality ?? profile.formality ?? NEUTRAL_FORMALITY;
  const targetFormality = Math.min(5, Math.max(1, base + hints.formalityDelta));
  const occasion = opts.occasion || fromOccasion.occasion || hints.occasion || (day.activities[0]?.title ?? null) || fromActivityText.occasion;

  const season = seasonFor(opts.date, settings.location?.latitude);
  const baseNeeds = day.needs.known ? day.needs : seasonalNeeds(season, day.needs.mostlyOutdoors);
  const needs = { ...baseNeeds, targetWarmth: Math.max(1.5, baseNeeds.targetWarmth + hints.warmthDelta) };

  // history: wear logs within the repetition window, plus nearby planned days
  const recentWear = new Map(opts.recentWear ?? []);
  const recentOutfits: number[][] = [...(opts.recentOutfits ?? [])];
  const windowStart = addDays(opts.date, -Math.max(profile.repetitionDays, profile.garmentRestDays, 3));
  for (const log of listWearLogs({ limit: 120 })) {
    if (log.date < windowStart || log.date > opts.date) continue;
    const ids = log.items.map((i) => i.garmentId).filter((x): x is number => x !== null);
    recentOutfits.push(ids);
    for (const id of ids) {
      const prev = recentWear.get(id);
      if (!prev || prev < log.date) recentWear.set(id, log.date);
    }
  }
  for (const p of plansBetween(addDays(opts.date, -3), addDays(opts.date, 3))) {
    if (p.date === opts.date || !p.outfitId || p.wearLogId) continue;
    const ids = outfitGarmentIds(p.outfitId);
    recentOutfits.push(ids);
    if (p.date < opts.date) for (const id of ids) if (!recentWear.has(id)) recentWear.set(id, p.date);
  }

  const fb = activeFeedback();
  const weight = { permanent: 6, temporary: 3, one_off: 1.5 } as const;
  const dislikedCombos = fb
    .filter((f) => f.kind === "not_my_style" && f.garmentIds.length)
    .map((f) => ({ ids: f.garmentIds, weight: weight[f.scope] }));
  const favourites = getDb().select({ id: outfitsTable.id }).from(outfitsTable).where(eq(outfitsTable.favourite, true)).all();
  const lovedCombos = [
    ...fb.filter((f) => f.kind === "love").map((f) => f.garmentIds),
    ...favourites.map((o) => outfitGarmentIds(o.id)),
  ];
  const uncomfortable = new Set(fb.filter((f) => f.kind === "uncomfortable").flatMap((f) => f.garmentIds));

  const fromRules = ruleConstraints();
  // "Never this combination" feedback is enforced like a rule, not just scored down.
  const neverAgain = fb.filter((f) => f.kind === "not_my_style" && f.scope === "permanent" && f.garmentIds.length >= 2).map((f) => f.garmentIds);
  const constraints: HardConstraints = {
    ...fromRules,
    neverCombine: [...(fromRules.neverCombine ?? []), ...neverAgain],
    requireIds: [...new Set([...(opts.includeIds ?? []), ...hints.includeIds])].filter((id) => !(opts.excludeIds ?? []).includes(id)),
    excludeIds: [...new Set([...(opts.excludeIds ?? []), ...hints.excludeIds])],
  };

  const byId = new Map(garments.map((g) => [g.id, g]));
  const ruleTexts = listRules({ activeOnly: true }).map((r) => {
    const names = r.garmentIds.map((id) => byId.get(id)?.name ?? `#${id}`);
    const scope = r.permanent ? "permanent" : `until ${r.expiresAt}`;
    switch (r.kind) {
      case "never_combine":
        return `Never combine: ${names.join(" + ")} (${scope})`;
      case "avoid_garment":
        return `Avoid: ${names.join(", ")} (${scope})`;
      case "avoid_colour":
        return `Avoid colours: ${r.colours.join(", ")} (${scope})`;
      case "prefer_garment":
        return `Prefer when it fits: ${names.join(", ")} (${scope})`;
      default:
        return `${r.text} (${scope})`;
    }
  });
  const feedbackNotes = fb.slice(0, 40).map((f) => {
    const names = f.garmentIds.map((id) => byId.get(id)?.name ?? `#${id}`).join(" + ");
    return `${f.kind.replace(/_/g, " ")}${names ? ` – ${names}` : ""}${f.context ? ` (context: ${f.context})` : ""}${f.note ? ` – "${f.note}"` : ""} [${f.scope.replace("_", "-")}]`;
  });

  const engine: EngineContext = {
    garments,
    date: opts.date,
    season,
    needs,
    targetFormality,
    occasion,
    profile,
    constraints,
    recentWear,
    recentOutfits,
    dislikedCombos,
    lovedCombos,
    uncomfortable,
    preferred: new Set(listRules({ activeOnly: true }).filter((r) => r.kind === "prefer_garment").flatMap((r) => r.garmentIds)),
    usage: opts.usage ?? new Map(),
    exhausted: opts.exhausted ?? new Set(),
  };
  return { engine, day, garments, ruleTexts, feedbackNotes, hints };
}
