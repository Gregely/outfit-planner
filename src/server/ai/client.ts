import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getSettings } from "@/server/services/settings";
import { describeSchemaLimits, normaliseToSchema, toWireSchema, type WireSchema } from "./wire-schema";

/**
 * Thin wrapper around the official Anthropic SDK. The API key is read on the server only.
 *
 * Calls use structured outputs (`output_config.format` with a JSON schema). We build the wire
 * schema ourselves (see wire-schema.ts) and parse the reply ourselves instead of using the SDK's
 * `parse()` helper, because that helper validates every text block regardless of `stop_reason`:
 * refusals, truncated answers and text written before a server-side fallback hop all surfaced as
 * a generic "failed to parse" error. Here each outcome is reported for what it is.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** Models that run safety classifiers and accept `fallbacks: "default"` (Haiku 5.5 has no server-side fallback). */
const FALLBACK_MODELS = /^claude-(fable-5|mythos-5|opus-5|sonnet-5-5)/;
/** Older models that reject `output_config.effort`. */
const NO_EFFORT_MODELS = /^claude-(haiku-4-5|sonnet-4-5|opus-4-1|opus-4-0|sonnet-4-0|3)/;

export function aiConfig() {
  const effort = (process.env.ANTHROPIC_EFFORT ?? "medium").trim() as Effort | "";
  const model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim()),
    model,
    effort: effort && !NO_EFFORT_MODELS.test(model) ? effort : null,
    refusalFallback: (process.env.ANTHROPIC_REFUSAL_FALLBACK ?? "default").trim() !== "off" && FALLBACK_MODELS.test(model),
  };
}

export type AiFailureReason =
  | "not_configured"
  | "disabled"
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "network"
  | "timeout"
  | "malformed"
  | "truncated"
  | "refused"
  | "bad_request"
  | "error";

export type AiErrorDetail = {
  status?: number | null;
  /** API error type, e.g. "invalid_request_error" */
  type?: string | null;
  /** message from the API or from our validation */
  message?: string | null;
  requestId?: string | null;
  /** refusals only */
  category?: string | null;
};

export class AiUnavailableError extends Error {
  constructor(
    public reason: AiFailureReason,
    message: string,
    public detail: AiErrorDetail = {},
  ) {
    super(message);
  }
}

export const REASON_TEXT: Record<AiFailureReason, string> = {
  not_configured: "Claude isn't configured (no ANTHROPIC_API_KEY)",
  disabled: "Claude is switched off in Settings",
  auth: "the Anthropic API key was rejected",
  rate_limited: "Claude is rate-limited right now",
  overloaded: "the Anthropic API is temporarily overloaded",
  network: "the Anthropic API couldn't be reached",
  timeout: "the request to Claude timed out",
  malformed: "Claude's answer didn't match the expected format",
  truncated: "Claude's answer was cut off before it finished",
  refused: "Claude declined this request",
  bad_request: "the Anthropic API rejected the request",
  error: "the Anthropic API returned an error",
};

/**
 * One-line, user-facing description of a failure, including the specifics (API message,
 * status, request id, refusal category) so problems can be diagnosed instead of guessed.
 */
export function describeAiError(err: unknown): string {
  if (!(err instanceof AiUnavailableError)) return err instanceof Error ? err.message : String(err);
  const d = err.detail;
  const bits = [d.status ? String(d.status) : null, d.type, d.category ? `category: ${d.category}` : null].filter(Boolean).join(", ");
  const msg = d.message && !err.message.includes(d.message) ? `: ${d.message}` : "";
  const id = d.requestId ? ` (request ${d.requestId})` : "";
  return `${err.message}${bits ? ` [${bits}]` : ""}${msg}${id}`;
}

export function aiStatus(): { enabled: boolean; reason: AiFailureReason | null; model: string } {
  const cfg = aiConfig();
  if (process.env.AI_DISABLED === "1") return { enabled: false, reason: "disabled", model: cfg.model };
  if (!cfg.configured) return { enabled: false, reason: "not_configured", model: cfg.model };
  if (!getSettings().aiEnabled) return { enabled: false, reason: "disabled", model: cfg.model };
  return { enabled: true, reason: null, model: cfg.model };
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/** The parts of a Messages API response we read. */
export type AiMessage = {
  model?: string;
  stop_reason: string | null;
  stop_details?: { type?: string; category?: string | null; explanation?: string | null; recommended_model?: string | null } | null;
  content: { type: string; text?: string }[];
  _request_id?: string | null;
};

export type AiTransport = (params: Record<string, unknown>) => Promise<AiMessage>;

let injected: AiTransport | null = null;
let sdk: Anthropic | null = null;

/** Test hook: replace the network transport (pass null to restore the SDK). */
export function __setAiTransport(transport: AiTransport | null) {
  injected = transport;
}

/** Streams the request (recommended for long outputs) and returns the final message. */
const sdkTransport: AiTransport = async (params) => {
  sdk ??= new Anthropic({ maxRetries: 2, timeout: 10 * 60_000 });
  const stream = sdk.beta.messages.stream(params as unknown as Parameters<Anthropic["beta"]["messages"]["stream"]>[0]);
  const message = await stream.finalMessage();
  return { ...(message as unknown as AiMessage), _request_id: stream.request_id ?? null };
};

function mapError(err: unknown): AiUnavailableError {
  if (err instanceof AiUnavailableError) return err;
  if (err instanceof Anthropic.APIError) {
    const body = (err.error ?? {}) as { error?: { message?: string; type?: string } };
    const detail: AiErrorDetail = {
      status: err.status ?? null,
      type: err.type ?? body.error?.type ?? null,
      message: body.error?.message ?? err.message,
      requestId: err.requestID ?? null,
    };
    if (err instanceof Anthropic.APIConnectionTimeoutError) return new AiUnavailableError("timeout", REASON_TEXT.timeout, detail);
    if (err instanceof Anthropic.APIConnectionError) return new AiUnavailableError("network", REASON_TEXT.network, { ...detail, message: err.message });
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new AiUnavailableError("auth", REASON_TEXT.auth, detail);
    if (err instanceof Anthropic.RateLimitError) return new AiUnavailableError("rate_limited", REASON_TEXT.rate_limited, detail);
    if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError || err instanceof Anthropic.UnprocessableEntityError)
      return new AiUnavailableError("bad_request", REASON_TEXT.bad_request, detail);
    if (err.status === 529 || err instanceof Anthropic.InternalServerError) return new AiUnavailableError("overloaded", REASON_TEXT.overloaded, detail);
    return new AiUnavailableError("error", REASON_TEXT.error, detail);
  }
  return new AiUnavailableError("error", REASON_TEXT.error, { message: err instanceof Error ? err.message : String(err) });
}

