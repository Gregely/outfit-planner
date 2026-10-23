import { route } from "@/server/api";
import { REASON_TEXT, aiStatus, describeAiError } from "@/server/ai/client";
import { aiExtractGarments } from "@/server/ai/tasks";

/**
 * Runs a real (tiny) garment import through the same schema, request parameters and response
 * parsing the app uses, so configuration or schema problems show up here with the API's own
 * error message and request id.
 */
export const POST = route(async () => {
  const status = aiStatus();
  if (!status.enabled) return { ok: false, message: REASON_TEXT[status.reason!] };
  try {
    const garments = await aiExtractGarments("black polyester running shorts");
    const g = garments[0];
    return {
      ok: Boolean(g),
      message: g ? `Connected to ${status.model}. Test import read: ${g.name} (${g.category}${g.subcategory ? ` / ${g.subcategory}` : ""}).` : `Connected to ${status.model}, but the test import returned no garments.`,
    };
  } catch (err) {
    return { ok: false, message: describeAiError(err) };
  }
});
