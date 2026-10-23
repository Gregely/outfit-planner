/**
 * Hard constraints every recommended outfit must satisfy. These checks are pure so they
 * can run on the server before anything is shown, in tests, and in the outfit builder UI.
 */
import { STATUS_LABELS, coversTorso, isAvailable, slotFor, type Category, type GarmentStatus, type LayeringRole, type Slot } from "./domain";

export type RuleGarment = {
  id: number;
  name: string;
  category: Category;
  subcategory: string | null;
  layeringRole: LayeringRole | null;
  status: GarmentStatus;
  colours: { name: string; hex: string }[];
};

export type HardConstraints = {
  /** garments that must appear (e.g. "style my blazer") */
  requireIds?: number[];
  /** garments excluded for this request */
  excludeIds?: number[];
  /** permanent "never combine" rules: all garments in a group may not appear together */
  neverCombine?: number[][];
  /** permanent "avoid this garment" rules */
  avoidGarmentIds?: number[];
  /** permanent "avoid colour" rules (matched against colour names) */
  avoidColours?: string[];
  /** set false to allow unavailable garments (manual outfits, history) */
  requireAvailable?: boolean;
};

export const SLOT_ORDER: Slot[] = ["outer", "suit", "mid", "top", "onepiece", "bottom", "footwear", "accessory"];

export function slotCounts(gs: Pick<RuleGarment, "category" | "subcategory" | "layeringRole">[]) {
  const counts: Record<Slot, number> = { top: 0, mid: 0, outer: 0, bottom: 0, onepiece: 0, suit: 0, footwear: 0, accessory: 0 };
  for (const g of gs) counts[slotFor(g)]++;
  return counts;
}

/** Structural problems: missing shoes, two pairs of trousers, nothing on the torso… */
export function compositionErrors(gs: RuleGarment[]): string[] {
  const errors: string[] = [];
  const c = slotCounts(gs);
  const lower = c.bottom + c.onepiece + c.suit;
  if (lower === 0) errors.push("Needs trousers, shorts, a skirt, a dress or a suit.");
  if (lower > 1) errors.push("Has more than one bottom / dress / suit.");
  if (!gs.some((g) => coversTorso(g))) errors.push("Needs a top (or a jumper / dress) to cover the torso.");
  if (c.footwear === 0) errors.push("Needs one pair of shoes.");
  if (c.footwear > 1) errors.push("Has more than one pair of shoes.");
  if (c.outer > 1) errors.push("Has more than one coat.");
  if (c.mid + c.suit > 2) errors.push("Has more than two mid layers.");
  if (c.top > 2) errors.push("Has more than two base tops.");
  const accessories = gs.filter((g) => slotFor(g) === "accessory");
  if (accessories.length > 4) errors.push("Has more than four accessories.");
  const accKinds = new Map<string, number>();
  for (const a of accessories) {
    const k = (a.subcategory ?? a.name).toLowerCase();
    accKinds.set(k, (accKinds.get(k) ?? 0) + 1);
  }
  for (const [k, n] of accKinds) if (n > 1) errors.push(`Has more than one ${k}.`);
  return errors;
}

export type ValidationResult = { ok: boolean; errors: string[]; garments: RuleGarment[] };

export function validateOutfit(ids: number[], byId: Map<number, RuleGarment>, constraints: HardConstraints = {}): ValidationResult {
  const errors: string[] = [];
  const seen = new Set<number>();
  const garments: RuleGarment[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id)) {
      errors.push(`"${String(id)}" is not a garment id.`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`Garment #${id} is listed twice.`);
      continue;
    }
    seen.add(id);
    const g = byId.get(id);
    if (!g) {
      errors.push(`Garment #${id} does not exist in the wardrobe.`);
      continue;
    }
    garments.push(g);
  }
  if (constraints.requireAvailable !== false) {
    for (const g of garments) {
      if (!isAvailable(g.status)) errors.push(`${g.name} is not available (${STATUS_LABELS[g.status].toLowerCase()}).`);
    }
  }
  for (const id of constraints.excludeIds ?? []) {
    const g = byId.get(id);
    if (seen.has(id)) errors.push(`${g?.name ?? `#${id}`} was excluded for this request.`);
  }
  for (const id of constraints.avoidGarmentIds ?? []) {
    if (seen.has(id)) errors.push(`${byId.get(id)?.name ?? `#${id}`} is on your avoid list.`);
  }
  for (const id of constraints.requireIds ?? []) {
    if (!seen.has(id)) errors.push(`${byId.get(id)?.name ?? `#${id}`} was requested but is missing.`);
  }
  for (const group of constraints.neverCombine ?? []) {
    if (group.length >= 2 && group.every((id) => seen.has(id))) {
      errors.push(`${group.map((id) => byId.get(id)?.name ?? `#${id}`).join(" + ")} are marked "never combine".`);
    }
  }
  const avoidColours = (constraints.avoidColours ?? []).map((c) => c.toLowerCase());
  if (avoidColours.length) {
    for (const g of garments) {
      const hit = g.colours.find((c) => avoidColours.some((a) => c.name.toLowerCase().includes(a)));
      if (hit) errors.push(`${g.name} is ${hit.name}, a colour you avoid.`);
    }
  }
  errors.push(...compositionErrors(garments));
  return { ok: errors.length === 0, errors, garments };
}

export function sortBySlot<T extends Pick<RuleGarment, "category" | "subcategory" | "layeringRole">>(gs: T[]): T[] {
  return [...gs].sort((a, b) => SLOT_ORDER.indexOf(slotFor(a)) - SLOT_ORDER.indexOf(slotFor(b)));
}
