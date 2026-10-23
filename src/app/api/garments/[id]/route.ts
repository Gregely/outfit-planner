import { route, readJson, intParam } from "@/server/api";
import { deleteGarment, getGarment, updateGarment, wearHistory, plansUsingGarments } from "@/server/services/garments";
import { garmentPatchSchema } from "@/lib/schemas";

type P = { id: string };

export const GET = route<P>((_req, { id }) => {
  const gid = intParam(id);
  return { garment: getGarment(gid), wearHistory: wearHistory(gid) };
});

export const PATCH = route<P>(async (req, { id }) => {
  const gid = intParam(id);
  const patch = await readJson(req, garmentPatchSchema);
  const before = getGarment(gid);
  const garment = updateGarment(gid, patch);
  const affectedPlans = before.available && !garment.available ? plansUsingGarments([gid]) : [];
  return { garment, affectedPlans };
});

export const DELETE = route<P>((_req, { id }) => {
  deleteGarment(intParam(id));
  return { ok: true };
});
