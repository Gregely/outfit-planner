import { z } from "zod";
import { route, readJson } from "@/server/api";
import { styleGarment } from "@/server/stylist";

export const POST = route(async (req) => {
  const { garmentId, useAi } = await readJson(req, z.object({ garmentId: z.number().int().positive(), useAi: z.boolean().default(true) }));
  return styleGarment(garmentId, useAi);
});
