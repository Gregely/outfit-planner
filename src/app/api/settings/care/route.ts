import { z } from "zod";
import { route, readJson } from "@/server/api";
import { setCareDefault } from "@/server/services/settings";
import { CATEGORIES } from "@/lib/domain";

const schema = z.object({ category: z.enum(CATEGORIES), washAfterWears: z.number().int().min(0).max(100), needsIroning: z.boolean() });

export const PUT = route(async (req) => {
  const { category, ...care } = await readJson(req, schema);
  return { care: setCareDefault(category, care) };
});
