import "server-only";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  dayPlans,
  garments,
  outfitItems,
  wearLogItems,
  wearLogs,
  type Garment,
  type GarmentSnapshot,
} from "@/server/db/schema";
import { garmentInputSchema, garmentPatchSchema, type GarmentInput } from "@/lib/schemas";
import {
  LAUNDRY_STATUSES,
  defaultLayeringRole,
  isAvailable,
  nextLaundryStatus,
  type Category,
  type GarmentStatus,
} from "@/lib/domain";
import { illustrationKey, renderGarmentSvg } from "@/lib/illustration/render";
import { hexToRgb } from "@/lib/colours";
import { NotFoundError } from "@/server/errors";
import { getCareDefaults, today } from "./settings";
import { deletePhotoFile } from "./photos";

export type GarmentView = Omit<Garment, "illustrationSvg"> & {
  available: boolean;
  care: { washAfterWears: number; needsIroning: boolean; custom: boolean };
};

const nowIso = () => new Date().toISOString();

export function careFor(g: Pick<Garment, "category" | "washAfterWears" | "needsIroning">, defaults = getCareDefaults()) {
  const d = defaults[g.category as Category];
  return {
    washAfterWears: g.washAfterWears ?? d.washAfterWears,
    needsIroning: g.needsIroning ?? d.needsIroning,
    custom: g.washAfterWears !== null || g.needsIroning !== null,
  };
}

export function toView(g: Garment, defaults = getCareDefaults()): GarmentView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { illustrationSvg, ...rest } = g;
  return { ...rest, available: isAvailable(g.status), care: careFor(g, defaults) };
}

export function snapshotOf(g: Garment): GarmentSnapshot {
  return {
    name: g.name,
    category: g.category,
    subcategory: g.subcategory,
    colours: g.colours,
    pattern: g.pattern,
    materials: g.materials,
    fit: g.fit,
    details: g.details,
  };
}

function illustrationFields(data: {
  name: string;
  category: Category;
  subcategory?: string | null;
  colours: Garment["colours"];
  pattern: Garment["pattern"];
  materials: string[];
  fit?: Garment["fit"];
  details: Garment["details"];
  layeringRole?: Garment["layeringRole"];
}) {
  return {
    illustrationSvg: renderGarmentSvg(data),
    illustrationKey: illustrationKey(data),
  };
}

/** Return the cached illustration, regenerating it if attributes or the renderer changed. */
export function garmentIllustration(id: number): { svg: string; key: string } {
  const db = getDb();
  const g = db.select().from(garments).where(eq(garments.id, id)).get();
  if (!g) throw new NotFoundError("Garment");
  const key = illustrationKey(g);
  if (g.illustrationSvg && g.illustrationKey === key) return { svg: g.illustrationSvg, key };
  const fields = illustrationFields(g);
  db.update(garments).set(fields).where(eq(garments.id, id)).run();
  return { svg: fields.illustrationSvg, key: fields.illustrationKey };
}

export function regenerateIllustration(id: number) {
  const db = getDb();
  const g = db.select().from(garments).where(eq(garments.id, id)).get();
  if (!g) throw new NotFoundError("Garment");
  const fields = illustrationFields(g);
  db.update(garments).set({ ...fields, updatedAt: nowIso() }).where(eq(garments.id, id)).run();
  return getGarment(id);
}

export type GarmentFilters = {
  q?: string;
  category?: string;
  status?: string;
  availability?: "available" | "unavailable";
  colour?: string;
  season?: string;
  tag?: string;
  formality?: number;
  sort?: "name" | "newest" | "oldest" | "most-worn" | "least-worn" | "last-worn" | "category";
  includeRetired?: boolean;
};

