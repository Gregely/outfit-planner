import { route, intParam } from "@/server/api";
import { deleteFeedback } from "@/server/services/preferences";

export const DELETE = route<{ id: string }>((_req, { id }) => {
  deleteFeedback(intParam(id));
  return { ok: true };
});
