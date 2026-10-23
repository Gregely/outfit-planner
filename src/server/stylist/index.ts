import "server-only";
import { isAvailable, slotFor, type OutfitSource } from "@/lib/domain";
import { stylistRequestSchema, type Adjustment, ADJUSTMENT_LABELS, type StylistRequest } from "@/lib/schemas";
import { validateOutfit, type HardConstraints } from "@/lib/outfit-rules";
import { addDays, weekDates } from "@/lib/dates";
import type { Garment } from "@/server/db/schema";
import { BadRequestError, ConflictError } from "@/server/errors";
import { AiUnavailableError, REASON_TEXT, aiStatus, describeAiError } from "@/server/ai/client";
import { aiAdjustOutfit, aiPlanWeek, aiReplaceGarment, aiSuggestOutfits, type StylistPromptParts } from "@/server/ai/tasks";
import { getSettings, getCareDefaults, today } from "@/server/services/settings";
import { careFor } from "@/server/services/garments";
import { getDays, getPlanRow, setDayOutfit, type DayView } from "@/server/services/plans";
import { createOutfit, getOutfit, getOutfitRecord, outfitGarmentIds, replaceOutfitItem, type OutfitView } from "@/server/services/outfits";
import { listWearLogs } from "@/server/services/wear";
import { buildContext, loadGarments, type StylistContext } from "./context";
import { adjustOutfit, describe, generateOutfits, nameFor, replacementOptions, ruleMap, scoreOutfit } from "./engine";

export type StylistResult = {
  outfits: OutfitView[];
  source: OutfitSource | "mixed";
  notice: string | null;
  /** AI suggestions that failed validation and were discarded */
  rejected: number;
};

type Draft = { garmentIds: number[]; name: string; explanation: string; source: OutfitSource; warnings: string[] };

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function aiNotice(err: unknown): string {
  if (err instanceof AiUnavailableError) return `${capitalise(describeAiError(err))} – showing rule-based suggestions instead.`;
  return "Claude couldn't help this time – showing rule-based suggestions instead.";
}

function wantsAi(useAi: boolean | undefined): { ok: boolean; notice: string | null } {
  if (useAi === false) return { ok: false, notice: null };
  const s = aiStatus();
  if (s.enabled) return { ok: true, notice: null };
  return { ok: false, notice: s.reason === "not_configured" ? null : `${capitalise(REASON_TEXT[s.reason!])} – showing rule-based suggestions.` };
}

