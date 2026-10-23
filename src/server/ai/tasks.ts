import "server-only";
import { z } from "zod";
import {
  CATEGORIES,
  CLOSURES,
  COLLARS,
  DRESS_CODES,
  FITS,
  LAPELS,
  LAYERING_ROLES,
  LEG_SHAPES,
  LENGTHS,
  NECKLINES,
  PATTERNS,
  SEASONS,
  SETTINGS_KINDS,
  SHOE_HEIGHTS,
  SLEEVES,
  WEATHER_TAGS,
  slotFor,
} from "@/lib/domain";
import type { Garment } from "@/server/db/schema";
import type { Profile } from "@/lib/schemas";
import type { DayView } from "@/server/services/plans";
import { formatDate } from "@/lib/dates";
import { callStructured } from "./client";

/* ------------------------------------------------------------------ */
/* Garment extraction                                                  */
/* ------------------------------------------------------------------ */

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).nullable();

export const aiGarmentSchema = z.object({
  name: z.string().describe("Short descriptive name, e.g. 'Charcoal tweed blazer'"),
  category: z.enum(CATEGORIES),
  subcategory: z.string().nullable(),
  colours: z.array(z.object({ name: z.string(), hex: z.string().nullable().describe("#rrggbb approximation, or null") })),
  pattern: nullableEnum(PATTERNS),
  materials: z.array(z.string()),
  fit: nullableEnum(FITS),
  silhouette: z.string().nullable(),
  layering_role: nullableEnum(LAYERING_ROLES),
  warmth: z.number().int().nullable().describe("1 very light … 5 very warm, or null if not inferable"),
  formality: z.number().int().nullable().describe("1 lounge … 5 formal, or null if not inferable"),
  seasons: z.array(z.enum(SEASONS)),
  weather: z.array(z.enum(WEATHER_TAGS)),
  occasions: z.array(z.string()),
  style_tags: z.array(z.string()),
  brand: z.string().nullable(),
  notes: z.string().nullable(),
  details: z.object({
    sleeve: nullableEnum(SLEEVES),
    neckline: nullableEnum(NECKLINES),
    collar: nullableEnum(COLLARS),
    lapel: nullableEnum(LAPELS),
    closure: nullableEnum(CLOSURES),
    length: nullableEnum(LENGTHS),
    leg: nullableEnum(LEG_SHAPES),
    height: nullableEnum(SHOE_HEIGHTS),
  }),
  estimated_fields: z.array(z.string()).describe("Fields you inferred from the garment type rather than read from the text"),
  source_text: z.string().describe("The exact phrase this garment came from"),
});
export type AiGarment = z.infer<typeof aiGarmentSchema>;

const EXTRACT_SYSTEM = `You turn a person's description of their clothes into structured wardrobe records.

Rules:
- Create one record per distinct garment. "Two white oxford shirts" is two records only if they differ; identical items may be one record with a note.
- Only record what the text states or what follows directly from the garment type. If a colour, material, fit, brand or anything else isn't stated, use null or an empty list. Never invent details.
- warmth and formality may be estimated from the garment type (an overcoat is warm, a tuxedo is formal); list any such field in estimated_fields. Use null if you can't tell.
- Keep the person's own colour words in colour names ("dark brown, almost charcoal") and give a hex approximation.
- Style words the person uses (dark academia, grunge, smart-casual…) go in style_tags; situations they mention (college, work, dates) go in occasions.
- Category must be one of the allowed values: blazers, overcoats and jackets are outerwear; jumpers and cardigans are knitwear; suits, tuxedos and waistcoats are formalwear.
- Ignore text that isn't about a garment.`;

export async function aiExtractGarments(text: string) {
  const out = await callStructured({
    system: EXTRACT_SYSTEM,
    prompt: `Describe each garment in this text as a record:\n\n<wardrobe_text>\n${text}\n</wardrobe_text>`,
    schema: z.object({ garments: z.array(aiGarmentSchema) }),
    effort: "low",
  });
  return out.garments;
}

/* ------------------------------------------------------------------ */
/* Activities                                                          */
/* ------------------------------------------------------------------ */

