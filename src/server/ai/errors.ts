/**
 * Why an AI request didn't produce a usable answer, in terms that are the same for every
 * provider. Adapters translate each provider's errors into these; the stylist, importer and
 * planner fall back to the rule-based paths and show the message.
 */

export type AiFailureReason =
  | "not_configured"
  | "no_key"
  | "disabled"
  | "offline"
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "network"
  | "timeout"
  | "malformed"
  | "truncated"
  | "refused"
  | "model_unavailable"
  | "unsupported"
  | "bad_request"
  | "error";

export type AiErrorDetail = {
  status?: number | null;
  /** provider error type or code, e.g. "invalid_request_error" */
  type?: string | null;
  /** message from the provider or from our validation */
  message?: string | null;
  requestId?: string | null;
  /** refusals only */
  category?: string | null;
};

const TEXT: Record<AiFailureReason, string> = {
  not_configured: "no AI provider is set up",
  no_key: "{p} needs an API key",
  disabled: "AI suggestions are switched off in Settings",
  offline: "you're offline",
  auth: "{p} rejected the API key",
  rate_limited: "{p} is rate-limiting requests right now",
  overloaded: "{p} is temporarily overloaded",
  network: "{p} couldn't be reached",
  timeout: "the request to {p} timed out",
  malformed: "{p}'s answer didn't match the expected format",
  truncated: "{p}'s answer was cut off before it finished",
  refused: "{p} declined this request",
  model_unavailable: "that model isn't available from {p}",
  unsupported: "{p} doesn't support a setting this request used",
  bad_request: "{p} rejected the request",
  error: "{p} returned an error",
};

export function reasonText(reason: AiFailureReason, provider = "the AI provider") {
  return TEXT[reason].replace("{p}", provider);
}

/** Generic wording (no provider name), kept for callers that only have a reason. */
export const REASON_TEXT = Object.fromEntries(Object.keys(TEXT).map((k) => [k, reasonText(k as AiFailureReason)])) as Record<AiFailureReason, string>;

export class AiUnavailableError extends Error {
  constructor(
    public reason: AiFailureReason,
    message: string,
    public detail: AiErrorDetail = {},
  ) {
    super(message);
  }
}

/** Reasons where retrying later (rather than changing settings) is the fix. */
export const TRANSIENT_REASONS: AiFailureReason[] = ["rate_limited", "overloaded", "network", "timeout", "offline"];

/** Strip anything that looks like a credential from text that might be shown or logged. */
export function scrubSecrets(text: string): string {
  return text
    .replace(/\b(sk-(?:ant-|proj-)?[A-Za-z0-9_-]{8,})/g, "[redacted key]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted key]")
    .replace(/([?&](?:key|api_key|apikey|access_token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(authorization|x-api-key|x-goog-api-key)(["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\s"',}]+/gi, "$1$2[redacted]");
}

/**
 * One-line, user-facing description of a failure, including the specifics (API message,
 * status, request id, refusal category) so problems can be diagnosed instead of guessed.
 */
export function describeAiError(err: unknown): string {
  if (!(err instanceof AiUnavailableError)) return scrubSecrets(err instanceof Error ? err.message : String(err));
  const d = err.detail;
  const bits = [d.status ? String(d.status) : null, d.type, d.category ? `category: ${d.category}` : null].filter(Boolean).join(", ");
  const msg = d.message && !err.message.includes(d.message) ? `: ${d.message}` : "";
  const id = d.requestId ? ` (request ${d.requestId})` : "";
  return scrubSecrets(`${err.message}${bits ? ` [${bits}]` : ""}${msg}${id}`);
}

export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
