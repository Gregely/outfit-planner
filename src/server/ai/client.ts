import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { getSettings } from "@/server/services/settings";

/**
 * Thin wrapper around the official Anthropic SDK. The API key is read on the server
 * only and never leaves it. Every call uses structured outputs and is validated again
 * by the caller before anything reaches the user.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export function aiConfig() {
  const effort = (process.env.ANTHROPIC_EFFORT ?? "medium").trim() as Effort | "";
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    effort: effort || null,
    refusalFallback: (process.env.ANTHROPIC_REFUSAL_FALLBACK ?? "default").trim() !== "off",
  };
}

export type AiFailureReason =
  | "not_configured"
  | "disabled"
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "network"
  | "malformed"
  | "refused"
  | "bad_request"
  | "error";

export class AiUnavailableError extends Error {
  constructor(
    public reason: AiFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export const REASON_TEXT: Record<AiFailureReason, string> = {
  not_configured: "Claude isn't configured (no ANTHROPIC_API_KEY)",
  disabled: "Claude is switched off in Settings",
  auth: "the Anthropic API key was rejected",
  rate_limited: "Claude is rate-limited right now",
  overloaded: "Claude is temporarily overloaded",
  network: "Claude couldn't be reached",
  malformed: "Claude's answer couldn't be validated",
  refused: "Claude declined this request",
  bad_request: "the request to Claude was rejected",
  error: "Claude returned an error",
};

export function aiStatus(): { enabled: boolean; reason: AiFailureReason | null; model: string } {
  const cfg = aiConfig();
  if (process.env.AI_DISABLED === "1") return { enabled: false, reason: "disabled", model: cfg.model };
  if (!cfg.configured) return { enabled: false, reason: "not_configured", model: cfg.model };
  if (!getSettings().aiEnabled) return { enabled: false, reason: "disabled", model: cfg.model };
  return { enabled: true, reason: null, model: cfg.model };
}

/** Minimal surface we use, so tests can inject a fake without network access. */
export type AiClient = {
  beta: {
    messages: {
      parse: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{
        stop_reason: string | null;
        parsed_output: unknown;
      }>;
    };
  };
};

let injected: AiClient | null = null;
let cached: AiClient | null = null;

/** Test hook: replace the SDK client (pass null to restore). */
export function __setAiClient(client: AiClient | null) {
  injected = client;
}

function client(): AiClient {
  if (injected) return injected;
  if (!cached) {
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 2,
      timeout: 120_000,
    }) as unknown as AiClient;
  }
  return cached;
}

function mapError(err: unknown): AiUnavailableError {
  if (err instanceof AiUnavailableError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return new AiUnavailableError("auth", REASON_TEXT.auth);
  if (err instanceof Anthropic.RateLimitError) return new AiUnavailableError("rate_limited", REASON_TEXT.rate_limited);
  if (err instanceof Anthropic.BadRequestError) return new AiUnavailableError("bad_request", `${REASON_TEXT.bad_request}: ${err.message}`);
  if (err instanceof Anthropic.InternalServerError) return new AiUnavailableError("overloaded", REASON_TEXT.overloaded);
  if (err instanceof Anthropic.APIConnectionError) return new AiUnavailableError("network", REASON_TEXT.network);
  if (err instanceof Anthropic.APIError) return new AiUnavailableError("error", `${REASON_TEXT.error} (${err.status ?? "unknown"})`);
  // The SDK raises a plain AnthropicError when structured output fails schema validation.
  if (err instanceof Anthropic.AnthropicError) return new AiUnavailableError("malformed", REASON_TEXT.malformed);
  return new AiUnavailableError("error", err instanceof Error ? err.message : String(err));
}

export async function callStructured<T>(opts: {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: Effort;
}): Promise<T> {
  const status = aiStatus();
  if (!status.enabled) throw new AiUnavailableError(status.reason!, REASON_TEXT[status.reason!]);
  const cfg = aiConfig();
  const params: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: opts.maxTokens ?? 16000,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.prompt }],
    output_config: {
      ...(cfg.effort || opts.effort ? { effort: opts.effort ?? cfg.effort } : {}),
      format: betaZodOutputFormat(opts.schema),
    },
  };
  if (cfg.refusalFallback) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  let res: Awaited<ReturnType<AiClient["beta"]["messages"]["parse"]>>;
  try {
    res = await client().beta.messages.parse(params);
  } catch (err) {
    throw mapError(err);
  }
  if (res.stop_reason === "refusal") throw new AiUnavailableError("refused", REASON_TEXT.refused);
  if (res.stop_reason === "max_tokens") throw new AiUnavailableError("malformed", "Claude's answer was cut off");
  if (res.parsed_output === null || res.parsed_output === undefined) throw new AiUnavailableError("malformed", REASON_TEXT.malformed);
  // Validate again: never trust the shape of model output.
  const checked = opts.schema.safeParse(res.parsed_output);
  if (!checked.success) throw new AiUnavailableError("malformed", REASON_TEXT.malformed);
  return checked.data;
}
