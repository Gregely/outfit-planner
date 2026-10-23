import { route, readJson, intParam } from "@/server/api";
import { deleteOutfit, getOutfit, updateOutfit } from "@/server/services/outfits";
import { outfitPatchSchema } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>((_req, { id }) => ({ outfit: getOutfit(intParam(id)) }));

export const PATCH = route<P>(async (req, { id }) => ({ outfit: updateOutfit(intParam(id), await readJson(req, outfitPatchSchema)) }));

export const DELETE = route<P>((_req, { id }) => {
  deleteOutfit(intParam(id));
  return { ok: true };
});
