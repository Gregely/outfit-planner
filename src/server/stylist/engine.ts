/**
 * Deterministic, rule-based stylist. Used when Claude is unavailable, to repair or top up
 * AI suggestions, and for item replacement / adjustments. Given the same inputs it always
 * returns the same outfits. No database access here: the caller builds the context.
 */
import type { Garment } from "@/server/db/schema";
import type { Profile, Adjustment } from "@/lib/schemas";
import type { WeatherNeeds } from "@/lib/weather";
import {
  FORMALITY_LABELS,
  coversTorso,
  isAvailable,
  slotFor,
  type Season,
  type Slot,
} from "@/lib/domain";
import { harmonyScore, isNeutral } from "@/lib/colours";
import { validateOutfit, sortBySlot, type HardConstraints, type RuleGarment } from "@/lib/outfit-rules";

export type EngineContext = {
  garments: Garment[];
  date: string;
  season: Season;
  needs: WeatherNeeds;
  targetFormality: number;
  occasion: string | null;
  profile: Profile;
  constraints: HardConstraints;
  /** garment id → most recent date worn (or planned earlier in the same plan) */
  recentWear: Map<number, string>;
  /** garment sets worn recently, to avoid repeating whole outfits */
  recentOutfits: number[][];
  dislikedCombos: { ids: number[]; weight: number }[];
  lovedCombos: number[][];
  uncomfortable: Set<number>;
  /** planned uses of each garment within the current planning run */
  usage: Map<number, number>;
  /** garments that would need washing before they can be worn again in this run */
  exhausted: Set<number>;
  /** garments the user asked to see more of ("prefer" rules) */
  preferred?: Set<number>;
  /** optional extra objective used by adjustments */
  bonus?: (gs: Garment[]) => number;
};

export type Candidate = { garmentIds: number[]; score: number; reasons: string[]; warnings: string[] };

const BOLD_PATTERNS = new Set(["check", "plaid", "gingham", "houndstooth", "polka-dot", "floral", "paisley", "camo", "graphic", "fair-isle", "colour-block", "stripes"]);

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function outfitWarmth(gs: Pick<Garment, "category" | "subcategory" | "layeringRole" | "warmth">[]) {
  let w = 0;
  for (const g of gs) {
    const s = slotFor(g);
    if (s === "top" || s === "mid" || s === "outer" || s === "onepiece" || s === "suit") w += g.warmth;
    else if (s === "bottom") w += g.warmth * 0.5;
  }
  return w;
}

function avgFormality(gs: Garment[]) {
  const core = gs.filter((g) => slotFor(g) !== "accessory");
  return core.length ? core.reduce((s, g) => s + g.formality, 0) / core.length : 3;
}

const text = (g: Garment) => `${g.name} ${g.subcategory ?? ""} ${g.materials.join(" ")}`.toLowerCase();

function hasTag(g: Garment, tags: string[]) {
  return tags.some((t) => g.styleTags.includes(t) || g.occasions.includes(t));
}

