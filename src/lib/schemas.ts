import { z } from "zod";
import {
  CATEGORIES,
  CLOSURES,
  COLLARS,
  DRESS_CODES,
  FEEDBACK_KINDS,
  FEEDBACK_SCOPES,
  FITS,
  LAPELS,
  LAYERING_ROLES,
  LEG_SHAPES,
  LENGTHS,
  NECKLINES,
  PATTERNS,
  RULE_KINDS,
  SEASONS,
  SETTINGS_KINDS,
  SHOE_HEIGHTS,
  SLEEVES,
  SLOTS,
  STATUSES,
  TEXTURES,
  WEATHER_TAGS,
} from "./domain";
import { HEX_RE } from "./colours";

const trimmed = (max: number) => z.string().trim().max(max);
const tagList = (maxItems = 12, maxLen = 40) =>
  z
    .array(trimmed(maxLen).min(1))
    .max(maxItems)
    .transform((xs) => Array.from(new Set(xs.map((x) => x.toLowerCase()))));

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");
export const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM");

export const colourSchema = z.object({
  name: trimmed(60).min(1),
  hex: z.string().regex(HEX_RE, "Colour must be a #rrggbb hex value").transform((h) => h.toLowerCase()),
});

export const detailsSchema = z
  .object({
    sleeve: z.enum(SLEEVES).optional(),
    neckline: z.enum(NECKLINES).optional(),
    collar: z.enum(COLLARS).optional(),
    lapel: z.enum(LAPELS).optional(),
    closure: z.enum(CLOSURES).optional(),
    length: z.enum(LENGTHS).optional(),
    leg: z.enum(LEG_SHAPES).optional(),
    height: z.enum(SHOE_HEIGHTS).optional(),
    texture: z.enum(TEXTURES).optional(),
    pockets: z.boolean().optional(),
    hood: z.boolean().optional(),
    cuffs: z.boolean().optional(),
  })
  .strip();

export const garmentInputSchema = z.object({
  name: trimmed(120).min(1, "Name is required"),
  category: z.enum(CATEGORIES),
  subcategory: trimmed(60).toLowerCase().nullish(),
  colours: z.array(colourSchema).max(6).default([]),
  pattern: z.enum(PATTERNS).default("solid"),
  materials: tagList(8).default([]),
  fit: z.enum(FITS).nullish(),
  silhouette: trimmed(60).nullish(),
  layeringRole: z.enum(LAYERING_ROLES).nullish(),
  warmth: z.number().int().min(1).max(5).default(3),
  formality: z.number().int().min(1).max(5).default(3),
  seasons: z.array(z.enum(SEASONS)).max(4).default([]),
  weather: z.array(z.enum(WEATHER_TAGS)).max(6).default([]),
  occasions: tagList().default([]),
  styleTags: tagList().default([]),
  brand: trimmed(80).nullish(),
  notes: trimmed(2000).nullish(),
  details: detailsSchema.default({}),
  status: z.enum(STATUSES).default("clean"),
  washAfterWears: z.number().int().min(0).max(100).nullish(),
  needsIroning: z.boolean().nullish(),
});
export type GarmentInput = z.input<typeof garmentInputSchema>;
export type GarmentData = z.output<typeof garmentInputSchema>;

/**
 * A schema for partial updates: every field optional and, unlike `.partial()`, no
 * `.default()` values filled in – so a PATCH only touches the fields it sends.
 */
export function patchOf<T extends z.ZodObject>(schema: T) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => {
      const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
      return [key, inner.optional()];
    }),
  );
  return z.object(shape) as unknown as z.ZodType<Partial<z.output<T>>, Partial<z.input<T>>>;
}

export const garmentPatchSchema = patchOf(garmentInputSchema);

export const activityInputSchema = z.object({
  date: dateString,
  title: trimmed(120).min(1, "Give the activity a name"),
  startTime: timeString.nullish(),
  endTime: timeString.nullish(),
  dressCode: z.enum(DRESS_CODES).default("none"),
  setting: z.enum(SETTINGS_KINDS).default("indoor"),
  notes: trimmed(500).nullish(),
});
export type ActivityInput = z.input<typeof activityInputSchema>;

export const profileSchema = z.object({
  styleDescription: trimmed(4000).default(""),
  aesthetics: tagList(16).default([]),
  favouriteColours: tagList(16).default([]),
  avoidedColours: tagList(16).default([]),
  preferredFits: tagList(10).default([]),
  preferredSilhouettes: tagList(10).default([]),
  favouriteMaterials: tagList(12).default([]),
  avoidedMaterials: tagList(12).default([]),
  layering: z.enum(["minimal", "moderate", "love-layers"]).default("moderate"),
  /** null = no usual formality; activities and occasions decide */
  formality: z.number().int().min(1).max(5).nullable().default(null),
  comfortPriority: z.number().int().min(1).max(5).default(3),
  boldness: z.number().int().min(1).max(5).default(3),
  repetitionDays: z.number().int().min(0).max(60).default(10),
  garmentRestDays: z.number().int().min(0).max(14).default(2),
  notes: trimmed(2000).default(""),
});
export type Profile = z.output<typeof profileSchema>;

