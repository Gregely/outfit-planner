import "server-only";
import { z } from "zod";
import { notInArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import * as t from "@/server/db/schema";
import {
  CATEGORIES,
  FEEDBACK_KINDS,
  FEEDBACK_SCOPES,
  OUTFIT_SOURCES,
  PATTERNS,
  RULE_KINDS,
  SLOTS,
  type Category,
} from "@/lib/domain";
import { colourSchema, dateString, detailsSchema, garmentInputSchema, timeString, type GarmentInput } from "@/lib/schemas";
import { csvToObjects, toCsv } from "@/lib/csv";
import { toColour } from "@/lib/colours";
import { illustrationKey, renderGarmentSvg } from "@/lib/illustration/render";
import { BadRequestError } from "@/server/errors";
import { photoStore } from "@/server/platform/photo-store";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import { sniffImage, MAX_PHOTO_BYTES } from "./photos";
import { DEVICE_SETTING_KEYS } from "./settings";

export const BACKUP_VERSION = 1;

const id = z.number().int().positive();
const ts = z.string().max(40);
const photoName = z.string().regex(/^\d+-[0-9a-f-]{36}\.(jpg|png|webp)$/);

const snapshotSchema = z.object({
  name: z.string().max(120),
  category: z.enum(CATEGORIES),
  subcategory: z.string().max(60).nullable(),
  colours: z.array(colourSchema).max(6),
  pattern: z.enum(PATTERNS),
  materials: z.array(z.string().max(40)).max(8).optional(),
  fit: z.string().max(20).nullable().optional(),
  details: detailsSchema.optional(),
});

const garmentRow = garmentInputSchema.extend({
  id,
  statusChangedAt: ts.nullish(),
  wearCount: z.number().int().min(0).default(0),
  wearsSinceWash: z.number().int().min(0).default(0),
  lastWornOn: dateString.nullish(),
  photoFile: photoName.nullish(),
  source: z.string().max(30).default("restore"),
  createdAt: ts,
  updatedAt: ts,
});

export const backupSchema = z.object({
  app: z.literal("wardrobe-studio"),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.object({
    garments: z.array(garmentRow).max(10000),
    categoryCare: z
      .array(z.object({ category: z.enum(CATEGORIES), washAfterWears: z.number().int().min(0).max(100), needsIroning: z.boolean() }))
      .default([]),
    outfits: z
      .array(
        z.object({
          id,
          name: z.string().max(120),
          source: z.enum(OUTFIT_SOURCES),
          explanation: z.string().max(4000),
          context: z
            .object({
              date: z.string().nullish(),
              occasion: z.string().max(200).nullish(),
              request: z.string().max(2000).nullish(),
              weather: z.string().max(400).nullish(),
              activities: z.array(z.string().max(200)).optional(),
            })
            .default({}),
          tags: z.array(z.string().max(40)).max(20),
          warnings: z.array(z.string().max(400)).max(20).default([]),
          favourite: z.boolean(),
          saved: z.boolean(),
          archived: z.boolean(),
          basedOnOutfitId: z.number().int().nullable().default(null),
          generatedBy: z.object({ provider: z.string().max(60), providerLabel: z.string().max(80), model: z.string().max(200) }).nullable().default(null),
          createdAt: ts,
          updatedAt: ts,
        }),
      )
      .default([]),
    outfitItems: z
      .array(z.object({ id, outfitId: id, garmentId: id.nullable(), slot: z.enum(SLOTS), position: z.number().int(), snapshot: snapshotSchema }))
      .default([]),
    dayPlans: z
      .array(
        z.object({
          date: dateString,
          outfitId: id.nullable(),
          locked: z.boolean(),
          notes: z.string().max(1000).nullable(),
          weatherOverride: z
            .object({ low: z.number(), high: z.number(), precipProbability: z.number(), wind: z.number(), summary: z.string().max(80).nullish() })
            .nullable(),
          wearLogId: id.nullable(),
          updatedAt: ts,
        }),
      )
      .default([]),
    activities: z
      .array(
        z.object({
          id,
          date: dateString,
          title: z.string().max(120),
          startTime: timeString.nullable(),
          endTime: timeString.nullable(),
          dressCode: z.string().max(30),
          setting: z.enum(["indoor", "outdoor", "mixed"]),
          notes: z.string().max(500).nullable(),
          position: z.number().int(),
          createdAt: ts,
        }),
      )
      .default([]),
    wearLogs: z
      .array(z.object({ id, date: dateString, outfitId: id.nullable(), outfitName: z.string().max(120), notes: z.string().max(1000).nullable(), createdAt: ts }))
      .default([]),
    wearLogItems: z.array(z.object({ id, wearLogId: id, garmentId: id.nullable(), snapshot: snapshotSchema })).default([]),
    feedback: z
      .array(
        z.object({
          id,
          outfitId: id.nullable(),
          garmentIds: z.array(id).max(14),
          kind: z.enum(FEEDBACK_KINDS),
          scope: z.enum(FEEDBACK_SCOPES),
          context: z.string().max(200).nullable(),
          note: z.string().max(500).nullable(),
          expiresAt: dateString.nullable(),
          createdAt: ts,
        }),
      )
      .default([]),
    styleRules: z
      .array(
        z.object({
          id,
          kind: z.enum(RULE_KINDS),
          garmentIds: z.array(id).max(14),
          colours: z.array(z.string().max(40)).max(8),
          text: z.string().max(500),
          permanent: z.boolean(),
          expiresAt: dateString.nullable(),
          active: z.boolean(),
          feedbackId: id.nullable(),
          createdAt: ts,
        }),
      )
      .default([]),
    profile: z.record(z.string(), z.unknown()).nullable().default(null),
    settings: z.record(z.string(), z.unknown()).nullable().default(null),
  }),
  photos: z.record(photoName, z.string().max(MAX_PHOTO_BYTES * 2)).default({}),
});
export type Backup = z.infer<typeof backupSchema>;

/**
 * Everything about the wardrobe, as one JSON document. Device configuration (AI providers and
 * models) is deliberately left out, and API keys are never stored in the database at all.
 */
export async function exportBackup(opts: { includePhotos?: boolean } = {}): Promise<Backup> {
  const db = getDb();
  const garments = db
    .select()
    .from(t.garments)
    .all()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ illustrationSvg, illustrationKey: _k, ...g }) => g);
  const photos: Record<string, string> = {};
  if (opts.includePhotos !== false) {
    for (const g of garments) {
      if (!g.photoFile) continue;
      const data = await photoStore.read(g.photoFile);
      if (data) photos[g.photoFile] = bytesToBase64(data);
    }
  }
  const profileRow = db.select().from(t.profile).get();
  const settingsRow = db.select().from(t.settings).all().filter((r) => !DEVICE_SETTING_KEYS.includes(r.key));
  return {
    app: "wardrobe-studio",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      garments: garments as Backup["data"]["garments"],
      categoryCare: db.select().from(t.categoryCare).all(),
      outfits: db.select().from(t.outfits).all(),
      outfitItems: db.select().from(t.outfitItems).all() as Backup["data"]["outfitItems"],
      dayPlans: db.select().from(t.dayPlans).all(),
      activities: db.select().from(t.activities).all(),
      wearLogs: db.select().from(t.wearLogs).all(),
      wearLogItems: db.select().from(t.wearLogItems).all() as Backup["data"]["wearLogItems"],
      feedback: db.select().from(t.feedback).all(),
      styleRules: db.select().from(t.styleRules).all(),
      profile: (profileRow?.data as Record<string, unknown>) ?? null,
      settings: Object.fromEntries(settingsRow.map((r) => [r.key, r.value])),
    },
    photos,
  };
}