export function listGarments(filters: GarmentFilters = {}): GarmentView[] {
  const defaults = getCareDefaults();
  let rows = getDb().select().from(garments).all();
  if (!filters.includeRetired && filters.status !== "retired") rows = rows.filter((g) => g.status !== "retired");
  if (filters.category) rows = rows.filter((g) => g.category === filters.category);
  if (filters.status) rows = rows.filter((g) => g.status === filters.status);
  if (filters.availability === "available") rows = rows.filter((g) => isAvailable(g.status));
  if (filters.availability === "unavailable") rows = rows.filter((g) => !isAvailable(g.status));
  if (filters.season) rows = rows.filter((g) => g.seasons.length === 0 || g.seasons.includes(filters.season as never));
  if (filters.formality) rows = rows.filter((g) => g.formality === filters.formality);
  if (filters.colour) {
    const c = filters.colour.toLowerCase();
    rows = rows.filter((g) => g.colours.some((x) => x.name.toLowerCase().includes(c)));
  }
  if (filters.tag) {
    const t = filters.tag.toLowerCase();
    rows = rows.filter((g) => g.styleTags.includes(t) || g.occasions.includes(t));
  }
  if (filters.q) {
    const terms = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
    rows = rows.filter((g) => {
      const hay = [
        g.name,
        g.category,
        g.subcategory,
        g.brand,
        g.notes,
        g.pattern,
        g.fit,
        g.silhouette,
        ...g.colours.map((c) => c.name),
        ...g.materials,
        ...g.styleTags,
        ...g.occasions,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  const sort = filters.sort ?? "category";
  const byName = (a: Garment, b: Garment) => a.name.localeCompare(b.name);
  rows.sort((a, b) => {
    switch (sort) {
      case "name":
        return byName(a, b);
      case "newest":
        return b.id - a.id;
      case "oldest":
        return a.id - b.id;
      case "most-worn":
        return b.wearCount - a.wearCount || byName(a, b);
      case "least-worn":
        return a.wearCount - b.wearCount || byName(a, b);
      case "last-worn":
        return (b.lastWornOn ?? "").localeCompare(a.lastWornOn ?? "") || byName(a, b);
      default:
        return a.category.localeCompare(b.category) || byName(a, b);
    }
  });
  return rows.map((g) => toView(g, defaults));
}

export function getGarmentRecord(id: number): Garment {
  const g = getDb().select().from(garments).where(eq(garments.id, id)).get();
  if (!g) throw new NotFoundError("Garment");
  return g;
}

export function getGarment(id: number): GarmentView {
  return toView(getGarmentRecord(id));
}

export function getGarmentsByIds(ids: number[]): Garment[] {
  if (ids.length === 0) return [];
  return getDb().select().from(garments).where(inArray(garments.id, ids)).all();
}

export function createGarment(input: GarmentInput, source = "manual"): GarmentView {
  const data = garmentInputSchema.parse(input);
  const ts = nowIso();
  const row = getDb()
    .insert(garments)
    .values({
      ...data,
      subcategory: data.subcategory ?? null,
      fit: data.fit ?? null,
      silhouette: data.silhouette ?? null,
      layeringRole: data.layeringRole ?? defaultLayeringRole(data.category, data.subcategory),
      brand: data.brand ?? null,
      notes: data.notes ?? null,
      washAfterWears: data.washAfterWears ?? null,
      needsIroning: data.needsIroning ?? null,
      statusChangedAt: ts,
      source,
      createdAt: ts,
      updatedAt: ts,
      ...illustrationFields(data),
    })
    .returning()
    .get();
  return toView(row);
}

export function createGarments(inputs: GarmentInput[], source = "manual"): GarmentView[] {
  const db = getDb();
  return db.transaction(() => inputs.map((i) => createGarment(i, source)));
}

export function updateGarment(id: number, patch: Partial<GarmentInput>): GarmentView {
  const db = getDb();
  const existing = getGarmentRecord(id);
  const data = garmentPatchSchema.parse(patch);
  const merged = { ...existing, ...data } as Garment;
  const statusChanged = data.status !== undefined && data.status !== existing.status;
  const set: Partial<Garment> = {
    ...data,
    updatedAt: nowIso(),
    ...illustrationFields(merged),
  } as Partial<Garment>;
  if (statusChanged) {
    set.statusChangedAt = nowIso();
    if (data.status === "clean" && LAUNDRY_STATUSES.includes(existing.status)) set.wearsSinceWash = 0;
  }
  if ("layeringRole" in data && data.layeringRole === null) {
    set.layeringRole = defaultLayeringRole(merged.category, merged.subcategory);
  }
  db.update(garments).set(set).where(eq(garments.id, id)).run();
  return getGarment(id);
}

export function duplicateGarment(id: number): GarmentView {
  const g = getGarmentRecord(id);
  return createGarment(
    {
      name: `${g.name} (copy)`,
      category: g.category,
      subcategory: g.subcategory,
      colours: g.colours,
      pattern: g.pattern,
      materials: g.materials,
      fit: g.fit,
      silhouette: g.silhouette,
      layeringRole: g.layeringRole,
      warmth: g.warmth,
      formality: g.formality,
      seasons: g.seasons,
      weather: g.weather,
      occasions: g.occasions,
      styleTags: g.styleTags,
      brand: g.brand,
      notes: g.notes,
      details: g.details,
      washAfterWears: g.washAfterWears,
      needsIroning: g.needsIroning,
    },
    "duplicate",
  );
}

export function deleteGarment(id: number) {
  const g = getGarmentRecord(id);
  getDb().delete(garments).where(eq(garments.id, id)).run();
  if (g.photoFile) deletePhotoFile(g.photoFile);
}

export type AffectedPlan = { date: string; outfitId: number; garmentIds: number[]; locked: boolean };

/** Future (today onwards), not-yet-worn day plans whose outfit uses any of these garments. */
export function plansUsingGarments(ids: number[], from = today()): AffectedPlan[] {
  if (ids.length === 0) return [];
  const rows = getDb()
    .select({ date: dayPlans.date, outfitId: dayPlans.outfitId, locked: dayPlans.locked, garmentId: outfitItems.garmentId })
    .from(dayPlans)
    .innerJoin(outfitItems, eq(outfitItems.outfitId, dayPlans.outfitId))
    .where(and(gte(dayPlans.date, from), isNull(dayPlans.wearLogId), inArray(outfitItems.garmentId, ids)))
    .all();
  const byDate = new Map<string, AffectedPlan>();
  for (const r of rows) {
    const entry = byDate.get(r.date) ?? { date: r.date, outfitId: r.outfitId!, garmentIds: [], locked: r.locked };
    entry.garmentIds.push(r.garmentId!);
    byDate.set(r.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function setGarmentStatus(ids: number[], status: GarmentStatus) {
  const db = getDb();
  const ts = nowIso();
  const before = getGarmentsByIds(ids);
  // Coming back clean from the laundry resets the wear counter.
  const washed = status === "clean" ? before.filter((g) => LAUNDRY_STATUSES.includes(g.status)).map((g) => g.id) : [];
  db.transaction((tx) => {
    tx.update(garments)
      .set({ status, statusChangedAt: ts, updatedAt: ts })
      .where(and(inArray(garments.id, ids), ne(garments.status, status)))
      .run();
    if (washed.length) tx.update(garments).set({ wearsSinceWash: 0 }).where(inArray(garments.id, washed)).run();
  });
  const updated = getGarmentsByIds(ids).map((g) => toView(g));
  const affectedPlans = isAvailableStatus(status) ? [] : plansUsingGarments(ids);
  return { updated, affectedPlans };
}

function isAvailableStatus(s: GarmentStatus) {
  return isAvailable(s);
}

/** Move garments one step along the wash → dry → (iron) → clean workflow. */
export function advanceLaundry(ids: number[]) {
  const defaults = getCareDefaults();
  const groups = new Map<GarmentStatus, number[]>();
  for (const g of getGarmentsByIds(ids)) {
    const next = nextLaundryStatus(g.status, careFor(g, defaults).needsIroning);
    if (!next) continue;
    groups.set(next, [...(groups.get(next) ?? []), g.id]);
  }
  const affectedPlans: AffectedPlan[] = [];
  for (const [status, group] of groups) affectedPlans.push(...setGarmentStatus(group, status).affectedPlans);
  return { updated: getGarmentsByIds(ids).map((g) => toView(g, defaults)), affectedPlans };
}

export function wearHistory(id: number) {
  return getDb()
    .select({ id: wearLogs.id, date: wearLogs.date, outfitId: wearLogs.outfitId, outfitName: wearLogs.outfitName })
    .from(wearLogItems)
    .innerJoin(wearLogs, eq(wearLogs.id, wearLogItems.wearLogId))
    .where(eq(wearLogItems.garmentId, id))
    .orderBy(sql`${wearLogs.date} desc`)
    .all();
}

export function subcategorySuggestions(): Record<string, string[]> {
  const rows = getDb().selectDistinct({ category: garments.category, subcategory: garments.subcategory }).from(garments).all();
  const out: Record<string, string[]> = {};
  for (const r of rows) if (r.subcategory) (out[r.category] ??= []).push(r.subcategory);
  return out;
}

/* ------------------------------------------------------------------ */
/* Duplicate detection                                                 */
/* ------------------------------------------------------------------ */

const STOP = new Set(["the", "a", "an", "my", "with", "and", "of", "in"]);
function tokens(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !STOP.has(t)),
  );
}

function colourDistance(a: string, b: string) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441;
}

export type DuplicateMatch = { id: number; name: string; score: number };

export function duplicateScore(
  a: { name: string; category: string; subcategory?: string | null; colours?: { hex: string }[] },
  b: { name: string; category: string; subcategory?: string | null; colours?: { hex: string }[] },
) {
  if (a.category !== b.category) return 0;
  const ta = tokens(a.name);
  const tb = tokens(b.name);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size || 1;
  let score = 0.25 + 0.45 * (inter / union);
  if (a.subcategory && b.subcategory && a.subcategory.toLowerCase() === b.subcategory.toLowerCase()) score += 0.15;
  const ca = a.colours?.[0]?.hex;
  const cb = b.colours?.[0]?.hex;
  if (ca && cb) score += colourDistance(ca, cb) < 0.12 ? 0.15 : -0.1;
  return Math.max(0, Math.min(1, score));
}

export function findDuplicates(
  candidate: { name: string; category: string; subcategory?: string | null; colours?: { hex: string }[] },
  pool: Garment[] = getDb().select().from(garments).where(or(ne(garments.status, "retired"), isNull(garments.status))).all(),
): DuplicateMatch[] {
  return pool
    .map((g) => ({ id: g.id, name: g.name, score: duplicateScore(candidate, g) }))
    .filter((m) => m.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Fill only empty fields of an existing garment from an imported proposal (never overwrites). */
export function fillMissingFields(id: number, proposal: Partial<GarmentInput>): GarmentView {
  const g = getGarmentRecord(id);
  const patch: Partial<GarmentInput> = {};
  const emptyArr = (v: unknown[]) => v.length === 0;
  if (!g.subcategory && proposal.subcategory) patch.subcategory = proposal.subcategory;
  if (emptyArr(g.colours) && proposal.colours?.length) patch.colours = proposal.colours;
  if (g.pattern === "solid" && proposal.pattern && proposal.pattern !== "solid") patch.pattern = proposal.pattern;
  if (emptyArr(g.materials) && proposal.materials?.length) patch.materials = proposal.materials;
  if (!g.fit && proposal.fit) patch.fit = proposal.fit;
  if (!g.silhouette && proposal.silhouette) patch.silhouette = proposal.silhouette;
  if (emptyArr(g.seasons) && proposal.seasons?.length) patch.seasons = proposal.seasons;
  if (emptyArr(g.weather) && proposal.weather?.length) patch.weather = proposal.weather;
  if (emptyArr(g.occasions) && proposal.occasions?.length) patch.occasions = proposal.occasions;
  if (emptyArr(g.styleTags) && proposal.styleTags?.length) patch.styleTags = proposal.styleTags;
  if (!g.brand && proposal.brand) patch.brand = proposal.brand;
  if (!g.notes && proposal.notes) patch.notes = proposal.notes;
  if (Object.keys(g.details ?? {}).length === 0 && proposal.details && Object.keys(proposal.details).length) patch.details = proposal.details;
  if (Object.keys(patch).length === 0) return toView(g);
  return updateGarment(id, patch);
}
