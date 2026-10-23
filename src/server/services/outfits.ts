import "server-only";
import { and, desc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  dayPlans,
  feedback,
  outfitItems,
  outfits,
  wearLogs,
  type Feedback,
  type Garment,
  type Outfit,
  type OutfitContext,
  type OutfitItem,
} from "@/server/db/schema";
import { outfitPatchSchema } from "@/lib/schemas";
import { slotFor, type OutfitSource } from "@/lib/domain";
import { SLOT_ORDER, compositionErrors, sortBySlot } from "@/lib/outfit-rules";
import { BadRequestError, NotFoundError } from "@/server/errors";
import { getCareDefaults } from "./settings";
import { getGarmentsByIds, snapshotOf, toView, type GarmentView } from "./garments";

export type OutfitItemView = Omit<OutfitItem, "outfitId"> & {
  garment: GarmentView | null;
  /** the garment was deleted since this outfit was made */
  missing: boolean;
};

export type OutfitView = Outfit & {
  items: OutfitItemView[];
  /** availability / composition problems with the outfit as it stands now */
  issues: string[];
  unavailableGarmentIds: number[];
  feedback: Feedback[];
  timesWorn: number;
  lastWornOn: string | null;
};

const nowIso = () => new Date().toISOString();

export type NewOutfit = {
  name: string;
  garmentIds: number[];
  source: OutfitSource;
  explanation?: string;
  context?: OutfitContext;
  tags?: string[];
  warnings?: string[];
  saved?: boolean;
  favourite?: boolean;
  basedOnOutfitId?: number | null;
};

function itemRows(outfitId: number, gs: Garment[]) {
  return sortBySlot(gs).map((g, i) => ({
    outfitId,
    garmentId: g.id,
    slot: slotFor(g),
    position: SLOT_ORDER.indexOf(slotFor(g)) * 10 + i,
    snapshot: snapshotOf(g),
  }));
}

function requireGarments(ids: number[]) {
  const unique = [...new Set(ids)];
  const gs = getGarmentsByIds(unique);
  if (gs.length !== unique.length) {
    const found = new Set(gs.map((g) => g.id));
    throw new BadRequestError(`Unknown garment id(s): ${unique.filter((id) => !found.has(id)).join(", ")}`);
  }
  return gs;
}

