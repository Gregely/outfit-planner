import { z } from "zod";
import { route, readJson } from "@/server/api";
import { extractGarmentsFromCsv } from "@/server/services/importer";

export const POST = route(async (req) => {
  const { csv } = await readJson(req, z.object({ csv: z.string().min(1).max(5_000_000) }), { maxBytes: 6_000_000 });
  return extractGarmentsFromCsv(csv);
});