/** Per-garment suitability, used to prune the search and as part of the outfit score. */
export function itemScore(g: Garment, ctx: EngineContext): number {
  const slot = slotFor(g);
  const n = ctx.needs;
  let s = 0;
  const fw = slot === "accessory" ? 0.3 : 0.9;
  s -= Math.abs(g.formality - ctx.targetFormality) * fw;
  if (g.seasons.length && !g.seasons.includes(ctx.season)) s -= ctx.needs.known ? 0.8 : 1.8;
  if (n.rainy && g.weather.includes("avoid-rain")) s -= 2.5;
  if (n.rainy && slot === "footwear" && /suede|canvas/.test(text(g))) s -= 1.5;
  if (n.rainy && slot === "outer" && (g.weather.includes("waterproof") || g.weather.includes("water-resistant"))) s += 1.5;
  if (n.snowy && slot === "footwear" && /boot/.test(text(g))) s += 1;
  if (n.windy && slot === "outer" && g.weather.includes("windproof")) s += 0.7;
  if (n.hot && g.warmth >= 4 && slot !== "accessory" && slot !== "footwear") s -= 2;
  if (n.hot && g.weather.includes("breathable")) s += 0.5;
  if (n.hot && slot === "footwear" && /boot/.test(text(g))) s -= 1;
  if (n.cold && slot === "outer") s += g.warmth >= 4 ? 1 : -0.5;
  if (n.cold && (g.category === "shorts" || /sandal/.test(text(g)))) s -= 3;
  if (!n.hot && n.known && g.category === "shorts" && n.feelsMax < 19) s -= 2;
  if (n.cold && g.weather.includes("insulated")) s += 0.6;
  // personal preferences (soft)
  const p = ctx.profile;
  const colourNames = g.colours.map((c) => c.name.toLowerCase());
  if (p.favouriteColours.some((c) => colourNames.some((n) => n.includes(c)))) s += 0.35;
  if (p.avoidedColours.some((c) => colourNames.some((n) => n.includes(c)))) s -= 1.2;
  if (p.aesthetics.length && hasTag(g, p.aesthetics)) s += 0.4;
  if (p.preferredFits.length && g.fit && p.preferredFits.includes(g.fit)) s += 0.25;
  if (p.favouriteMaterials.some((m) => g.materials.some((x) => x.includes(m)))) s += 0.2;
  if (p.avoidedMaterials.some((m) => g.materials.some((x) => x.includes(m)))) s -= 1;
  if (ctx.occasion && g.occasions.some((o) => ctx.occasion!.includes(o) || o.includes(ctx.occasion!))) s += 0.5;
  if (ctx.uncomfortable.has(g.id)) s -= 0.5 + p.comfortPriority * 0.3;
  if (ctx.preferred?.has(g.id)) s += 0.7;
  // rotation: rest recently worn pieces (shoes, coats and accessories repeat happily)
  const rests = slot === "footwear" || slot === "outer" || slot === "accessory" ? 0 : p.garmentRestDays;
  const last = ctx.recentWear.get(g.id);
  if (last && rests > 0) {
    const since = daysBetween(last, ctx.date);
    if (since >= 0 && since <= rests) s -= 1.6 * (1 - since / (rests + 1));
  }
  const uses = ctx.usage.get(g.id) ?? 0;
  if (uses > 0) s -= (slot === "outer" ? 0.25 : slot === "footwear" ? 0.55 : 0.9) * uses;
  // gentle nudge towards under-used pieces
  s += Math.max(0, 0.3 - g.wearCount * 0.02);
  return s;
}

