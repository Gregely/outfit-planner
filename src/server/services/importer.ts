import "server-only";
import { z } from "zod";
import { getDb } from "@/server/db";
import { garmentInputSchema, type GarmentInput } from "@/lib/schemas";
import { defaultLayeringRole, type GarmentDetails } from "@/lib/domain";
import { toColour } from "@/lib/colours";
import { AiUnavailableError, REASON_TEXT, aiStatus } from "@/server/ai/client";
import { aiExtractGarments, type AiGarment } from "@/server/ai/tasks";
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

export type ExtractResult = { method: ImportMethod; proposals: ImportProposal[]; notice: string | null };

const clamp = (n: number | null, fallback: number) => (n === null ? fallback : Math.min(5, Math.max(1, Math.round(n))));

export function fromAiGarment(g: AiGarment): { input: GarmentInput; assumed: string[] } {
  const assumed = new Set(g.estimated_fields.map((f) => f.toLowerCase()));
  if (g.warmth === null) assumed.add("warmth");
  if (g.formality === null) assumed.add("formality");
  if (g.colours.length === 0) assumed.add("colours");
  const details = Object.fromEntries(Object.entries(g.details).filter(([, v]) => v !== null)) as GarmentDetails;
  return {
    assumed: [...assumed],
    input: {
      name: g.name.slice(0, 120) || "Unnamed garment",
      category: g.category,
      subcategory: g.subcategory?.toLowerCase().slice(0, 60) ?? null,
      colours: g.colours.slice(0, 6).map((c) => toColour(c.name, c.hex)),
      pattern: g.pattern ?? "solid",
      materials: g.materials.map((m) => m.toLowerCase()).slice(0, 8),
      fit: g.fit,
      silhouette: g.silhouette?.slice(0, 60) ?? null,
      layeringRole: g.layering_role ?? defaultLayeringRole(g.category, g.subcategory),
      warmth: clamp(g.warmth, 3),
      formality: clamp(g.formality, 3),
      seasons: g.seasons,
      weather: g.weather,
      occasions: g.occasions.slice(0, 12),
      styleTags: g.style_tags.slice(0, 12),
      brand: g.brand?.slice(0, 80) ?? null,
      notes: g.notes?.slice(0, 2000) ?? null,
      details,
    },
  };
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
    const status = aiStatus();
    if (status.enabled) {
      try {
        const garments = await aiExtractGarments(clean);
        if (garments.length) {
          return {
            method: "ai",
            notice: null,
            proposals: finalise(garments.map((g) => ({ ...fromAiGarment(g), sourceText: g.source_text.slice(0, 400) }))),
          };
        }
        notice = "Claude didn't find any garments in that text; tried the offline parser instead.";
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
        notice = `${capitalise(REASON_TEXT[err.reason])}. Used the offline parser instead – please check each field.`;
      }
    } else {
      notice = `${capitalise(REASON_TEXT[status.reason!])}. Used the offline parser – please check each field.`;
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
