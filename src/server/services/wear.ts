import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { dayPlans, garments, wearLogItems, wearLogs, type GarmentSnapshot } from "@/server/db/schema";
import { BadRequestError, NotFoundError } from "@/server/errors";
import { isDateString } from "@/lib/dates";
import { careFor, getGarmentsByIds, plansUsingGarments, snapshotOf, type AffectedPlan } from "./garments";
import { getCareDefaults } from "./settings";
import { getOutfitRecord, outfitGarmentIds } from "./outfits";

export type WearResult = {
  wearLogId: number;
  date: string;
  /** garments whose care threshold was reached and now await washing */
  markedForWash: { id: number; name: string }[];
  affectedPlans: AffectedPlan[];
};

export function recordWear(input: { garmentIds: number[]; date: string; outfitId?: number | null; notes?: string | null }): WearResult {
  if (!isDateString(input.date)) throw new BadRequestError("A valid date is required.");
  const ids = [...new Set(input.garmentIds)];
  if (ids.length === 0) throw new BadRequestError("Nothing to mark as worn.");
  const gs = getGarmentsByIds(ids);
  if (gs.length !== ids.length) throw new BadRequestError("Some of these garments no longer exist.");
  const outfit = input.outfitId ? getOutfitRecord(input.outfitId) : null;
  const defaults = getCareDefaults();
  const db = getDb();
  const markedForWash: { id: number; name: string }[] = [];

  const wearLogId = db.transaction((tx) => {
    const log = tx
      .insert(wearLogs)
      .values({ date: input.date, outfitId: outfit?.id ?? null, outfitName: outfit?.name ?? "", notes: input.notes ?? null })
      .returning({ id: wearLogs.id })
      .get();
    tx.insert(wearLogItems)
      .values(gs.map((g) => ({ wearLogId: log.id, garmentId: g.id, snapshot: snapshotOf(g) })))
      .run();
    const ts = new Date().toISOString();
    for (const g of gs) {
      const wears = g.wearsSinceWash + 1;
      const { washAfterWears } = careFor(g, defaults);
      const needsWash = washAfterWears > 0 && wears >= washAfterWears && g.status === "clean";
      if (needsWash) markedForWash.push({ id: g.id, name: g.name });
      tx.update(garments)
        .set({
          wearCount: g.wearCount + 1,
          wearsSinceWash: wears,
          lastWornOn: !g.lastWornOn || g.lastWornOn < input.date ? input.date : g.lastWornOn,
          updatedAt: ts,
          ...(needsWash ? { status: "worn" as const, statusChangedAt: ts } : {}),
        })
        .where(eq(garments.id, g.id))
        .run();
    }
    // Link to the day plan. What was planned stays as it was; the wear log records reality.
    const plan = tx.select().from(dayPlans).where(eq(dayPlans.date, input.date)).get();
    if (plan) {
      tx.update(dayPlans).set({ wearLogId: log.id, updatedAt: ts }).where(eq(dayPlans.date, input.date)).run();
    } else {
      tx.insert(dayPlans).values({ date: input.date, outfitId: outfit?.id ?? null, wearLogId: log.id }).run();
    }
    return log.id;
  });

  const affectedPlans = plansUsingGarments(markedForWash.map((g) => g.id)).filter((p) => p.date !== input.date);
  return { wearLogId, date: input.date, markedForWash, affectedPlans };
}

export function markOutfitWorn(outfitId: number, date: string, notes?: string | null): WearResult {
  const ids = outfitGarmentIds(outfitId);
  if (ids.length === 0) throw new BadRequestError("This outfit has no garments left in the wardrobe.");
  return recordWear({ garmentIds: ids, date, outfitId, notes });
}

/** Undo a wear entry: wear counters are reversed; laundry status is left for you to adjust. */
export function deleteWearLog(id: number) {
  const db = getDb();
  const log = db.select().from(wearLogs).where(eq(wearLogs.id, id)).get();
  if (!log) throw new NotFoundError("Wear log");
  const items = db.select().from(wearLogItems).where(eq(wearLogItems.wearLogId, id)).all();
  const ids = items.map((i) => i.garmentId).filter((x): x is number => x !== null);
  db.transaction((tx) => {
    tx.delete(wearLogs).where(eq(wearLogs.id, id)).run();
    tx.update(dayPlans).set({ wearLogId: null }).where(eq(dayPlans.wearLogId, id)).run();
    for (const g of getGarmentsByIds(ids)) {
      const last = tx
        .select({ d: sql<string | null>`max(${wearLogs.date})` })
        .from(wearLogItems)
        .innerJoin(wearLogs, eq(wearLogs.id, wearLogItems.wearLogId))
        .where(eq(wearLogItems.garmentId, g.id))
        .get();
      tx.update(garments)
        .set({
          wearCount: Math.max(0, g.wearCount - 1),
          wearsSinceWash: Math.max(0, g.wearsSinceWash - 1),
          lastWornOn: last?.d ?? null,
        })
        .where(eq(garments.id, g.id))
        .run();
    }
  });
}

export type WearLogView = {
  id: number;
  date: string;
  outfitId: number | null;
  outfitName: string;
  notes: string | null;
  items: { garmentId: number | null; snapshot: GarmentSnapshot }[];
};

export function listWearLogs(opts: { limit?: number; garmentId?: number } = {}): WearLogView[] {
  const db = getDb();
  let logs = db
    .select()
    .from(wearLogs)
    .orderBy(desc(wearLogs.date), desc(wearLogs.id))
    .limit(opts.limit ?? 60)
    .all();
  if (opts.garmentId) {
    const withGarment = new Set(
      db
        .select({ id: wearLogItems.wearLogId })
        .from(wearLogItems)
        .where(eq(wearLogItems.garmentId, opts.garmentId))
        .all()
        .map((r) => r.id),
    );
    logs = logs.filter((l) => withGarment.has(l.id));
  }
  if (logs.length === 0) return [];
  const items = db
    .select()
    .from(wearLogItems)
    .where(
      inArray(
        wearLogItems.wearLogId,
        logs.map((l) => l.id),
      ),
    )
    .all();
  return logs.map((l) => ({
    id: l.id,
    date: l.date,
    outfitId: l.outfitId,
    outfitName: l.outfitName,
    notes: l.notes,
    items: items.filter((i) => i.wearLogId === l.id).map((i) => ({ garmentId: i.garmentId, snapshot: i.snapshot })),
  }));
}

/** Garment ids worn within the last `days` days before `date` (inclusive of date). */
export function recentlyWorn(date: string, days: number): Map<number, string> {
  const db = getDb();
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const rows = db
    .select({ garmentId: wearLogItems.garmentId, date: wearLogs.date })
    .from(wearLogItems)
    .innerJoin(wearLogs, eq(wearLogs.id, wearLogItems.wearLogId))
    .where(sql`${wearLogs.date} >= ${from} and ${wearLogs.date} <= ${date}`)
    .all();
  const out = new Map<number, string>();
  for (const r of rows) {
    if (r.garmentId === null) continue;
    const prev = out.get(r.garmentId);
    if (!prev || prev < r.date) out.set(r.garmentId, r.date);
  }
  return out;
}
