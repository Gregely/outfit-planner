import { route } from "@/server/api";
import { AiUnavailableError, describeAiError, listProviderModels } from "@/server/ai/client";
import { assertProvider } from "@/server/services/ai-settings";

/** Fetch the provider's current model list (and remember it for the picker). */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  assertProvider(id);
  try {
    const models = await listProviderModels(id);
    return { ok: true, models, message: `${models.length} model${models.length === 1 ? "" : "s"} found.` };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return { ok: false, models: [], message: describeAiError(err), reason: err.reason };
  }
});
