import { z } from "zod";
import { route, readJson, intParam } from "@/server/api";
import { adjust } from "@/server/stylist";
import { ADJUSTMENTS } from "@/lib/schemas";

const schema = z.object({ adjustment: z.enum(ADJUSTMENTS).nullish(), instruction: z.string().max(500).optional(), useAi: z.boolean().default(true) });

export const POST = route<{ id: string }>(async (req, { id }) => {
  const body = await readJson(req, schema);
  return adjust(intParam(id), body.adjustment ?? null, { useAi: body.useAi, instruction: body.instruction });
});
