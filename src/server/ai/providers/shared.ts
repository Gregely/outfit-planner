import { AiUnavailableError, reasonText, scrubSecrets, type AiErrorDetail, type AiFailureReason } from "../errors";
import type { ProviderContext } from "./types";

/**
 * Classify an HTTP error from any provider. Status codes carry most of the meaning; the
 * message decides between "that model isn't available", "the model doesn't support a
 * setting" and a generic rejected request – the three need different fixes.
 */
export function classifyHttpError(status: number | null | undefined, message: string): AiFailureReason {
  const m = message.toLowerCase();
  if (/api[_ ]?key[^.]*(not valid|invalid)|invalid[^.]*api[_ ]?key|incorrect api key|unauthenticated|invalid x-api-key|api_key_invalid/.test(m)) return "auth";
  if (status === 401) return "auth";
  if (status === 403) return /model/.test(m) && /(access|available|permission)/.test(m) ? "model_unavailable" : "auth";
  if (status === 429 || /resource_exhausted|quota/.test(m)) return "rate_limited";
  if (status === 408) return "timeout";
  if (status !== null && status !== undefined && status >= 500) return "overloaded";
  const aboutModel = /\bmodel\b/.test(m);
  if (status === 404) return aboutModel || /not[_ ]found/.test(m) ? "model_unavailable" : "bad_request";
  if (aboutModel && /(not found|does not exist|doesn't exist|unknown model|invalid model|no such model|not available|unavailable|not have access|do not have access|is not supported for|deprecated|decommissioned|retired)/.test(m)) {
    return "model_unavailable";
  }
  if (/(effort|reasoning|thinking|response_format|json_schema|output_config|structured output|responsejsonschema|response_mime_type|responsemimetype|not supported|unsupported|unrecognized|unknown (parameter|field|name)|extra inputs|additional properties)/.test(m)) {
    return "unsupported";
  }
  return status === 400 || status === 422 ? "bad_request" : "error";
}

export function httpFailure(ctx: ProviderContext, status: number | null | undefined, detail: Omit<AiErrorDetail, "status"> & { message: string }) {
  const reason = classifyHttpError(status, detail.message);
  const hint = reason === "model_unavailable" ? " Choose another model, or refresh the model list in Settings." : reason === "unsupported" ? " Try “Model default” for the reasoning setting, or another model." : "";
  return new AiUnavailableError(reason, reasonText(reason, ctx.label) + (hint ? `.${hint}` : ""), {
    ...detail,
    status: status ?? null,
    message: scrubSecrets(detail.message),
  });
}

export function networkFailure(ctx: ProviderContext, err: unknown, timeout = false) {
  const message = err instanceof Error ? err.message : String(err);
  const reason: AiFailureReason = timeout || /timed? ?out|timeout|aborted/i.test(message) ? "timeout" : "network";
  return new AiUnavailableError(reason, reasonText(reason, ctx.label), { message: scrubSecrets(message) });
}

/** Anything that isn't an HTTP or connection error: network-looking failures stay "network", the rest is an error. */
export function unknownFailure(ctx: ProviderContext, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
  if (/fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN|socket|Failed to fetch|Load failed/i.test(message + cause)) return networkFailure(ctx, err);
  if (/timed? ?out|timeout|aborted/i.test(message)) return networkFailure(ctx, err, true);
  return new AiUnavailableError("error", reasonText("error", ctx.label), { message: scrubSecrets(message + cause) });
}

export function failure(ctx: ProviderContext, reason: AiFailureReason, detail: AiErrorDetail = {}, extra = "") {
  return new AiUnavailableError(reason, `${reasonText(reason, ctx.label)}${extra}`, detail);
}

/** Models sometimes wrap JSON in a Markdown fence even when asked not to. */
export function stripJsonFence(text: string) {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1] : t;
}

/** For APIs without schema enforcement, the schema is described in the instructions instead. */
export function schemaInstructions(wire: unknown) {
  return `\n\nRespond with only one JSON object – no Markdown, no commentary – that matches this JSON Schema exactly (every property is required; use "" or "unspecified" or 0 for unknown values as the descriptions say):\n${JSON.stringify(wire)}`;
}
