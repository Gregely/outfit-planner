import { z } from "zod";
import { route, readJson } from "@/server/api";
import { advanceLaundry } from "@/server/services/garments";

export const POST = route(async (req) => {
  const { ids } = await readJson(req, z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }));
  return advanceLaundry(ids);
});
