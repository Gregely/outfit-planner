import { z } from "zod";
import { route, readJson, intParam } from "@/server/api";
import { applyReplacement, replacementSuggestions } from "@/server/stylist";
import { getGarment } from "@/server/services/garments";

const schema = z.object({
  garmentId: z.number().int().positive(),
  newGarmentId: z.number().int().positive().optional(),
  instruction: z.string().max(500).optional(),
  useAi: z.boolean().default(true),
});

/** Without newGarmentId: suggest alternatives (nothing changes). With it: apply that swap. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const oid = intParam(id);
  const body = await readJson(req, schema);
  if (body.newGarmentId) return { outfit: applyReplacement(oid, body.garmentId, body.newGarmentId) };
  const { options, notice } = await replacementSuggestions(oid, body.garmentId, { useAi: body.useAi, instruction: body.instruction });
  return { notice, options: options.map((o) => ({ ...o, garment: getGarment(o.garmentId) })) };
});
