import { z } from "zod";
import { route, readJson } from "@/server/api";
import { setGarmentStatus } from "@/server/services/garments";
import { STATUSES } from "@/lib/domain";

const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), status: z.enum(STATUSES) });

export const POST = route(async (req) => {
  const { ids, status } = await readJson(req, schema);
  return setGarmentStatus(ids, status);
});