/** Full outfit score and the reasons behind it. Assumes the outfit already passed validation. */
export function scoreOutfit(gs: Garment[], ctx: EngineContext): { score: number; reasons: string[]; warnings: string[] } {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = gs.reduce((s, g) => s + itemScore(g, ctx), 0) / Math.max(1, gs.length) * 3;
  const ids = new Set(gs.map((g) => g.id));
  const n = ctx.needs;

  // formality cohesion
  const core = gs.filter((g) => slotFor(g) !== "accessory");
  const f = avgFormality(gs);
  const spread = Math.max(...core.map((g) => g.formality)) - Math.min(...core.map((g) => g.formality));
  score -= Math.abs(f - ctx.targetFormality) * 1.2;
  if (spread >= 3) score -= (spread - 2) * 0.9;
  const hasSuitOrBlazer = gs.some((g) => slotFor(g) === "suit" || /blazer|sport coat|suit/.test(text(g)));
  const tee = gs.find((g) => g.category === "tops" && /t-shirt|tee|tank/.test(text(g)));
  if (hasSuitOrBlazer && tee && ctx.targetFormality >= 3.8) score -= 1.5;
  if (gs.some((g) => slotFor(g) === "suit") && gs.some((g) => g.category === "shirts")) score += 0.8;
  // a roll neck over a collared shirt bunches at the neck – a practical clash, so only a mild penalty
  const turtleneck = gs.some((g) => /turtle|roll ?neck|polo neck/.test(text(g)));
  if (turtleneck && gs.some((g) => slotFor(g) === "top" && g.category === "shirts")) score -= 1.2;
  // shorts don't go with heavy layers
  const shorts = gs.some((g) => g.category === "shorts");
  if (shorts && gs.some((g) => g.warmth >= 4 && ["mid", "outer"].includes(slotFor(g)))) score -= 3;
  if (shorts && ctx.targetFormality >= 3) score -= 1.5;

  // warmth vs weather
  const warmth = outfitWarmth(gs);
  const diff = warmth - n.targetWarmth;
  score -= Math.abs(diff) * 0.45;
  const outer = gs.find((g) => slotFor(g) === "outer");
  const availableOuter = ctx.garments.some((g) => slotFor(g) === "outer" && isAvailable(g.status));
  if (n.needsOuter && !outer && availableOuter) {
    score -= 3;
    warnings.push("No coat, although the weather calls for one.");
  }
  if (n.hot && outer) score -= 2.5;
  if (n.rainy && outer && !(outer.weather.includes("waterproof") || outer.weather.includes("water-resistant"))) {
    const better = ctx.garments.some((g) => slotFor(g) === "outer" && isAvailable(g.status) && (g.weather.includes("waterproof") || g.weather.includes("water-resistant")));
    if (better) score -= 0.8;
  }
  if (n.swing) {
    const removable = gs.some((g) => slotFor(g) === "mid" || slotFor(g) === "outer");
    if (removable) score += 0.6;
  }
  for (const g of gs) {
    if (n.rainy && g.weather.includes("avoid-rain")) warnings.push(`${g.name} doesn't love rain.`);
  }

  // colour & pattern
  const hexes = gs.filter((g) => slotFor(g) !== "accessory").flatMap((g) => g.colours.slice(0, 1).map((c) => c.hex));
  const harmony = harmonyScore(hexes);
  const boldness = ctx.profile.boldness;
  // colour clashes matter less to someone who has said they like bold looks
  score += (harmony - 1) * (boldness >= 4 ? 1.5 : boldness === 3 ? 3 : 4);
  const bold = gs.filter((g) => BOLD_PATTERNS.has(g.pattern) && slotFor(g) !== "accessory").length;
  if (bold > 1) score -= (bold - 1) * (boldness >= 4 ? 0.6 : 1.6);
  const accents = hexes.filter((h) => !isNeutral(h)).length;
  if (boldness <= 2 && accents > 1) score -= (accents - 1) * 0.5;
  if (boldness >= 4 && accents === 0) score -= 0.4;

  // whole-outfit memory
  for (const d of ctx.dislikedCombos) if (d.ids.length && d.ids.every((id) => ids.has(id))) score -= d.weight;
  for (const l of ctx.lovedCombos) if (l.length >= 2 && l.every((id) => ids.has(id))) score += 1;
  // compare the core of the outfit (tops, layers, bottoms) – changing only shoes isn't a new look
  const coreOf = (xs: number[]) =>
    xs.filter((id) => {
      const g = ctx.garments.find((x) => x.id === id);
      return g && ["top", "mid", "bottom", "onepiece", "suit"].includes(slotFor(g));
    });
  const mine = coreOf([...ids]);
  for (const r of ctx.recentOutfits) {
    const theirs = coreOf(r);
    const overlap = theirs.filter((id) => ids.has(id)).length;
    if (theirs.length && overlap / Math.max(theirs.length, mine.length) >= 0.75) score -= 2.5;
  }
  if (ctx.bonus) score += ctx.bonus(gs);

  // reasons
  reasons.push(`Pitched at ${FORMALITY_LABELS[Math.round(f)]?.toLowerCase() ?? "smart casual"}${ctx.occasion ? ` for ${withArticle(ctx.occasion)}` : ""}.`);
  if (n.known) {
    const layers = gs.filter((g) => ["mid", "outer"].includes(slotFor(g)));
    if (n.cold || n.needsOuter) reasons.push(`Feels like ${Math.round(n.feelsMin)}–${Math.round(n.feelsMax)}°${layers.length ? `, so the ${listJoin(layers.map((g) => inline(g.name)))} add${layers.length === 1 ? "s" : ""} warmth` : ""}.`);
    else if (n.hot) reasons.push(`Kept light for up to ${Math.round(n.feelsMax)}°.`);
    else if (n.swing && layers.length) reasons.push(`${layers[0].name} comes off as it warms up.`);
    if (n.rainy && outer && (outer.weather.includes("waterproof") || outer.weather.includes("water-resistant"))) reasons.push(`${outer.name} handles the rain.`);
  }
  const palette = [...new Set(gs.filter((g) => slotFor(g) !== "accessory").map((g) => colourWord(g)).filter(Boolean))].slice(0, 4);
  if (palette.length)
    reasons.push(`${harmony >= 0.9 ? "A calm palette" : "A palette"} of ${listJoin(palette)}${accents === 1 ? " with a single accent" : accents > 1 ? " with a few accents" : ""}.`);
  const fresh = gs.filter((g) => !g.lastWornOn && slotFor(g) !== "accessory");
  if (fresh.length) reasons.push(`Gives the ${inline(fresh[0].name)} its first outing.`);
  return { score, reasons, warnings };
}