export const aiActivitySchema = z.object({
  title: z.string(),
  start_time: z.string().nullable().describe("24h HH:MM or null"),
  end_time: z.string().nullable().describe("24h HH:MM or null"),
  dress_code: z.enum(DRESS_CODES),
  setting: z.enum(SETTINGS_KINDS),
  notes: z.string().nullable(),
});

export async function aiParseActivities(text: string, date: string) {
  const out = await callStructured({
    system:
      "You turn a short description of someone's day into a list of activities for outfit planning. Use 24-hour times only when the text gives or clearly implies them; otherwise null. Pick the dress code the activity implies (use 'none' if unclear) and whether it's indoors, outdoors or mixed. Do not add activities that aren't mentioned.",
    prompt: `The day is ${formatDate(date, { weekday: true, year: true })}.\n\n<day_plan>\n${text}\n</day_plan>`,
    schema: z.object({ activities: z.array(aiActivitySchema) }),
    effort: "low",
  });
  return out.activities;
}

/* ------------------------------------------------------------------ */
/* Stylist                                                             */
/* ------------------------------------------------------------------ */

const STYLIST_SYSTEM = `You are a thoughtful personal stylist working only with the client's actual wardrobe.

Hard rules (outfits that break them are discarded automatically):
- Use only garment ids from the AVAILABLE GARMENTS list. Never invent garments or ids.
- Each outfit needs exactly one pair of shoes; exactly one of: trousers/shorts/skirt, a dress, or a suit; something covering the torso (a top, a jumper or a dress); at most one coat; at most two mid layers; at most one accessory of each kind.
- Respect REQUIRED, EXCLUDED and the client's RULES exactly.

Styling judgement:
- Consider colour harmony, proportion and silhouette (balance volume on top and bottom), layering order, texture contrast, formality cohesion and comfort.
- Dress for the weather of the hours the client is out: layers for cold or changeable days, waterproof outerwear and suitable shoes for rain, light breathable pieces for heat.
- Match the formality of the day's activities and the client's stated style and preferences, without being so literal that every outfit looks the same.
- Avoid repeating recently worn outfits; rotate pieces, but don't force rarely suitable garments in just for variety.
- Explanations are 2–4 sentences, specific and warm: say why these pieces work together for this day. No generic filler.`;

function garmentLine(g: Garment) {
  const parts = [
    `#${g.id} ${g.name}`,
    `${g.category}${g.subcategory ? `/${g.subcategory}` : ""} (${slotFor(g)})`,
    g.colours.length ? `colours: ${g.colours.map((c) => c.name).join(", ")}` : "",
    g.pattern !== "solid" ? `pattern: ${g.pattern}` : "",
    g.materials.length ? `materials: ${g.materials.join(", ")}` : "",
    g.fit ? `fit: ${g.fit}` : "",
    g.silhouette ? `silhouette: ${g.silhouette}` : "",
    `warmth ${g.warmth}/5`,
    `formality ${g.formality}/5`,
    g.seasons.length ? `seasons: ${g.seasons.join(", ")}` : "",
    g.weather.length ? `weather: ${g.weather.join(", ")}` : "",
    g.styleTags.length ? `style: ${g.styleTags.join(", ")}` : "",
    g.occasions.length ? `occasions: ${g.occasions.join(", ")}` : "",
    g.lastWornOn ? `last worn ${g.lastWornOn}` : "never worn",
  ];
  return parts.filter(Boolean).join(" | ");
}

export function wardrobeBlock(available: Garment[]) {
  return `AVAILABLE GARMENTS (${available.length}):\n${available.map(garmentLine).join("\n")}`;
}