export function createOutfit(input: NewOutfit): OutfitView {
  const db = getDb();
  const gs = requireGarments(input.garmentIds);
  const id = db.transaction((tx) => {
    const ts = nowIso();
    const row = tx
      .insert(outfits)
      .values({
        name: input.name.slice(0, 120) || "Untitled outfit",
        source: input.source,
        explanation: input.explanation ?? "",
        context: input.context ?? {},
        tags: input.tags ?? [],
        warnings: input.warnings ?? [],
        saved: input.saved ?? false,
        favourite: input.favourite ?? false,
        basedOnOutfitId: input.basedOnOutfitId ?? null,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning({ id: outfits.id })
      .get();
    tx.insert(outfitItems).values(itemRows(row.id, gs)).run();
    return row.id;
  });
  return getOutfit(id);
}

export function getOutfitRecord(id: number): Outfit {
  const o = getDb().select().from(outfits).where(eq(outfits.id, id)).get();
  if (!o) throw new NotFoundError("Outfit");
  return o;
}

export function outfitGarmentIds(id: number): number[] {
  return getDb()
    .select({ garmentId: outfitItems.garmentId })
    .from(outfitItems)
    .where(eq(outfitItems.outfitId, id))
    .all()
    .map((r) => r.garmentId)
    .filter((x): x is number => x !== null);
}

function hydrate(list: Outfit[]): OutfitView[] {
  if (list.length === 0) return [];
  const db = getDb();
  const ids = list.map((o) => o.id);
  const items = db.select().from(outfitItems).where(inArray(outfitItems.outfitId, ids)).orderBy(outfitItems.position).all();
  const gs = getGarmentsByIds([...new Set(items.map((i) => i.garmentId).filter((x): x is number => x !== null))]);
  const defaults = getCareDefaults();
  const byId = new Map(gs.map((g) => [g.id, toView(g, defaults)]));
  const fb = db.select().from(feedback).where(inArray(feedback.outfitId, ids)).orderBy(desc(feedback.createdAt)).all();
  const wear = db
    .select({ outfitId: wearLogs.outfitId, n: sql<number>`count(*)`, last: sql<string>`max(${wearLogs.date})` })
    .from(wearLogs)
    .where(inArray(wearLogs.outfitId, ids))
    .groupBy(wearLogs.outfitId)
    .all();
  return list.map((o) => {
    const its = items
      .filter((i) => i.outfitId === o.id)
      .map(({ outfitId: _o, ...i }) => {
        void _o;
        const garment = i.garmentId !== null ? (byId.get(i.garmentId) ?? null) : null;
        return { ...i, garment, missing: garment === null };
      });
    const issues: string[] = [];
    const unavailableGarmentIds: number[] = [];
    for (const it of its) {
      if (it.missing) issues.push(`${it.snapshot.name} has been removed from the wardrobe.`);
      else if (!it.garment!.available) {
        unavailableGarmentIds.push(it.garment!.id);
        issues.push(`${it.garment!.name} is currently unavailable.`);
      }
    }
    const present = its.filter((i) => i.garment).map((i) => i.garment!);
    if (its.every((i) => !i.missing)) issues.push(...compositionErrors(present));
    const w = wear.find((x) => x.outfitId === o.id);
    return {
      ...o,
      items: its,
      issues,
      unavailableGarmentIds,
      feedback: fb.filter((f) => f.outfitId === o.id),
      timesWorn: Number(w?.n ?? 0),
      lastWornOn: w?.last ?? null,
    };
  });
}

export function getOutfit(id: number): OutfitView {
  return hydrate([getOutfitRecord(id)])[0];
}

export function getOutfits(ids: number[]): OutfitView[] {
  if (ids.length === 0) return [];
  const rows = getDb().select().from(outfits).where(inArray(outfits.id, ids)).all();
  const map = new Map(hydrate(rows).map((o) => [o.id, o]));
  return ids.map((id) => map.get(id)).filter((o): o is OutfitView => Boolean(o));
}

export type OutfitFilters = { view?: "saved" | "favourites" | "archived" | "suggestions"; tag?: string; q?: string };

export function listOutfits(filters: OutfitFilters = {}): OutfitView[] {
  const db = getDb();
  const view = filters.view ?? "saved";
  const where =
    view === "archived"
      ? eq(outfits.archived, true)
      : view === "favourites"
        ? and(eq(outfits.favourite, true), eq(outfits.archived, false))
        : view === "suggestions"
          ? and(eq(outfits.saved, false), eq(outfits.archived, false))
          : and(eq(outfits.saved, true), eq(outfits.archived, false));
  let rows = db.select().from(outfits).where(where).orderBy(desc(outfits.updatedAt)).limit(200).all();
  if (filters.tag) rows = rows.filter((o) => o.tags.includes(filters.tag!.toLowerCase()));
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((o) => o.name.toLowerCase().includes(q) || o.explanation.toLowerCase().includes(q) || o.tags.some((t) => t.includes(q)));
  }
  return hydrate(rows);
}

export function updateOutfit(id: number, patch: unknown): OutfitView {
  const data = outfitPatchSchema.parse(patch);
  const db = getDb();
  getOutfitRecord(id);
  db.transaction((tx) => {
    const { garmentIds, ...fields } = data;
    tx.update(outfits)
      .set({ ...fields, updatedAt: nowIso() })
      .where(eq(outfits.id, id))
      .run();
    if (garmentIds) {
      const gs = requireGarments(garmentIds);
      tx.delete(outfitItems).where(eq(outfitItems.outfitId, id)).run();
      tx.insert(outfitItems).values(itemRows(id, gs)).run();
    }
  });
  return getOutfit(id);
}

/** Swap one garment, leaving every other item untouched. */
export function replaceOutfitItem(outfitId: number, oldGarmentId: number, newGarmentId: number): OutfitView {
  const db = getDb();
  getOutfitRecord(outfitId);
  const item = db
    .select()
    .from(outfitItems)
    .where(and(eq(outfitItems.outfitId, outfitId), eq(outfitItems.garmentId, oldGarmentId)))
    .get();
  if (!item) throw new BadRequestError("That garment isn't part of this outfit.");
  if (outfitGarmentIds(outfitId).includes(newGarmentId)) throw new BadRequestError("That garment is already in the outfit.");
  const [g] = requireGarments([newGarmentId]);
  db.transaction((tx) => {
    tx.update(outfitItems)
      .set({ garmentId: g.id, slot: slotFor(g), snapshot: snapshotOf(g) })
      .where(eq(outfitItems.id, item.id))
      .run();
    tx.update(outfits).set({ updatedAt: nowIso() }).where(eq(outfits.id, outfitId)).run();
  });
  return getOutfit(outfitId);
}

export function duplicateOutfit(id: number, opts: { saved?: boolean; name?: string } = {}): OutfitView {
  const o = getOutfitRecord(id);
  const ids = outfitGarmentIds(id);
  if (ids.length === 0) throw new BadRequestError("This outfit has no remaining garments to copy.");
  return createOutfit({
    name: opts.name ?? `${o.name} (copy)`,
    garmentIds: ids,
    source: o.source,
    explanation: o.explanation,
    context: o.context,
    tags: o.tags,
    saved: opts.saved ?? true,
    basedOnOutfitId: o.id,
  });
}

export function deleteOutfit(id: number) {
  getOutfitRecord(id);
  getDb().delete(outfits).where(eq(outfits.id, id)).run();
}

/** Remove stale unsaved suggestions that nothing refers to. */
export function pruneSuggestions(olderThanDays = 14) {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const referenced = [
    ...db.select({ id: dayPlans.outfitId }).from(dayPlans).all(),
    ...db.select({ id: wearLogs.outfitId }).from(wearLogs).all(),
    ...db.select({ id: feedback.outfitId }).from(feedback).all(),
  ]
    .map((r) => r.id)
    .filter((x): x is number => x !== null);
  const where = and(eq(outfits.saved, false), eq(outfits.favourite, false), lt(outfits.createdAt, cutoff));
  db.delete(outfits)
    .where(referenced.length ? and(where, notInArray(outfits.id, referenced)) : where)
    .run();
}

/** Delete an unsaved outfit if nothing references it (used when a plan replaces its outfit). */
export function discardIfOrphan(id: number | null | undefined) {
  if (!id) return;
  const db = getDb();
  const o = db.select().from(outfits).where(eq(outfits.id, id)).get();
  if (!o || o.saved || o.favourite) return;
  const used =
    db.select({ d: dayPlans.date }).from(dayPlans).where(eq(dayPlans.outfitId, id)).get() ||
    db.select({ id: wearLogs.id }).from(wearLogs).where(eq(wearLogs.outfitId, id)).get() ||
    db.select({ id: feedback.id }).from(feedback).where(eq(feedback.outfitId, id)).get();
  if (!used) db.delete(outfits).where(eq(outfits.id, id)).run();
}

/** Saved (non-archived) outfits that include a garment. */
export function outfitsWithGarment(garmentId: number, limit = 12): OutfitView[] {
  const db = getDb();
  const ids = db
    .selectDistinct({ id: outfitItems.outfitId })
    .from(outfitItems)
    .innerJoin(outfits, eq(outfits.id, outfitItems.outfitId))
    .where(and(eq(outfitItems.garmentId, garmentId), eq(outfits.saved, true), eq(outfits.archived, false)))
    .limit(limit)
    .all()
    .map((r) => r.id);
  return getOutfits(ids);
}
