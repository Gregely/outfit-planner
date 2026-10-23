import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db";
import { garmentInputSchema, type GarmentInput } from "@/lib/schemas";
import { defaultLayeringRole, type GarmentDetails } from "@/lib/domain";
import { toColour } from "@/lib/colours";
import { AiUnavailableError, aiStatus, describeAiError, type GenerationMeta } from "@/server/ai/client";
import { aiExtractGarments, UNSPECIFIED, type AiGarment } from "@/server/ai/tasks";
import { estimateTraits } from "@/lib/garment-traits";
import { parseWardrobeText } from "@/server/import/heuristic";
import { BadRequestError } from "@/server/errors";
import { createGarment, fillMissingFields, findDuplicates, type DuplicateMatch, type GarmentView } from "./garments";
import { parseGarmentsCsv } from "./backup";

export type ImportMethod = "ai" | "rules" | "csv";

export type ImportProposal = {
  key: string;
  input: GarmentInput;
  /** fields that weren't stated and were filled with a neutral default or estimated */
  assumed: string[];
  sourceText: string;
  duplicates: DuplicateMatch[];
  /** another proposal in this batch looks like the same garment */
  batchDuplicateOf: string | null;
  errors: string[];
};

export type ExtractResult = { method: ImportMethod; proposals: ImportProposal[]; notice: string | null; generatedBy?: GenerationMeta | null };

const known = <T extends string>(v: T): Exclude<T, typeof UNSPECIFIED> | null => (v === UNSPECIFIED ? null : (v as Exclude<T, typeof UNSPECIFIED>));
const text = (v: string, max: number) => v.trim().slice(0, max) || null;

/** Translate the AI's record (with "" / "unspecified" / 0 meaning unknown) into a garment proposal. */
export function fromAiGarment(g: AiGarment): { input: GarmentInput; assumed: string[] } {
  const assumed = new Set(g.estimated_fields.map((f) => f.toLowerCase().replace(/_/g, " ")));
  const subcategory = text(g.subcategory.toLowerCase(), 60);
  const materials = g.materials.map((m) => m.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  const estimate = estimateTraits({ category: g.category, subcategory, name: g.name, materials });
  const score = (v: number, fallback: number, field: string) => {
    if (Number.isInteger(v) && v >= 1 && v <= 5) return v;
    assumed.add(field);
    return fallback;
  };
  if (g.colours.length === 0) assumed.add("colours");
  const details = Object.fromEntries(Object.entries(g.details).filter(([, v]) => v !== UNSPECIFIED)) as GarmentDetails;
  const input: GarmentInput = {
    name: text(g.name, 120) ?? "Unnamed garment",
    category: g.category,
    subcategory,
    colours: g.colours.filter((c) => c.name.trim()).slice(0, 6).map((c) => toColour(c.name, c.hex || null)),
    pattern: known(g.pattern) ?? "solid",
    materials,
    fit: known(g.fit),
    silhouette: text(g.silhouette, 60),
    layeringRole: known(g.layering_role) ?? defaultLayeringRole(g.category, subcategory),
    warmth: score(g.warmth, estimate.warmth, "warmth"),
    formality: score(g.formality, estimate.formality, "formality"),
    seasons: g.seasons,
    weather: g.weather,
    occasions: g.occasions.map((o) => o.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    styleTags: g.style_tags.map((o) => o.trim().toLowerCase()).filter(Boolean).slice(0, 12),
    brand: text(g.brand, 80),
    notes: text(g.notes, 2000),
    details,
  };
  // read `assumed` only after the scores above have added the fields they estimated
  return { input, assumed: [...assumed] };
}

function finalise(items: { input: GarmentInput; assumed: string[]; sourceText: string; errors?: string[] }[]): ImportProposal[] {
  const proposals: ImportProposal[] = [];
  items.forEach((item, i) => {
    const parsed = garmentInputSchema.safeParse(item.input);
    const errors = [...(item.errors ?? [])];
    if (!parsed.success) errors.push(...parsed.error.issues.map((x) => `${x.path.join(".") || "garment"}: ${x.message}`));
    const input = parsed.success ? (parsed.data as GarmentInput) : item.input;
    const key = `p${i + 1}`;
    const twin = proposals.find(
      (p) => p.input.category === input.category && p.input.name.trim().toLowerCase() === input.name.trim().toLowerCase(),
    );
    proposals.push({
      key,
      input,
      assumed: item.assumed,
      sourceText: item.sourceText,
      duplicates: parsed.success ? findDuplicates(parsed.data) : [],
      batchDuplicateOf: twin?.key ?? null,
      errors,
    });
  });
  return proposals;
}

export async function extractGarmentsFromText(text: string, opts: { useAi?: boolean } = {}): Promise<ExtractResult> {
  const clean = text.trim();
  if (!clean) throw new BadRequestError("Describe at least one garment.");
  if (clean.length > 20_000) throw new BadRequestError("That's a lot of text – please import in smaller batches (under 20,000 characters).");
  let notice: string | null = null;
  if (opts.useAi !== false) {
    const status = aiStatus("import");
    if (status.enabled) {
      try {
        const { garments, meta } = await aiExtractGarments(clean);
        if (garments.length) {
          return {
            method: "ai",
            notice: null,
            generatedBy: meta,
            proposals: finalise(garments.map((g) => ({ ...fromAiGarment(g), sourceText: g.source_text.slice(0, 400) }))),
          };
        }
        notice = `${meta.providerLabel} didn't find any garments in that text; tried the offline parser instead.`;
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
        notice = `${status.providerLabel} couldn't read it – ${describeAiError(err)}. Used the offline parser instead; please check each field.`;
      }
    } else if (status.reason !== "not_configured") {
      notice = `${capitalise(status.message ?? "AI isn't available")}. Used the offline parser – please check each field.`;
    }
  }
  const results = parseWardrobeText(clean);
  return { method: "rules", notice, proposals: finalise(results) };
}

export function extractGarmentsFromCsv(text: string): ExtractResult {
  const rows = parseGarmentsCsv(text);
  return {
    method: "csv",
    notice: null,
    proposals: finalise(
      rows.map((r) => ({
        input: r.input ?? ({ name: `Row ${r.row}`, category: "tops" } as GarmentInput),
        assumed: [],
        sourceText: `CSV row ${r.row}${r.sourceId ? ` (id ${r.sourceId})` : ""}`,
        errors: r.errors,
      })),
    ),
  };
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const commitSchema = z.object({
  method: z.enum(["ai", "rules", "csv"]).default("rules"),
  items: z
    .array(
      z.object({
        action: z.enum(["create", "skip", "fill"]),
        input: garmentInputSchema,
        targetId: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(500),
});

/** Save the garments the user approved. All or nothing. */
export function commitImport(raw: unknown): { created: GarmentView[]; updated: GarmentView[]; skipped: number } {
  const data = commitSchema.parse(raw);
  const source = data.method === "ai" ? "ai-import" : data.method === "csv" ? "csv" : "text-import";
  return getDb().transaction(() => {
    const created: GarmentView[] = [];
    const updated: GarmentView[] = [];
    let skipped = 0;
    for (const item of data.items) {
      if (item.action === "skip") skipped++;
      else if (item.action === "fill") {
        if (!item.targetId) throw new BadRequestError("Choose which garment to update.");
        updated.push(fillMissingFields(item.targetId, item.input));
      } else created.push(createGarment(item.input, source));
    }
    return { created, updated, skipped };
  });
}
