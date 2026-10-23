import { route } from "@/server/api";
import { removeCustomEndpoint } from "@/server/services/ai-settings";

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await removeCustomEndpoint(id);
  return { ok: true };
});