const NO_ARTICLE = /^(a|an|the|my|work|college|uni|university|school|class|travel|sport|church|brunch|lunch|dinner|drinks|errands)\b/;

/** "Date" → "a date", "Evening out" → "an evening out", "Work" → "work". */
export function withArticle(occasion: string) {
  const o = occasion.trim().toLowerCase();
  if (NO_ARTICLE.test(o)) return o;
  return /^[aeiou]/.test(o) ? `an ${o}` : `a ${o}`;
}

function listJoin(xs: string[]) {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function toRule(g: Garment): RuleGarment {
  return { id: g.id, name: g.name, category: g.category, subcategory: g.subcategory, layeringRole: g.layeringRole, status: g.status, colours: g.colours };
}

export function ruleMap(garments: Garment[]) {
  return new Map(garments.map((g) => [g.id, toRule(g)]));
}

function topK<T>(xs: T[], k: number, score: (x: T) => number) {
  return xs
    .map((x) => ({ x, s: score(x) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((e) => e.x);
}

function usable(ctx: EngineContext, extraExclude: Set<number> = new Set()) {
  const excluded = new Set([...(ctx.constraints.excludeIds ?? []), ...(ctx.constraints.avoidGarmentIds ?? []), ...extraExclude]);
  return ctx.garments.filter((g) => isAvailable(g.status) && !excluded.has(g.id) && !ctx.exhausted.has(g.id));
}

function bySlot(gs: Garment[]) {
  const out: Record<Slot, Garment[]> = { top: [], mid: [], outer: [], bottom: [], onepiece: [], suit: [], footwear: [], accessory: [] };
  for (const g of gs) out[slotFor(g)].push(g);
  return out;
}

/** Pick helpful accessories for the finished outfit. */
function accessorise(base: Garment[], pool: Garment[], ctx: EngineContext, forced: Garment[]): Garment[] {
  const out = [...base, ...forced];
  const kinds = new Set(forced.map((a) => (a.subcategory ?? a.name).toLowerCase()));
  const n = ctx.needs;
  const shoes = base.find((g) => slotFor(g) === "footwear");
  const hasCollar =
    base.some((g) => g.category === "shirts" && slotFor(g) === "top") && !base.some((g) => /turtle|roll ?neck|polo neck|hood/.test(text(g)));
  const hasTrousers = base.some((g) => slotFor(g) === "bottom" && g.category === "trousers") || base.some((g) => slotFor(g) === "suit");
  const wants = (a: Garment): number => {
    const t = text(a);
    if (/scarf|glove|beanie|mitten/.test(t)) return n.cold || (n.known && n.feelsMin < 8) ? 2 : -5;
    if (/tie/.test(t)) return ctx.targetFormality >= 4 && hasCollar ? 2 : -5;
    if (/belt/.test(t)) {
      if (!hasTrousers || ctx.targetFormality < 2.5) return -5;
      const match = shoes && shoes.colours[0] && a.colours[0] && Math.abs(lum(shoes.colours[0].hex) - lum(a.colours[0].hex)) < 0.25;
      return match ? 1.2 : 0.2;
    }
    if (/sunglasses/.test(t)) return n.known && !n.rainy && (n.hot || n.feelsMax > 16) ? 0.5 : -5;
    if (/watch/.test(t)) return ctx.targetFormality >= 2.5 ? 0.6 : 0.2;
    if (/cap|hat|fedora/.test(t)) return n.rainy || n.hot ? 0.3 : -1;
    if (/bag|backpack|tote|satchel/.test(t)) return ctx.occasion && /college|work|travel/.test(ctx.occasion) ? 0.8 : -1;
    return -1;
  };
  const ranked = pool
    .filter((a) => !out.some((o) => o.id === a.id))
    .map((a) => ({ a, s: wants(a) + itemScore(a, ctx) * 0.3 }))
    .filter((e) => e.s > 0.3)
    .sort((x, y) => y.s - x.s);
  let added = 0;
  for (const { a } of ranked) {
    const k = (a.subcategory ?? a.name).toLowerCase();
    if (kinds.has(k) || added >= 2) continue;
    kinds.add(k);
    out.push(a);
    added++;
  }
  return out;
}

function lum(hex: string) {
  const h = hex.replace("#", "");
  return (parseInt(h.slice(0, 2), 16) * 0.299 + parseInt(h.slice(2, 4), 16) * 0.587 + parseInt(h.slice(4, 6), 16) * 0.114) / 255;
}

function jaccard(a: number[], b: number[]) {
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / new Set([...a, ...b]).size;
}

/** Generate up to `count` valid, distinct outfits, best first. */
export function generateOutfits(ctx: EngineContext, count = 3): Candidate[] {
  const byId = ruleMap(ctx.garments);
  const pool = usable(ctx);
  const slots = bySlot(pool);
  const required = (ctx.constraints.requireIds ?? []).map((id) => ctx.garments.find((g) => g.id === id)).filter((g): g is Garment => Boolean(g));
  const req = bySlot(required);
  const K = 6;
  const s = (g: Garment) => itemScore(g, ctx);

  const lowers = req.bottom.length + req.onepiece.length + req.suit.length
    ? [...req.bottom, ...req.onepiece, ...req.suit].slice(0, 1)
    : topK([...slots.bottom, ...slots.onepiece, ...slots.suit], K, s);
  const tops = req.top.length ? [req.top.slice(0, 2)] : [[] as Garment[], ...topK(slots.top, K, s).map((g) => [g])];
  const midSingles = topK(slots.mid, 4, s);
  const midPairs: Garment[][] = [];
  for (let i = 0; i < midSingles.length; i++)
    for (let j = i + 1; j < midSingles.length; j++)
      if (midSingles[i].category !== midSingles[j].category) midPairs.push([midSingles[i], midSingles[j]]);
  let mids: Garment[][] = [[], ...midSingles.map((g) => [g]), ...midPairs];
  if (req.mid.length) mids = mids.filter((m) => req.mid.every((r) => m.some((x) => x.id === r.id))).concat(req.mid.length <= 2 ? [req.mid] : []);
  const outers = req.outer.length ? [req.outer.slice(0, 1)] : [[] as Garment[], ...topK(slots.outer, 3, s).map((g) => [g])];
  const shoes = req.footwear.length ? req.footwear.slice(0, 1) : topK(slots.footwear, 4, s);
  if (lowers.length === 0 || shoes.length === 0) return [];

  const seen = new Set<string>();
  const scored: Candidate[] = [];
  for (const lower of lowers) {
    for (const top of tops) {
      for (const mid of mids) {
        if (mid.some((m) => m.id === lower.id)) continue;
        for (const outer of outers) {
          for (const shoe of shoes) {
            const base = [lower, ...top, ...mid, ...outer, shoe];
            if (!base.some((g) => coversTorso(g))) continue;
            const key = base.map((g) => g.id).sort((a, b) => a - b).join(",");
            if (seen.has(key)) continue;
            seen.add(key);
            const v = validateOutfit(base.map((g) => g.id), byId, { ...ctx.constraints, requireIds: (ctx.constraints.requireIds ?? []).filter((id) => slotFor(byId.get(id)!) !== "accessory") });
            if (!v.ok) continue;
            const { score, reasons, warnings } = scoreOutfit(base, ctx);
            scored.push({ garmentIds: base.map((g) => g.id), score, reasons, warnings });
          }
        }
      }
    }
  }
  scored.sort((a, b) => b.score - a.score || a.garmentIds.join(",").localeCompare(b.garmentIds.join(",")));
  // Prefer ideas that differ in at least two core pieces (tops, layers, bottoms) from every earlier pick.
  const coreIds = (ids: number[]) => ids.filter((id) => ["top", "mid", "bottom", "onepiece", "suit"].includes(slotFor(ctx.garments.find((g) => g.id === id)!)));
  const differs = (a: number[], b: number[]) => {
    const ca = coreIds(a);
    const cb = new Set(coreIds(b));
    return ca.filter((id) => !cb.has(id)).length + [...cb].filter((id) => !ca.includes(id)).length;
  };
  const picked: Candidate[] = [];
  for (const c of scored) {
    if (picked.length >= count) break;
    if (picked.some((p) => differs(p.garmentIds, c.garmentIds) < 3 || jaccard(p.garmentIds, c.garmentIds) > 0.55)) continue;
    picked.push(c);
  }
  for (const c of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(c) && !picked.some((p) => jaccard(p.garmentIds, c.garmentIds) > 0.55)) picked.push(c);
  }
  // fall back to near-duplicates if the wardrobe is small
  for (const c of scored) {
    if (picked.length >= count) break;
    if (!picked.includes(c) && !picked.some((p) => jaccard(p.garmentIds, c.garmentIds) > 0.85)) picked.push(c);
  }
  return picked.map((c) => {
    const base = c.garmentIds.map((id) => ctx.garments.find((g) => g.id === id)!);
    const full = accessorise(base, slots.accessory, ctx, req.accessory);
    const ids = sortBySlot(full).map((g) => g.id);
    const check = validateOutfit(ids, byId, ctx.constraints);
    return check.ok ? { ...c, garmentIds: ids } : c;
  });
}

/** Ranked same-slot alternatives for one garment, keeping every other item. */
export function replacementOptions(ctx: EngineContext, currentIds: number[], garmentId: number, k = 3): Candidate[] {
  const target = ctx.garments.find((g) => g.id === garmentId);
  if (!target) return [];
  const slot = slotFor(target);
  const byId = ruleMap(ctx.garments);
  const others = currentIds.filter((id) => id !== garmentId);
  const options = usable(ctx, new Set(currentIds)).filter((g) => {
    const gs = slotFor(g);
    if (gs === slot) return true;
    // a lower can be swapped for any lower; a torso piece for another torso piece
    if (["bottom", "onepiece", "suit"].includes(slot) && ["bottom", "onepiece", "suit"].includes(gs)) return true;
    return false;
  });
  const results: Candidate[] = [];
  for (const g of options) {
    const ids = [...others, g.id];
    const v = validateOutfit(ids, byId, { ...ctx.constraints, requireAvailable: false });
    if (!v.ok) continue;
    const gs = ids.map((id) => ctx.garments.find((x) => x.id === id)!);
    const { score, reasons, warnings } = scoreOutfit(gs, ctx);
    results.push({ garmentIds: sortBySlot(gs).map((x) => x.id), score, reasons: [`${g.name} replaces ${target.name}.`, ...reasons], warnings });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, k);
}

const COMFY = /jersey|fleece|knit|cotton|cashmere|merino|sweat|hood|jogger|sneaker|trainer|loafer/;
const STIFF = /suit|tux|dress shirt|oxford shoes|brogue|tie|tailored|raw denim|leather jacket/;

export function adjustmentContext(ctx: EngineContext, current: Garment[], adj: Adjustment): EngineContext {
  const f = avgFormality(current);
  const w = outfitWarmth(current);
  switch (adj) {
    case "smarter":
      return { ...ctx, targetFormality: Math.min(5, Math.max(ctx.targetFormality, f) + 1) };
    case "more_casual":
      return { ...ctx, targetFormality: Math.max(1, Math.min(ctx.targetFormality, f) - 1) };
    case "warmer":
      return { ...ctx, needs: { ...ctx.needs, targetWarmth: w + 3, needsOuter: ctx.needs.needsOuter || w + 3 > 9, hot: false } };
    case "cooler":
      return { ...ctx, needs: { ...ctx.needs, targetWarmth: Math.max(1.5, w - 3), needsOuter: false, cold: false } };
    case "more_comfortable":
      return {
        ...ctx,
        targetFormality: Math.max(1, Math.min(ctx.targetFormality, f) - 0.5),
        bonus: (gs) =>
          gs.reduce((s, g) => {
            const t = text(g);
            let b = 0;
            if (g.fit === "relaxed" || g.fit === "oversized") b += 0.8;
            if (g.fit === "skinny" || g.fit === "tailored") b -= 0.6;
            if (COMFY.test(t)) b += 0.5;
            if (STIFF.test(t)) b -= 0.8;
            if (ctx.uncomfortable.has(g.id)) b -= 1.5;
            return s + b;
          }, 0),
      };
    case "bolder":
      return {
        ...ctx,
        profile: { ...ctx.profile, boldness: 5 },
        bonus: (gs) => gs.reduce((s, g) => s + (g.colours[0] && !isNeutral(g.colours[0].hex) ? 0.9 : 0) + (BOLD_PATTERNS.has(g.pattern) ? 0.7 : 0), 0),
      };
    case "quieter":
      return {
        ...ctx,
        profile: { ...ctx.profile, boldness: 1 },
        bonus: (gs) => gs.reduce((s, g) => s + (g.colours[0] && isNeutral(g.colours[0].hex) ? 0.6 : -0.6) + (g.pattern === "solid" ? 0.3 : -0.4), 0),
      };
  }
}

/** Change as few garments as possible to move the outfit in the requested direction. */
export function adjustOutfit(ctx: EngineContext, currentIds: number[], adj: Adjustment): Candidate | null {
  const current = currentIds.map((id) => ctx.garments.find((g) => g.id === id)).filter((g): g is Garment => Boolean(g));
  if (current.length === 0) return null;
  const actx = adjustmentContext(ctx, current, adj);
  const byId = ruleMap(ctx.garments);
  const pool = usable(ctx);
  const evaluate = (ids: number[]) => {
    const v = validateOutfit(ids, byId, { ...ctx.constraints, requireAvailable: false });
    if (!v.ok) return null;
    const fresh = ids.filter((id) => !currentIds.includes(id));
    if (fresh.some((id) => !isAvailable(byId.get(id)!.status))) return null;
    const gs = ids.map((id) => ctx.garments.find((g) => g.id === id)!);
    const changed = fresh.length + currentIds.filter((id) => !ids.includes(id)).length;
    return { ids, score: scoreOutfit(gs, actx).score - changed * 0.35 };
  };
  const neighbours = (ids: number[]) => {
    const out: number[][] = [];
    const gs = ids.map((id) => ctx.garments.find((g) => g.id === id)!);
    for (const g of gs) {
      const slot = slotFor(g);
      for (const alt of pool) {
        if (ids.includes(alt.id)) continue;
        if (slotFor(alt) === slot) out.push(ids.map((x) => (x === g.id ? alt.id : x)));
      }
      if (slot === "mid" || slot === "outer" || slot === "accessory") out.push(ids.filter((x) => x !== g.id));
    }
    for (const alt of pool) {
      if (ids.includes(alt.id)) continue;
      const slot = slotFor(alt);
      if (slot === "mid" || slot === "outer" || slot === "accessory") out.push([...ids, alt.id]);
    }
    return out;
  };
  const start = evaluate(currentIds.filter((id) => byId.has(id))) ?? { ids: currentIds, score: -Infinity };
  let best = start;
  for (let step = 0; step < 2; step++) {
    let improved = false;
    for (const ids of neighbours(best.ids)) {
      const e = evaluate(ids);
      if (e && e.score > best.score + 0.05) {
        best = e;
        improved = true;
      }
    }
    if (!improved) break;
  }
  if (best.ids.length === currentIds.length && best.ids.every((id) => currentIds.includes(id))) return null;
  const gs = best.ids.map((id) => ctx.garments.find((g) => g.id === id)!);
  const scored = scoreOutfit(gs, actx);
  const added = gs.filter((g) => !currentIds.includes(g.id)).map((g) => g.name);
  const removed = current.filter((g) => !best.ids.includes(g.id)).map((g) => g.name);
  const change = [added.length ? `Adds ${listJoin(added)}` : "", removed.length ? `${added.length ? "in place of" : "Drops"} ${listJoin(removed)}` : ""]
    .filter(Boolean)
    .join(" ");
  return { garmentIds: sortBySlot(gs).map((g) => g.id), score: scored.score, reasons: [`${change}.`, ...scored.reasons], warnings: scored.warnings };
}

/* ------------------------------------------------------------------ */
/* Naming & explanation                                                */
/* ------------------------------------------------------------------ */

function colourWord(g: Garment) {
  return (g.colours[0]?.name ?? "").split(/,| almost | with /)[0].trim();
}

/** Lower-case the first letter of a garment name inside a sentence, unless it looks like a proper noun. */
function inline(name: string) {
  return /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

function shortName(g: Garment) {
  const colour = colourWord(g);
  const noun = g.subcategory || g.name;
  return colour && !noun.toLowerCase().includes(colour.toLowerCase()) ? `${colour} ${noun}` : noun;
}

export function nameFor(gs: Garment[], occasion?: string | null) {
  const pick = (slots: Slot[]) => sortBySlot(gs).find((g) => slots.includes(slotFor(g)));
  const lead = pick(["suit", "mid"]) ?? pick(["top", "onepiece"]) ?? pick(["outer"]);
  const second = pick(["bottom"]) ?? pick(["top"]) ?? pick(["footwear"]);
  const core = [lead, second].filter((g, i, arr): g is Garment => Boolean(g) && arr.indexOf(g) === i).map(shortName).join(" & ");
  const name = core ? core.charAt(0).toUpperCase() + core.slice(1) : "Outfit";
  return occasion ? `${name} · ${occasion.toLowerCase()}` : name;
}

export function describe(gs: Garment[], reasons: string[]) {
  const ordered = sortBySlot(gs);
  const part = (s: Slot[]) => ordered.filter((g) => s.includes(slotFor(g))).map((g) => inline(g.name));
  const layers = part(["outer", "mid", "suit"]);
  const base = part(["top", "onepiece"]);
  const lower = part(["bottom"]);
  const shoes = part(["footwear"]);
  const acc = part(["accessory"]);
  let first: string;
  if (base.length && layers.length) first = `${listJoin(layers)} over ${listJoin(base)}`;
  else if (layers.length > 1) first = `${listJoin(layers.slice(0, -1))} over ${layers[layers.length - 1]}`;
  else first = listJoin([...layers, ...base]);
  if (lower.length) first += ` with ${listJoin(lower)}`;
  if (shoes.length) first += `${lower.length ? " and" : " with"} ${listJoin(shoes)}`;
  if (acc.length) first += `, finished with ${listJoin(acc)}`;
  return [`${first.charAt(0).toUpperCase()}${first.slice(1)}.`, ...reasons].join(" ");
}
