import { route, readJson, intParam } from "@/server/api";
import { deleteActivity, updateActivity } from "@/server/services/plans";
import { activityPatchSchema } from "@/lib/schemas";

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => ({ activity: updateActivity(intParam(id), await readJson(req, activityPatchSchema)) }));

export const DELETE = route<P>((_req, { id }) => {
  deleteActivity(intParam(id));
  return { ok: true };
});