/* ------------------------------------------------------------------ */
/* Structured calls                                                    */
/* ------------------------------------------------------------------ */

const wireCache = new WeakMap<z.ZodType, WireSchema>();

function wireFor(schema: z.ZodType): WireSchema {
  let wire = wireCache.get(schema);
  if (!wire) {
    wire = toWireSchema(schema);
    const limits = describeSchemaLimits(wire);
    if (limits.problems.length) {
      // A programming error, caught by tests – never send a schema the API will refuse to compile.
      throw new AiUnavailableError("bad_request", "Internal error: the structured-output schema exceeds the API's documented limits", {
        message: limits.problems.join("; "),
      });
    }
    wireCache.set(schema, wire);
  }
  return wire;
}

/** Text of the answer that was actually served: after the last `fallback` hand-off block, if any. */
export function answerText(message: AiMessage): string {
  const lastHop = message.content.map((b) => b.type).lastIndexOf("fallback");
  return message.content
    .slice(lastHop + 1)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

export async function callStructured<T>(opts: { system: string; prompt: string; schema: z.ZodType<T>; maxTokens?: number; effort?: Effort; task: string }): Promise<T> {
  const status = aiStatus();
  if (!status.enabled) throw new AiUnavailableError(status.reason!, REASON_TEXT[status.reason!]);
  const cfg = aiConfig();
  const wire = wireFor(opts.schema);
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: opts.maxTokens ?? 32000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: {
      ...(cfg.effort ? { effort: opts.effort ?? cfg.effort } : {}),
      format: { type: "json_schema", schema: wire },
    },
  };
  if (cfg.refusalFallback) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const transport = injected ?? sdkTransport;
  let message: AiMessage;
  try {
    try {
      message = await transport(params);
    } catch (err) {
      // If this model/account doesn't accept the fallback beta, retry once without it rather than failing.
      const mapped = mapError(err);
      if (mapped.reason === "bad_request" && params.fallbacks && /fallback/i.test(mapped.detail.message ?? "")) {
        console.warn(`[ai] ${opts.task}: retrying without server-side fallback – ${describeAiError(mapped)}`);
        delete params.fallbacks;
        delete params.betas;
        message = await transport(params);
      } else throw mapped;
    }
  } catch (err) {
    const mapped = mapError(err);
    console.error(`[ai] ${opts.task} failed: ${describeAiError(mapped)}`);
    throw mapped;
  }
  return readAnswer(message, opts.schema, wire, opts.task);
}

export function readAnswer<T>(message: AiMessage, schema: z.ZodType<T>, wire: WireSchema, task: string): T {
  const requestId = message._request_id ?? null;
  if (message.stop_reason === "refusal") {
    const d = message.stop_details ?? {};
    const err = new AiUnavailableError(
      "refused",
      `${REASON_TEXT.refused}${d.explanation ? ` – ${d.explanation}` : ""}`,
      { category: d.category ?? null, requestId, message: d.recommended_model ? `recommended retry model: ${d.recommended_model}` : null },
    );
    console.warn(`[ai] ${task}: ${describeAiError(err)}`);
    throw err;
  }
  if (message.stop_reason === "max_tokens") {
    const err = new AiUnavailableError("truncated", REASON_TEXT.truncated, { requestId });
    console.warn(`[ai] ${task}: ${describeAiError(err)}`);
    throw err;
  }
  const text = answerText(message).trim();
  const fail = (why: string) => {
    const err = new AiUnavailableError("malformed", REASON_TEXT.malformed, { message: why, requestId });
    console.error(`[ai] ${task}: ${describeAiError(err)}`);
    return err;
  };
  if (!text) throw fail(`no text in the response (stop_reason: ${message.stop_reason ?? "none"})`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw fail(`not valid JSON: ${text.slice(0, 120)}`);
  }
  // The API may return enum values that differ only in letter case; map them to the canonical value.
  const checked = schema.safeParse(normaliseToSchema(json, wire));
  if (!checked.success) {
    throw fail(checked.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  }
  return checked.data;
}