export function profileBlock(p: Profile) {
  const lines = [
    p.styleDescription && `In their words: "${p.styleDescription}"`,
    p.aesthetics.length && `Aesthetics: ${p.aesthetics.join(", ")}`,
    p.favouriteColours.length && `Favourite colours: ${p.favouriteColours.join(", ")}`,
    p.avoidedColours.length && `Prefers to avoid colours: ${p.avoidedColours.join(", ")}`,
    p.preferredFits.length && `Preferred fits: ${p.preferredFits.join(", ")}`,
    p.preferredSilhouettes.length && `Preferred silhouettes: ${p.preferredSilhouettes.join(", ")}`,
    p.favouriteMaterials.length && `Favourite materials: ${p.favouriteMaterials.join(", ")}`,
    p.avoidedMaterials.length && `Avoids materials: ${p.avoidedMaterials.join(", ")}`,
    `Layering: ${p.layering}; usual formality ${p.formality}/5; comfort priority ${p.comfortPriority}/5; boldness ${p.boldness}/5`,
    `Avoid repeating a whole outfit within ${p.repetitionDays} days; rest individual pieces ${p.garmentRestDays} days where possible`,
    p.notes && `Notes: ${p.notes}`,
  ];
  return `CLIENT STYLE PROFILE:\n${lines.filter(Boolean).join("\n")}`;
}