function recentLines(sc: StylistContext): string[] {
  const byId = new Map(sc.garments.map((g) => [g.id, g]));
  const from = addDays(sc.engine.date, -Math.max(sc.engine.profile.repetitionDays, 7));
  return listWearLogs({ limit: 40 })
    .filter((l) => l.date >= from && l.date <= sc.engine.date)
    .map((l) => `${l.date}: ${l.items.map((i) => (i.garmentId && byId.get(i.garmentId) ? `#${i.garmentId} ${byId.get(i.garmentId)!.name}` : i.snapshot.name)).join(", ")}`)
    .slice(0, 14);
}

function promptParts(sc: StylistContext, request: string): StylistPromptParts {
  const excluded = new Set([...(sc.engine.constraints.excludeIds ?? []), ...(sc.engine.constraints.avoidGarmentIds ?? [])]);
  const byId = new Map(sc.garments.map((g) => [g.id, g]));
  return {
    available: sc.garments.filter((g) => isAvailable(g.status) && !excluded.has(g.id) && !sc.engine.exhausted.has(g.id)),
    profile: sc.engine.profile,
    day: sc.day,
    rules: sc.ruleTexts,
    feedback: sc.feedbackNotes,
    recent: recentLines(sc),
    request,
    required: (sc.engine.constraints.requireIds ?? []).map((id) => byId.get(id)).filter((g): g is Garment => Boolean(g)),
    excluded: [...(sc.engine.constraints.excludeIds ?? [])].map((id) => byId.get(id)).filter((g): g is Garment => Boolean(g)),
    units: getSettings().units,
  };
}

function weatherLine(day: DayView) {
  const w = day.weather;
  if (w.source === "none" || w.low === null || w.high === null) return null;
  return `${w.summary}, ${Math.round(w.low)}–${Math.round(w.high)}°, rain ${Math.round(w.precipProbability)}%`;
}

function persist(drafts: Draft[], sc: StylistContext, request: string): OutfitView[] {
  return drafts.map((d) =>
    createOutfit({
      name: d.name,
      garmentIds: d.garmentIds,
      source: d.source,
      explanation: d.explanation,
      warnings: d.warnings,
      saved: false,
      context: {
        date: sc.engine.date,
        occasion: sc.engine.occasion,
        request: request || null,
        weather: weatherLine(sc.day),
        activities: sc.day.activities.map((a) => a.title),
      },
    }),
  );
}

function validateAiOutfits(raw: { name: string; garment_ids: number[]; explanation: string }[], sc: StylistContext, constraints: HardConstraints) {
  const byId = ruleMap(sc.garments);
  const valid: Draft[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const o of raw) {
    const ids = [...new Set(o.garment_ids)];
    const v = validateOutfit(o.garment_ids, byId, constraints);
    const exhausted = ids.filter((id) => sc.engine.exhausted.has(id));
    if (exhausted.length) v.errors.push(...exhausted.map((id) => `${byId.get(id)?.name} will need washing before then.`));
    const key = [...ids].sort((a, b) => a - b).join(",");
    if (!v.errors.length && seen.has(key)) v.errors.push("Duplicate of another suggestion.");
    if (v.errors.length) {
      errors.push(`"${o.name}": ${v.errors.join(" ")}`);
      continue;
    }
    seen.add(key);
    const gs = ids.map((id) => sc.garments.find((g) => g.id === id)!);
    valid.push({
      garmentIds: ids,
      name: o.name.trim().slice(0, 120) || nameFor(gs, sc.engine.occasion),
      explanation: o.explanation.trim().slice(0, 4000),
      source: "ai",
      warnings: scoreOutfit(gs, sc.engine).warnings,
    });
  }
  return { valid, errors };
}

function ruleDrafts(sc: StylistContext, count: number, avoid: Draft[] = []): Draft[] {
  const existing = new Set(avoid.map((d) => [...d.garmentIds].sort((a, b) => a - b).join(",")));
  return generateOutfits(sc.engine, count + avoid.length)
    .filter((c) => !existing.has([...c.garmentIds].sort((a, b) => a - b).join(",")))
    .slice(0, count)
    .map((c) => {
      const gs = c.garmentIds.map((id) => sc.garments.find((g) => g.id === id)!);
      return { garmentIds: c.garmentIds, name: nameFor(gs, sc.engine.occasion), explanation: describe(gs, c.reasons), source: "rules", warnings: c.warnings };
    });
}

function missingBasics(sc: StylistContext): string | null {
  const available = sc.garments.filter((g) => isAvailable(g.status));
  const slots = new Set(available.map((g) => slotFor(g)));
  const missing: string[] = [];
  if (!slots.has("footwear")) missing.push("shoes");
  if (!slots.has("bottom") && !slots.has("onepiece") && !slots.has("suit")) missing.push("trousers, a skirt or a dress");
  if (!available.some((g) => ["top", "onepiece"].includes(slotFor(g)) || g.category === "knitwear")) missing.push("a top");
  if (missing.length === 0) return null;
  return `To build a full outfit the wardrobe needs available ${missing.join(", ")}. Add garments or bring some back from the laundry.`;
}

function summarise(drafts: Draft[]): OutfitSource | "mixed" {
  const sources = new Set(drafts.map((d) => d.source));
  return sources.size > 1 ? "mixed" : (drafts[0]?.source ?? "rules");
}

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

export async function suggestOutfits(raw: StylistRequest): Promise<StylistResult> {
  const req = stylistRequestSchema.parse(raw);
  const date = req.date ?? today();
  const sc = await buildContext({ date, occasion: req.occasion, prompt: req.prompt, includeIds: req.includeGarmentIds, excludeIds: req.excludeGarmentIds });
  const missing = missingBasics(sc);
  if (missing) throw new BadRequestError(missing);
  for (const id of sc.engine.constraints.requireIds ?? []) {
    const g = sc.garments.find((x) => x.id === id);
    if (!g) throw new BadRequestError("A requested garment no longer exists.");
    if (!isAvailable(g.status)) throw new BadRequestError(`${g.name} isn't available right now, so it can't be styled.`);
  }
  const ai = wantsAi(req.useAi);
  let notice = ai.notice;
  let drafts: Draft[] = [];
  let rejected = 0;
  if (ai.ok) {
    try {
      const parts = promptParts(sc, req.prompt);
      const first = validateAiOutfits(await aiSuggestOutfits(parts, req.count), sc, sc.engine.constraints);
      drafts = first.valid;
      rejected += first.errors.length;
      if (drafts.length < req.count && first.errors.length) {
        const second = validateAiOutfits(await aiSuggestOutfits(parts, req.count - drafts.length, first.errors.join("\n")), sc, sc.engine.constraints);
        const keys = new Set(drafts.map((d) => d.garmentIds.slice().sort().join(",")));
        drafts.push(...second.valid.filter((d) => !keys.has(d.garmentIds.slice().sort().join(","))));
        rejected += second.errors.length;
      }
      if (rejected && drafts.length < req.count) notice = "Some of Claude's ideas broke your wardrobe rules and were replaced with rule-based picks.";
    } catch (err) {
      notice = aiNotice(err);
    }
  }
  if (drafts.length < req.count) drafts.push(...ruleDrafts(sc, req.count - drafts.length, drafts));
  if (drafts.length === 0) {
    throw new BadRequestError(
      "No outfit satisfies every rule with what's available. Try removing an exclusion, relaxing a 'never combine' rule, or bringing garments back from the laundry.",
    );
  }
  return { outfits: persist(drafts.slice(0, req.count), sc, req.prompt), source: summarise(drafts), notice, rejected };
}

export async function styleGarment(garmentId: number, useAi = true) {
  const sc = await buildContext({ date: today() });
  const g = sc.garments.find((x) => x.id === garmentId);
  if (!g) throw new BadRequestError("That garment doesn't exist.");
  return suggestOutfits({
    prompt: `Show different ways to style my ${g.name} – vary the mood and formality.`,
    includeGarmentIds: [garmentId],
    count: 3,
    useAi,
  });
}

/* ------------------------------------------------------------------ */
/* Weekly planning                                                     */
/* ------------------------------------------------------------------ */

type WeekState = { usage: Map<number, number>; recentWear: Map<number, string>; recentOutfits: number[][]; remaining: Map<number, number> };

function initialState(garments: Garment[]): WeekState {
  const defaults = getCareDefaults();
  const remaining = new Map<number, number>();
  for (const g of garments) {
    const { washAfterWears } = careFor(g, defaults);
    remaining.set(g.id, washAfterWears > 0 ? Math.max(0, washAfterWears - g.wearsSinceWash) : Infinity);
  }
  return { usage: new Map(), recentWear: new Map(), recentOutfits: [], remaining };
}

function consume(state: WeekState, ids: number[], date: string) {
  for (const id of ids) {
    state.usage.set(id, (state.usage.get(id) ?? 0) + 1);
    state.remaining.set(id, (state.remaining.get(id) ?? Infinity) - 1);
    const prev = state.recentWear.get(id);
    if (!prev || prev < date) state.recentWear.set(id, date);
  }
  state.recentOutfits.push(ids);
}

function exhaustedSet(state: WeekState) {
  return new Set([...state.remaining.entries()].filter(([, n]) => n <= 0).map(([id]) => id));
}

export type WeekResult = { planned: string[]; skipped: { date: string; reason: string }[]; source: OutfitSource | "mixed"; notice: string | null };

export async function planWeek(start: string, opts: { useAi?: boolean; request?: string } = {}): Promise<WeekResult> {
  const dates = weekDates(start);
  const t = today();
  const { days } = await getDays(dates);
  const skipped: { date: string; reason: string }[] = [];
  const toPlan: DayView[] = [];
  for (const d of days) {
    if (d.date < t) skipped.push({ date: d.date, reason: "in the past" });
    else if (d.worn) skipped.push({ date: d.date, reason: "already worn" });
    else if (d.plan?.locked && d.outfit) skipped.push({ date: d.date, reason: "locked" });
    else toPlan.push(d);
  }
  if (toPlan.length === 0) return { planned: [], skipped, source: "rules", notice: "Nothing to plan – every day this week is locked, worn or past." };

  const probe = await buildContext({ date: toPlan[0].date, day: toPlan[0], prompt: opts.request });
  const missing = missingBasics(probe);
  if (missing) throw new BadRequestError(missing);
  const state = initialState(probe.garments);
  // locked/fixed future days consume garments first
  const fixed = days.filter((d) => !toPlan.includes(d) && d.date >= t && d.outfit);
  for (const d of fixed) consume(state, outfitGarmentIds(d.outfit!.id), d.date);

  const ai = wantsAi(opts.useAi);
  let notice = ai.notice;
  const aiByDate = new Map<string, { name: string; garment_ids: number[]; explanation: string }>();
  if (ai.ok) {
    try {
      const parts = promptParts(probe, opts.request ?? "");
      const byId = new Map(probe.garments.map((g) => [g.id, g]));
      const out = await aiPlanWeek({
        ...parts,
        days: toPlan,
        fixed: fixed.map((d) => ({ date: d.date, garments: outfitGarmentIds(d.outfit!.id).map((id) => byId.get(id)).filter((g): g is Garment => Boolean(g)) })),
      });
      for (const o of out) aiByDate.set(o.date, o);
    } catch (err) {
      notice = aiNotice(err);
    }
  }

  const drafts: { date: string; draft: Draft; sc: StylistContext }[] = [];
  let rejected = 0;
  for (const day of toPlan) {
    const sc = await buildContext({
      date: day.date,
      day,
      prompt: opts.request,
      usage: state.usage,
      recentWear: state.recentWear,
      recentOutfits: state.recentOutfits,
      exhausted: exhaustedSet(state),
    });
    let draft: Draft | undefined;
    const proposal = aiByDate.get(day.date);
    if (proposal) {
      const { valid, errors } = validateAiOutfits([proposal], sc, sc.engine.constraints);
      draft = valid[0];
      rejected += errors.length;
    }
    if (!draft) draft = ruleDrafts(sc, 1)[0];
    if (!draft) {
      // allow pieces that would need washing rather than leaving the day empty
      sc.engine.exhausted = new Set();
      draft = ruleDrafts(sc, 1)[0];
      if (draft) draft.warnings.push("Assumes some laundry gets done mid-week.");
    }
    if (!draft) {
      skipped.push({ date: day.date, reason: "no valid outfit with what's available" });
      continue;
    }
    consume(state, draft.garmentIds, day.date);
    drafts.push({ date: day.date, draft, sc });
  }
  if (rejected && ai.ok) notice = `${rejected} of Claude's days broke a rule or the laundry schedule and were re-planned with the rule-based stylist.`;
  for (const { date, draft, sc } of drafts) {
    const [outfit] = persist([draft], sc, opts.request ?? "");
    setDayOutfit(date, outfit.id, { copySaved: false });
  }
  return { planned: drafts.map((d) => d.date), skipped, source: summarise(drafts.map((d) => d.draft)), notice };
}

/** Regenerate a single day; other days and locked selections are untouched. */
export async function regenerateDay(date: string, opts: { useAi?: boolean; request?: string } = {}): Promise<{ outfit: OutfitView; notice: string | null; source: OutfitSource }> {
  const plan = getPlanRow(date);
  if (plan?.locked) throw new ConflictError("This day is locked. Unlock it to regenerate.");
  if (plan?.wearLogId) throw new ConflictError("This day has already been worn.");
  const dates = weekDates(addDays(date, -3)).filter((d) => d !== date);
  const { days: around } = await getDays(dates);
  const state = initialState((await buildContext({ date })).garments);
  for (const d of around.filter((x) => x.outfit && !x.worn).sort((a, b) => a.date.localeCompare(b.date))) consume(state, outfitGarmentIds(d.outfit!.id), d.date);
  const sc = await buildContext({ date, prompt: opts.request, usage: state.usage, recentWear: state.recentWear, recentOutfits: state.recentOutfits });
  const previous = plan?.outfitId ? outfitGarmentIds(plan.outfitId) : [];
  if (previous.length) sc.engine.recentOutfits.push(previous);
  const missing = missingBasics(sc);
  if (missing) throw new BadRequestError(missing);
  const ai = wantsAi(opts.useAi);
  let notice = ai.notice;
  let draft: Draft | undefined;
  if (ai.ok) {
    try {
      const { valid } = validateAiOutfits(await aiSuggestOutfits(promptParts(sc, opts.request ?? "A fresh outfit for this day."), 2), sc, sc.engine.constraints);
      draft = valid.find((d) => d.garmentIds.slice().sort().join(",") !== previous.slice().sort().join(","));
    } catch (err) {
      notice = aiNotice(err);
    }
  }
  if (!draft) draft = ruleDrafts(sc, 1)[0];
  if (!draft) throw new BadRequestError("No valid outfit for this day with what's available.");
  const [outfit] = persist([draft], sc, opts.request ?? "");
  setDayOutfit(date, outfit.id, { copySaved: false });
  return { outfit: getOutfit(outfit.id), notice, source: draft.source };
}

/* ------------------------------------------------------------------ */
/* Replacement & adjustment                                            */
/* ------------------------------------------------------------------ */

function outfitDate(outfitId: number) {
  const o = getOutfitRecord(outfitId);
  return o.context?.date && o.context.date >= today() ? o.context.date : today();
}

export type ReplacementOption = { garmentId: number; reason: string; source: OutfitSource };

/** Suggest replacements for one garment. Nothing changes until one is applied. */
export async function replacementSuggestions(outfitId: number, garmentId: number, opts: { useAi?: boolean; instruction?: string } = {}) {
  const currentIds = outfitGarmentIds(outfitId);
  if (!currentIds.includes(garmentId)) throw new BadRequestError("That garment isn't part of this outfit.");
  const sc = await buildContext({ date: outfitDate(outfitId), prompt: opts.instruction });
  sc.engine.constraints.requireIds = [];
  const target = sc.garments.find((g) => g.id === garmentId);
  if (!target) throw new BadRequestError("That garment no longer exists.");
  const byId = ruleMap(sc.garments);
  const options: ReplacementOption[] = [];
  const ai = wantsAi(opts.useAi);
  let notice = ai.notice;
  if (ai.ok) {
    try {
      const current = currentIds.map((id) => sc.garments.find((g) => g.id === id)).filter((g): g is Garment => Boolean(g));
      const alts = await aiReplaceGarment({ ...promptParts(sc, ""), current, target, instruction: opts.instruction ?? "" });
      for (const a of alts) {
        const alt = byId.get(a.garment_id);
        if (!alt || !isAvailable(alt.status) || currentIds.includes(a.garment_id)) continue;
        const ids = currentIds.map((id) => (id === garmentId ? a.garment_id : id));
        const v = validateOutfit(ids, byId, { ...sc.engine.constraints, requireAvailable: false });
        if (!v.ok) continue;
        options.push({ garmentId: a.garment_id, reason: a.reason.slice(0, 400), source: "ai" });
      }
    } catch (err) {
      notice = aiNotice(err).replace("suggestions", "alternatives");
    }
  }
  for (const c of replacementOptions(sc.engine, currentIds, garmentId, 4)) {
    if (options.length >= 3) break;
    const newId = c.garmentIds.find((id) => !currentIds.includes(id));
    if (!newId || options.some((o) => o.garmentId === newId)) continue;
    options.push({ garmentId: newId, reason: c.reasons.slice(0, 2).join(" "), source: "rules" });
  }
  return { options: options.slice(0, 3), notice };
}

/** Apply a chosen replacement, after checking it keeps the outfit valid. */
export function applyReplacement(outfitId: number, garmentId: number, newGarmentId: number) {
  const currentIds = outfitGarmentIds(outfitId);
  if (!currentIds.includes(garmentId)) throw new BadRequestError("That garment isn't part of this outfit.");
  const ids = currentIds.map((id) => (id === garmentId ? newGarmentId : id));
  const all = buildRuleGarments();
  const target = all.get(newGarmentId);
  if (!target) throw new BadRequestError("That garment doesn't exist.");
  if (!isAvailable(target.status)) throw new BadRequestError(`${target.name} isn't available right now.`);
  const v = validateOutfit(ids, all, { requireAvailable: false });
  if (!v.ok) throw new BadRequestError(v.errors.join(" "));
  return replaceOutfitItem(outfitId, garmentId, newGarmentId);
}

function buildRuleGarments() {
  return ruleMap(loadGarments());
}

/** Create a new (unsaved) variation of an outfit. The original stays as it was. */
export async function adjust(outfitId: number, adjustment: Adjustment | null, opts: { useAi?: boolean; instruction?: string } = {}) {
  if (!adjustment && !opts.instruction) throw new BadRequestError("Say how to change the outfit.");
  const original = getOutfitRecord(outfitId);
  const currentIds = outfitGarmentIds(outfitId);
  const sc = await buildContext({ date: outfitDate(outfitId) });
  sc.engine.constraints.requireIds = [];
  const instruction = [adjustment ? `Make it ${ADJUSTMENT_LABELS[adjustment].toLowerCase()}.` : "", opts.instruction ?? ""].filter(Boolean).join(" ");
  const ai = wantsAi(opts.useAi);
  let notice = ai.notice;
  let draft: Draft | null = null;
  if (ai.ok) {
    try {
      const current = currentIds.map((id) => sc.garments.find((g) => g.id === id)).filter((g): g is Garment => Boolean(g));
      const out = await aiAdjustOutfit({ ...promptParts(sc, ""), current, instruction });
      const byId = ruleMap(sc.garments);
      const fresh = out.garment_ids.filter((id) => !currentIds.includes(id));
      const v = validateOutfit(out.garment_ids, byId, { ...sc.engine.constraints, requireAvailable: false });
      const freshOk = fresh.every((id) => byId.get(id) && isAvailable(byId.get(id)!.status));
      const changed = fresh.length > 0 || currentIds.some((id) => !out.garment_ids.includes(id));
      if (v.ok && freshOk && changed) {
        const gs = [...new Set(out.garment_ids)].map((id) => sc.garments.find((g) => g.id === id)!);
        draft = { garmentIds: gs.map((g) => g.id), name: out.name.slice(0, 120), explanation: out.explanation.slice(0, 4000), source: "ai", warnings: scoreOutfit(gs, sc.engine).warnings };
      }
    } catch (err) {
      notice = aiNotice(err);
    }
  }
  if (!draft && adjustment) {
    const c = adjustOutfit(sc.engine, currentIds, adjustment);
    if (c) {
      const gs = c.garmentIds.map((id) => sc.garments.find((g) => g.id === id)!);
      draft = { garmentIds: c.garmentIds, name: `${original.name} · ${ADJUSTMENT_LABELS[adjustment].toLowerCase()}`, explanation: describe(gs, c.reasons), source: "rules", warnings: c.warnings };
    }
  }
  if (!draft) {
    throw new BadRequestError(
      adjustment
        ? `Couldn't find a way to make this ${ADJUSTMENT_LABELS[adjustment].toLowerCase()} with what's available.`
        : "Claude isn't available, so free-text adjustments can't be made right now. Try one of the quick adjustments.",
    );
  }
  const created = createOutfit({
    name: draft.name,
    garmentIds: draft.garmentIds,
    source: draft.source,
    explanation: draft.explanation,
    warnings: draft.warnings,
    saved: false,
    basedOnOutfitId: original.id,
    context: { ...original.context, request: instruction },
  });
  return { outfit: created, notice };
}
