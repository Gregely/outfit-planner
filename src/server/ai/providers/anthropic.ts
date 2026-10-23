import Anthropic from "@anthropic-ai/sdk";
import { AiUnavailableError, scrubSecrets } from "../errors";
import { failure, httpFailure, networkFailure, unknownFailure } from "./shared";
import type { GenerateResult, ModelInfo, ProviderAdapter, ProviderContext } from "./types";

/**
 * Anthropic Claude via the official SDK: Messages API with structured outputs
 * (`output_config.format`), `output_config.effort`, and the server-side refusal fallback on
 * models that support it. Streams the response (recommended for long outputs) and reads the
 * final message; refusals and truncation are checked before the text.
 */

/** Models that run safety classifiers and accept `fallbacks: "default"` (Haiku 5.5 has no server-side fallback). */
const FALLBACK_MODELS = /^claude-(fable-5|mythos-5|opus-5|sonnet-5-5)/;
/** Older models that reject `output_config.effort`. */
const NO_EFFORT_MODELS = /^claude-(haiku-4-5|sonnet-4-5|opus-4-1|opus-4-0|sonnet-4-0|3)/;

type Message = {
  model?: string;
  stop_reason: string | null;
  stop_details?: { category?: string | null; explanation?: string | null; recommended_model?: string | null } | null;
  content: { type: string; text?: string }[];
};

function client(ctx: ProviderContext) {
  return new Anthropic({
    apiKey: ctx.bearer ? null : ctx.apiKey,
    authToken: ctx.bearer ? ctx.apiKey : null,
    baseURL: ctx.baseUrl ?? undefined,
    fetch: ctx.fetch,
    maxRetries: ctx.retries,
    timeout: ctx.timeoutMs,
    // The Android app calls the API directly from the device (see docs/ANDROID.md, Security).
    dangerouslyAllowBrowser: typeof window !== "undefined",
  });
}

function mapError(ctx: ProviderContext, err: unknown) {
  if (err instanceof Anthropic.APIConnectionTimeoutError) return networkFailure(ctx, err, true);
  if (err instanceof Anthropic.APIConnectionError) return networkFailure(ctx, err);
  if (err instanceof Anthropic.APIError) {
    const body = (err.error ?? {}) as { error?: { message?: string; type?: string } };
    return httpFailure(ctx, err.status, {
      type: body.error?.type ?? null,
      message: body.error?.message ?? err.message,
      requestId: err.requestID ?? null,
    });
  }
  return unknownFailure(ctx, err);
}

/** Text of the answer that was actually served: after the last `fallback` hand-off block, if any. */
export function answerText(message: Pick<Message, "content">): string {
  const lastHop = message.content.map((b) => b.type).lastIndexOf("fallback");
  return message.content
    .slice(lastHop + 1)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

export const anthropicAdapter: ProviderAdapter = {
  async generate(ctx, model, req): Promise<GenerateResult> {
    const sdk = client(ctx);
    const params: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? 32000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: {
        ...(req.effort && !NO_EFFORT_MODELS.test(model) ? { effort: req.effort } : {}),
        format: { type: "json_schema", schema: req.wire },
      },
    };
    if (ctx.settings.refusalFallback && FALLBACK_MODELS.test(model)) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }
    const send = async () => {
      const stream = sdk.beta.messages.stream(params as unknown as Parameters<Anthropic["beta"]["messages"]["stream"]>[0]);
      const message = (await stream.finalMessage()) as unknown as Message;
      return { message, requestId: stream.request_id ?? null };
    };
    let out: { message: Message; requestId: string | null };
    try {
      try {
        out = await send();
      } catch (err) {
        const mapped = mapError(ctx, err);
        // If this account or model doesn't accept the fallback beta, retry once without it.
        if (params.fallbacks && (mapped.reason === "bad_request" || mapped.reason === "unsupported") && /fallback/i.test(mapped.detail.message ?? "")) {
          console.warn(`[ai] ${req.task}: retrying without server-side fallback – ${scrubSecrets(mapped.detail.message ?? "")}`);
          delete params.fallbacks;
          delete params.betas;
          out = await send();
        } else throw mapped;
      }
    } catch (err) {
      throw err instanceof AiUnavailableError ? err : mapError(ctx, err);
    }
    const { message, requestId } = out;
    if (message.stop_reason === "refusal") {
      const d = message.stop_details ?? {};
      throw failure(
        ctx,
        "refused",
        { category: d.category ?? null, requestId, message: d.recommended_model ? `recommended retry model: ${d.recommended_model}` : null },
        d.explanation ? ` – ${d.explanation}` : "",
      );
    }
    if (message.stop_reason === "max_tokens") throw failure(ctx, "truncated", { requestId });
    return { text: answerText(message), model: message.model ?? model, requestId };
  },

  async listModels(ctx): Promise<ModelInfo[]> {
    const sdk = client(ctx);
    const out: ModelInfo[] = [];
    try {
      for await (const m of sdk.models.list({ limit: 100 })) out.push({ id: m.id, label: m.display_name });
    } catch (err) {
      throw mapError(ctx, err);
    }
    return out;
  },
};
