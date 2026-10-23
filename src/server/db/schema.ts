import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ActivitySetting,
  Category,
  DressCode,
  FeedbackKind,
  FeedbackScope,
  Fit,
  GarmentDetails,
  GarmentStatus,
  LayeringRole,
  OutfitSource,
  Pattern,
  RuleKind,
  Season,
  Slot,
  WeatherTag,
} from "@/lib/domain";
import type { Colour } from "@/lib/colours";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const garments = sqliteTable(
  "garments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    category: text("category").$type<Category>().notNull(),
    subcategory: text("subcategory"),
    colours: text("colours", { mode: "json" }).$type<Colour[]>().notNull().default(sql`'[]'`),
    pattern: text("pattern").$type<Pattern>().notNull().default("solid"),
    materials: text("materials", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    fit: text("fit").$type<Fit>(),
    silhouette: text("silhouette"),
    layeringRole: text("layering_role").$type<LayeringRole>(),
    warmth: integer("warmth").notNull().default(3),
    formality: integer("formality").notNull().default(3),
    seasons: text("seasons", { mode: "json" }).$type<Season[]>().notNull().default(sql`'[]'`),
    weather: text("weather", { mode: "json" }).$type<WeatherTag[]>().notNull().default(sql`'[]'`),
    occasions: text("occasions", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    styleTags: text("style_tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    brand: text("brand"),
    notes: text("notes"),
    details: text("details", { mode: "json" }).$type<GarmentDetails>().notNull().default(sql`'{}'`),
    status: text("status").$type<GarmentStatus>().notNull().default("clean"),
    statusChangedAt: text("status_changed_at"),
    wearCount: integer("wear_count").notNull().default(0),
    wearsSinceWash: integer("wears_since_wash").notNull().default(0),
    lastWornOn: text("last_worn_on"),
    /** null = use the category default */
    washAfterWears: integer("wash_after_wears"),
    needsIroning: integer("needs_ironing", { mode: "boolean" }),
    photoFile: text("photo_file"),
    illustrationSvg: text("illustration_svg"),
    illustrationKey: text("illustration_key"),
    source: text("source").notNull().default("manual"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("garments_category_idx").on(t.category), index("garments_status_idx").on(t.status)],
);

export const categoryCare = sqliteTable("category_care", {
  category: text("category").$type<Category>().primaryKey(),
  washAfterWears: integer("wash_after_wears").notNull(),
  needsIroning: integer("needs_ironing", { mode: "boolean" }).notNull().default(false),
});

export type OutfitContext = {
  date?: string | null;
  occasion?: string | null;
  request?: string | null;
  weather?: string | null;
  activities?: string[];
};

/** Which AI provider and model produced an outfit (null for rule-based and hand-made outfits). */
export type GeneratedBy = { provider: string; providerLabel: string; model: string };

export const outfits = sqliteTable(
  "outfits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    source: text("source").$type<OutfitSource>().notNull().default("manual"),
    explanation: text("explanation").notNull().default(""),
    context: text("context", { mode: "json" }).$type<OutfitContext>().notNull().default(sql`'{}'`),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    favourite: integer("favourite", { mode: "boolean" }).notNull().default(false),
    /** false = a suggestion or a planner-generated outfit that hasn't been saved to the collection */
    saved: integer("saved", { mode: "boolean" }).notNull().default(false),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    basedOnOutfitId: integer("based_on_outfit_id"),
    generatedBy: text("generated_by", { mode: "json" }).$type<GeneratedBy | null>(),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [index("outfits_saved_idx").on(t.saved, t.archived)],
);

/** Snapshot of the garment as it was when it was added to an outfit or wear log. */
export type GarmentSnapshot = {
  name: string;
  category: Category;
  subcategory: string | null;
  colours: Colour[];
  pattern: Pattern;
  materials?: string[];
  fit?: Fit | null;
  details?: GarmentDetails;
};

export const outfitItems = sqliteTable(
  "outfit_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    outfitId: integer("outfit_id")
      .notNull()
      .references(() => outfits.id, { onDelete: "cascade" }),
    garmentId: integer("garment_id").references(() => garments.id, { onDelete: "set null" }),
    slot: text("slot").$type<Slot>().notNull(),
    position: integer("position").notNull().default(0),
    snapshot: text("snapshot", { mode: "json" }).$type<GarmentSnapshot>().notNull(),
  },
  (t) => [index("outfit_items_outfit_idx").on(t.outfitId), index("outfit_items_garment_idx").on(t.garmentId)],
);

export const dayPlans = sqliteTable("day_plans", {
  date: text("date").primaryKey(),
  outfitId: integer("outfit_id").references(() => outfits.id, { onDelete: "set null" }),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  weatherOverride: text("weather_override", { mode: "json" }).$type<{
    low: number;
    high: number;
    precipProbability: number;
    wind: number;
    summary?: string | null;
  } | null>(),
  wearLogId: integer("wear_log_id"),
  updatedAt: text("updated_at").notNull().default(now),
});

export const activities = sqliteTable(
  "activities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    title: text("title").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    dressCode: text("dress_code").$type<DressCode>().notNull().default("none"),
    setting: text("setting").$type<ActivitySetting>().notNull().default("indoor"),
    notes: text("notes"),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("activities_date_idx").on(t.date)],
);

export const wearLogs = sqliteTable(
  "wear_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    outfitId: integer("outfit_id").references(() => outfits.id, { onDelete: "set null" }),
    outfitName: text("outfit_name").notNull().default(""),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("wear_logs_date_idx").on(t.date)],
);

export const wearLogItems = sqliteTable(
  "wear_log_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    wearLogId: integer("wear_log_id")
      .notNull()
      .references(() => wearLogs.id, { onDelete: "cascade" }),
    garmentId: integer("garment_id").references(() => garments.id, { onDelete: "set null" }),
    snapshot: text("snapshot", { mode: "json" }).$type<GarmentSnapshot>().notNull(),
  },
  (t) => [index("wear_log_items_garment_idx").on(t.garmentId), index("wear_log_items_log_idx").on(t.wearLogId)],
);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  outfitId: integer("outfit_id").references(() => outfits.id, { onDelete: "set null" }),
  garmentIds: text("garment_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
  kind: text("kind").$type<FeedbackKind>().notNull(),
  scope: text("scope").$type<FeedbackScope>().notNull().default("one_off"),
  context: text("context"),
  note: text("note"),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull().default(now),
});

export const styleRules = sqliteTable("style_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").$type<RuleKind>().notNull(),
  garmentIds: text("garment_ids", { mode: "json" }).$type<number[]>().notNull().default(sql`'[]'`),
  colours: text("colours", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  text: text("text").notNull().default(""),
  permanent: integer("permanent", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  feedbackId: integer("feedback_id").references(() => feedback.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull().default(now),
});

export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).$type<unknown>().notNull(),
});

export const weatherCache = sqliteTable(
  "weather_cache",
  {
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    payload: text("payload", { mode: "json" }).$type<unknown>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.latitude, t.longitude] })],
);

export type Garment = typeof garments.$inferSelect;
export type NewGarment = typeof garments.$inferInsert;
export type Outfit = typeof outfits.$inferSelect;
export type OutfitItem = typeof outfitItems.$inferSelect;
export type DayPlan = typeof dayPlans.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type WearLog = typeof wearLogs.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type StyleRule = typeof styleRules.$inferSelect;
