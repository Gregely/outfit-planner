import { route, intParam } from "@/server/api";
import { deleteWearLog } from "@/server/services/wear";

export const DELETE = route<{ id: string }>((_req, { id }) => {
  deleteWearLog(intParam(id));
  return { ok: true };
});
