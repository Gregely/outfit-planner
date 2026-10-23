import { z } from "zod";
import { route, readJson } from "@/server/api";
import { deleteProviderKey, saveProviderKey } from "@/server/services/ai-settings";

/** Write-only: a key can be saved or removed, never read back. */
export const PUT = route<{ id: string }>(async (req, { id }) => {
  await saveProviderKey(id, await readJson(req, z.unknown(), { maxBytes: 2_000 }));
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async (_req, { id }) => {
  await deleteProviderKey(id);
  return { ok: true };
});