/**
 * Replace all data with a validated backup. Runs in one transaction: all or nothing. This
 * device's AI configuration is kept, and any device keys in an older backup are ignored.
 */
export async function restoreBackup(raw: unknown) {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError("That file isn't a valid Wardrobe Studio backup.", parsed.error.issues.slice(0, 8));
  }
  const b = parsed.data;
  const d = b.data;
  const db = getDb();
  // Validate photos before touching anything.
  const photos: [string, Uint8Array][] = [];
  for (const [name, b64] of Object.entries(b.photos)) {
    let buf: Uint8Array;
    try {
      buf = base64ToBytes(b64);
    } catch {
      continue;
    }
    if (buf.length > MAX_PHOTO_BYTES || !sniffImage(buf)) continue;
    photos.push([name, buf]);
  }
  try {
    db.transaction((tx) => {
      for (const table of [
        t.styleRules,
        t.feedback,
        t.wearLogItems,
        t.wearLogs,
        t.dayPlans,
        t.activities,
        t.outfitItems,
        t.outfits,
        t.garments,
        t.profile,
        t.weatherCache,
      ]) {
        tx.delete(table).run();
      }
      tx.delete(t.settings).where(notInArray(t.settings.key, DEVICE_SETTING_KEYS)).run();
      for (const g of d.garments) {
        const fields = {
          ...g,
          subcategory: g.subcategory ?? null,
          fit: g.fit ?? null,
          silhouette: g.silhouette ?? null,
          layeringRole: g.layeringRole ?? null,
          brand: g.brand ?? null,
          notes: g.notes ?? null,
          washAfterWears: g.washAfterWears ?? null,
          needsIroning: g.needsIroning ?? null,
          statusChangedAt: g.statusChangedAt ?? null,
          lastWornOn: g.lastWornOn ?? null,
          photoFile: g.photoFile ?? null,
        };
        tx.insert(t.garments)
          .values({ ...fields, illustrationSvg: renderGarmentSvg(fields), illustrationKey: illustrationKey(fields) })
          .run();
      }
      for (const c of d.categoryCare) {
        tx.insert(t.categoryCare).values(c).onConflictDoUpdate({ target: t.categoryCare.category, set: c }).run();
      }
      if (d.outfits.length) tx.insert(t.outfits).values(d.outfits).run();
      if (d.outfitItems.length) tx.insert(t.outfitItems).values(d.outfitItems as (typeof t.outfitItems.$inferInsert)[]).run();
      if (d.wearLogs.length) tx.insert(t.wearLogs).values(d.wearLogs).run();
      if (d.wearLogItems.length) tx.insert(t.wearLogItems).values(d.wearLogItems as (typeof t.wearLogItems.$inferInsert)[]).run();
      if (d.dayPlans.length) tx.insert(t.dayPlans).values(d.dayPlans).run();
      if (d.activities.length) tx.insert(t.activities).values(d.activities as (typeof t.activities.$inferInsert)[]).run();
      if (d.feedback.length) tx.insert(t.feedback).values(d.feedback).run();
      if (d.styleRules.length) tx.insert(t.styleRules).values(d.styleRules).run();
      if (d.profile) tx.insert(t.profile).values({ id: 1, data: d.profile }).run();
      for (const [key, value] of Object.entries(d.settings ?? {})) {
        if (!DEVICE_SETTING_KEYS.includes(key)) tx.insert(t.settings).values({ key, value }).run();
      }
    });
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError(`The backup couldn't be restored: ${(err as Error).message}`);
  }
  for (const [name, buf] of photos) await photoStore.write(name, buf);
  return { garments: d.garments.length, outfits: d.outfits.length, wearLogs: d.wearLogs.length, photos: photos.length };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export const CSV_COLUMNS = [
  "id",
  "name",
  "category",
  "subcategory",
  "colours",
  "pattern",
  "materials",
  "fit",
  "silhouette",
  "layering_role",
  "warmth",
  "formality",
  "seasons",
  "weather",
  "occasions",
  "style_tags",
  "brand",
  "notes",
  "status",
  "wash_after_wears",
  "needs_ironing",
  "wear_count",
  "last_worn_on",
];

