import { z } from "zod";
import { route, readJson } from "@/server/api";
import { extractGarmentsFromText } from "@/server/services/importer";

export const POST = route(async (req) => {
  const { text, useAi } = await readJson(req, z.object({ text: z.string().max(20_000), useAi: z.boolean().default(true) }));
  return extractGarmentsFromText(text, { useAi });
});