export const locationSchema = z.object({
  name: trimmed(120).min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: trimmed(64).min(1),
  country: trimmed(80).nullish(),
});
export type SavedLocation = z.output<typeof locationSchema>;

export const appSettingsSchema = z.object({
  location: locationSchema.nullable().default(null),
  units: z.enum(["metric", "imperial"]).default("metric"),
  aiEnabled: z.boolean().default(true),
  /** "today" = rolling seven days from today; otherwise calendar weeks starting Monday or Sunday */
  plannerStart: z.enum(["today", "monday", "sunday"]).default("today"),
  onboarded: z.boolean().default(false),
});
export type AppSettings = z.output<typeof appSettingsSchema>;

export const weatherPeriodSchema = z.object({
  temp: z.number(),
  apparent: z.number(),
  precipProbability: z.number().min(0).max(100),
  precipitation: z.number().min(0),
  wind: z.number().min(0),
  code: z.number().int().nullable(),
});

export const manualWeatherSchema = z.object({
  low: z.number().min(-60).max(60),
  high: z.number().min(-60).max(60),
  precipProbability: z.number().min(0).max(100).default(0),
  wind: z.number().min(0).max(200).default(10),
  summary: trimmed(80).nullish(),
});
export type ManualWeather = z.output<typeof manualWeatherSchema>;

export const feedbackInputSchema = z.object({
  outfitId: z.number().int().positive().nullish(),
  garmentIds: z.array(z.number().int().positive()).max(12).default([]),
  kind: z.enum(FEEDBACK_KINDS),
  scope: z.enum(FEEDBACK_SCOPES).default("one_off"),
  context: trimmed(120).nullish(),
  note: trimmed(500).nullish(),
});
export type FeedbackInput = z.input<typeof feedbackInputSchema>;

export const ruleInputSchema = z.object({
  kind: z.enum(RULE_KINDS),
  garmentIds: z.array(z.number().int().positive()).max(12).default([]),
  colours: tagList(6).default([]),
  text: trimmed(500).default(""),
  permanent: z.boolean().default(true),
  expiresAt: dateString.nullish(),
});
export type RuleInput = z.input<typeof ruleInputSchema>;

export const outfitItemInputSchema = z.object({
  garmentId: z.number().int().positive(),
  slot: z.enum(SLOTS).optional(),
});

export const outfitInputSchema = z.object({
  name: trimmed(120).min(1).default("Untitled outfit"),
  garmentIds: z.array(z.number().int().positive()).min(1).max(14),
  explanation: trimmed(4000).default(""),
  tags: tagList().default([]),
  favourite: z.boolean().default(false),
  saved: z.boolean().default(true),
});

export const outfitPatchSchema = z.object({
  name: trimmed(120).min(1).optional(),
  explanation: trimmed(4000).optional(),
  tags: tagList().optional(),
  favourite: z.boolean().optional(),
  saved: z.boolean().optional(),
  archived: z.boolean().optional(),
  garmentIds: z.array(z.number().int().positive()).min(1).max(14).optional(),
});

/** Options a user can attach to a stylist request. */
export const stylistRequestSchema = z.object({
  prompt: trimmed(2000).default(""),
  date: dateString.optional(),
  occasion: trimmed(80).nullish(),
  includeGarmentIds: z.array(z.number().int().positive()).max(6).default([]),
  excludeGarmentIds: z.array(z.number().int().positive()).max(60).default([]),
  count: z.number().int().min(1).max(4).default(3),
  useAi: z.boolean().default(true),
});
export type StylistRequest = z.input<typeof stylistRequestSchema>;

export const ADJUSTMENTS = ["smarter", "more_casual", "warmer", "cooler", "more_comfortable", "bolder", "quieter"] as const;
export type Adjustment = (typeof ADJUSTMENTS)[number];
export const ADJUSTMENT_LABELS: Record<Adjustment, string> = {
  smarter: "Smarter",
  more_casual: "More casual",
  warmer: "Warmer",
  cooler: "Cooler",
  more_comfortable: "More comfortable",
  bolder: "Bolder",
  quieter: "Quieter",
};

export const profilePatchSchema = patchOf(profileSchema);
export const settingsPatchSchema = patchOf(appSettingsSchema);
export const activityPatchSchema = patchOf(activityInputSchema);
