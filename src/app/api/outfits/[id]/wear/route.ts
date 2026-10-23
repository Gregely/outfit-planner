import { z } from "zod";
import { route, readJson, intParam } from "@/server/api";
import { markOutfitWorn } from "@/server/services/wear";
import { dateString } from "@/lib/schemas";
import { today } from "@/server/services/settings";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const body = await readJson(req, z.object({ date: dateString.optional(), notes: z.string().max(1000).nullish() }));
  return markOutfitWorn(intParam(id), body.date ?? today(), body.notes);
});