export function exportGarmentsCsv(): string {
  const rows = getDb()
    .select()
    .from(t.garments)
    .all()
    .map((g) => [
      g.id,
      g.name,
      g.category,
      g.subcategory,
      g.colours.map((c) => `${c.name} (${c.hex})`).join("; "),
      g.pattern,
      g.materials.join("; "),
      g.fit,
      g.silhouette,
      g.layeringRole,
      g.warmth,
      g.formality,
      g.seasons.join("; "),
      g.weather.join("; "),
      g.occasions.join("; "),
      g.styleTags.join("; "),
      g.brand,
      g.notes,
      g.status,
      g.washAfterWears,
      g.needsIroning === null ? "" : g.needsIroning ? "yes" : "no",
      g.wearCount,
      g.lastWornOn,
    ]);
  return toCsv(CSV_COLUMNS, rows);
}

const list = (s: string | undefined) =>
  (s ?? "")
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean);

function parseColours(s: string | undefined) {
  return list(s).map((part) => {
    const m = part.match(/^(.*?)\s*\((#[0-9a-f]{6})\)\s*$/i);
    return m ? toColour(m[1] || m[2], m[2]) : toColour(part);
  });
}

function intOr(s: string | undefined, fallback: number | undefined) {
  const v = Number.parseInt(s ?? "", 10);
  return Number.isFinite(v) ? v : fallback;
}

export type CsvProposal = { row: number; input: GarmentInput | null; errors: string[]; sourceId?: number };

/** Parse a garment CSV into proposals for the review screen. Nothing is saved here. */
export function parseGarmentsCsv(text: string): CsvProposal[] {
  const objects = csvToObjects(text);
  if (objects.length === 0) throw new BadRequestError("The CSV is empty or has no header row.");
  if (!("name" in objects[0]) || !("category" in objects[0])) throw new BadRequestError('The CSV needs at least "name" and "category" columns.');
  return objects.slice(0, 2000).map((o, i) => {
    const category = o.category?.toLowerCase() as Category;
    const candidate = {
      name: o.name,
      category,
      subcategory: o.subcategory || null,
      colours: parseColours(o.colours ?? o.colour ?? o.color),
      pattern: (o.pattern || "solid").toLowerCase(),
      materials: list(o.materials ?? o.material),
      fit: o.fit ? o.fit.toLowerCase() : null,
      silhouette: o.silhouette || null,
      layeringRole: o.layering_role ? o.layering_role.toLowerCase() : null,
      warmth: intOr(o.warmth, 3),
      formality: intOr(o.formality, 3),
      seasons: list(o.seasons).map((s) => s.toLowerCase()),
      weather: list(o.weather).map((s) => s.toLowerCase()),
      occasions: list(o.occasions),
      styleTags: list(o.style_tags ?? o.tags),
      brand: o.brand || null,
      notes: o.notes || null,
      status: (o.status || "clean").toLowerCase(),
      washAfterWears: o.wash_after_wears ? intOr(o.wash_after_wears, undefined) : null,
      needsIroning: o.needs_ironing ? /^(y|yes|true|1)$/i.test(o.needs_ironing) : null,
    };
    const parsed = garmentInputSchema.safeParse(candidate);
    const sourceId = intOr(o.id, undefined);
    if (!parsed.success) {
      return { row: i + 2, input: null, errors: parsed.error.issues.map((x) => `${x.path.join(".") || "row"}: ${x.message}`), sourceId };
    }
    return { row: i + 2, input: parsed.data as GarmentInput, errors: [], sourceId };
  });
}
