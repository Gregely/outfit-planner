import { z } from "zod";
import { route, readJson } from "@/server/api";
import { testProvider } from "@/server/ai/client";
import { modelIdSchema } from "@/server/ai/config";
import { assertProvider } from "@/server/services/ai-settings";

/** A real request to the provider; reports exactly what happened. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  assertProvider(id);
  const { model } = await readJson(req, z.object({ model: modelIdSchema }), { maxBytes: 2_000 });
  return testProvider(id, model);
});