export function dayBlock(day: DayView, units: "metric" | "imperial" = "metric") {
  const w = day.weather;
  const temp = (c: number | null) => (c === null ? "?" : units === "imperial" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`);
  const weather =
    w.source === "none"
      ? "Weather: unknown (no forecast) – assume mild and say so if it matters."
      : [
          `Weather (${w.source}): ${w.summary}, ${temp(w.low)}–${temp(w.high)}, feels ${temp(w.feelsLow)}–${temp(w.feelsHigh)}, rain chance ${Math.round(w.precipProbability)}%, ${w.precipitation.toFixed(1)} mm, wind up to ${Math.round(w.wind)} km/h.`,
          ...Object.entries(w.periods).map(
            ([p, v]) => `  ${p}: ${temp(v!.temp)} (feels ${temp(v!.apparent)}), rain ${Math.round(v!.precipProbability)}%, wind ${Math.round(v!.wind)} km/h`,
          ),
          ...day.needs.notes.map((n) => `  Note: ${n}`),
        ].join("\n");
  const acts = day.activities.length
    ? day.activities
        .map(
          (a) =>
            `- ${a.startTime ?? "?"}${a.endTime ? `–${a.endTime}` : ""} ${a.title} (dress code: ${a.dressCode}, ${a.setting})${a.notes ? ` – ${a.notes}` : ""}`,
        )
        .join("\n")
    : "- No activities entered.";
  return `DATE: ${day.date} (${formatDate(day.date, { weekday: true })})\n${weather}\nActivities:\n${acts}`;
}

export const aiOutfitSchema = z.object({
  name: z.string().describe("Evocative 2–5 word outfit name"),
  garment_ids: z.array(z.number().int()),
  explanation: z.string(),
});

export type StylistPromptParts = {
  available: Garment[];
  profile: Profile;
  day: DayView;
  rules: string[];
  feedback: string[];
  recent: string[];
  request: string;
  required: Garment[];
  excluded: Garment[];
  units?: "metric" | "imperial";
};

function commonBlocks(p: StylistPromptParts) {
  return [
    wardrobeBlock(p.available),
    profileBlock(p.profile),
    `RULES:\n${p.rules.length ? p.rules.map((r) => `- ${r}`).join("\n") : "- none"}`,
    `RECENT FEEDBACK:\n${p.feedback.length ? p.feedback.map((r) => `- ${r}`).join("\n") : "- none"}`,
    `RECENTLY WORN / PLANNED:\n${p.recent.length ? p.recent.map((r) => `- ${r}`).join("\n") : "- nothing recent"}`,
    `REQUIRED (must appear in every outfit): ${p.required.length ? p.required.map((g) => `#${g.id} ${g.name}`).join(", ") : "none"}`,
    `EXCLUDED (must not appear): ${p.excluded.length ? p.excluded.map((g) => `#${g.id} ${g.name}`).join(", ") : "none"}`,
  ].join("\n\n");
}

export async function aiSuggestOutfits(p: StylistPromptParts, count: number, repairNotes?: string) {
  const prompt = [
    commonBlocks(p),
    dayBlock(p.day, p.units),
    `REQUEST: ${p.request || "Suggest outfits for this day."}`,
    `Suggest ${count} distinct outfits, best first.`,
    repairNotes ? `Your previous answer broke these rules – fix them:\n${repairNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await callStructured({ system: STYLIST_SYSTEM, prompt, schema: z.object({ outfits: z.array(aiOutfitSchema) }) });
  return out.outfits;
}

export async function aiPlanWeek(
  p: Omit<StylistPromptParts, "day"> & { days: DayView[]; fixed: { date: string; garments: Garment[] }[] },
  repairNotes?: string,
) {
  const prompt = [
    commonBlocks({ ...p, day: p.days[0] }),
    `LOCKED / ALREADY DECIDED DAYS (keep in mind for variety; do not plan these):\n${
      p.fixed.length ? p.fixed.map((f) => `- ${f.date}: ${f.garments.map((g) => `#${g.id} ${g.name}`).join(", ")}`).join("\n") : "- none"
    }`,
    `DAYS TO PLAN:\n\n${p.days.map((d) => dayBlock(d, p.units)).join("\n\n")}`,
    `REQUEST: ${p.request || "Plan a cohesive week."}`,
    "Plan one outfit per day to plan. Make the week cohesive but varied: don't repeat a whole outfit, rest pieces between wears where the wardrobe allows, and remember items that need washing after one wear (t-shirts, base layers) can't be worn twice in the week. Shoes, coats and accessories may repeat.",
    repairNotes ? `Your previous answer broke these rules – fix them:\n${repairNotes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const out = await callStructured({
    system: STYLIST_SYSTEM,
    prompt,
    schema: z.object({ days: z.array(aiOutfitSchema.extend({ date: z.string() })) }),
    maxTokens: 24000,
  });
  return out.days;
}

export async function aiReplaceGarment(p: StylistPromptParts & { current: Garment[]; target: Garment; instruction: string }) {
  const prompt = [
    commonBlocks(p),
    dayBlock(p.day, p.units),
    `CURRENT OUTFIT:\n${p.current.map((g) => `- #${g.id} ${g.name} (${slotFor(g)})`).join("\n")}`,
    `Replace ONLY #${p.target.id} ${p.target.name} with up to three alternatives from the available garments, best first. Every other garment stays exactly as it is. Each alternative must fill the same role in the outfit.${p.instruction ? ` Client's note: ${p.instruction}` : ""}`,
  ].join("\n\n");
  const out = await callStructured({
    system: STYLIST_SYSTEM,
    prompt,
    schema: z.object({ alternatives: z.array(z.object({ garment_id: z.number().int(), reason: z.string() })) }),
    effort: "low",
  });
  return out.alternatives;
}

export async function aiAdjustOutfit(p: StylistPromptParts & { current: Garment[]; instruction: string }) {
  const prompt = [
    commonBlocks(p),
    dayBlock(p.day, p.units),
    `CURRENT OUTFIT:\n${p.current.map((g) => `- #${g.id} ${g.name} (${slotFor(g)})`).join("\n")}`,
    `ADJUSTMENT REQUESTED: ${p.instruction}\nChange as few garments as possible to achieve it and keep the rest. In the explanation, say what changed and why.`,
  ].join("\n\n");
  const out = await callStructured({ system: STYLIST_SYSTEM, prompt, schema: aiOutfitSchema, effort: "low" });
  return out;
}

export async function aiGapAnalysis(garments: Garment[], profile: Profile) {
  const prompt = [
    wardrobeBlock(garments),
    profileBlock(profile),
    "Identify up to five versatile pieces this specific wardrobe is missing – pieces that would unlock many new outfits with what's already owned and fit the client's style. For each, name the existing garments (by id) it would pair with. Be concrete about colour and type; no brands, no shopping links, no generic advice. If the wardrobe is well covered, return fewer gaps.",
  ].join("\n\n");
  const out = await callStructured({
    system: "You are a thoughtful personal stylist reviewing a client's wardrobe. Use only garment ids that appear in the list.",
    prompt,
    schema: z.object({
      gaps: z.array(z.object({ piece: z.string(), why: z.string(), pairs_with_ids: z.array(z.number().int()), priority: z.enum(["high", "medium", "low"]) })),
    }),
    effort: "low",
  });
  return out.gaps;
}
