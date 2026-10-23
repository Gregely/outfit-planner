import OpenAI from "openai";
import { AiUnavailableError } from "../errors";
import { failure, httpFailure, networkFailure, schemaInstructions, stripJsonFence, unknownFailure } from "./shared";
import type { GenerateResult, ModelInfo, ProviderAdapter, ProviderContext } from "./types";

/**
 * OpenAI via the official SDK.
 *
 * - OpenAI itself: the Responses API with Structured Outputs (`text.format` json_schema,
 *   strict) and `reasoning.effort`; `store: false` so answers aren't retained for later
 *   retrieval.
 * - OpenAI-compatible servers (vLLM, LM Studio, Ollama, OpenRouter, llama.cpp…): Chat
 *   Completions, which those servers implement far more widely than the Responses API. How
 *   JSON is requested is configurable, because support for `response_format` varies.
 */

function client(ctx: ProviderContext) {
  return new OpenAI({
    // Local servers often need no key; the SDK still requires a value.
    apiKey: ctx.apiKey ?? "not-needed",
    baseURL: ctx.baseUrl ?? undefined,
    fetch: ctx.fetch,
    maxRetries: ctx.retries,
    timeout: ctx.timeoutMs,
    dangerouslyAllowBrowser: typeof window !== "undefined",
  });
}

function mapError(ctx: ProviderContext, err: unknown) {
  if (err instanceof AiUnavailableError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError) return networkFailure(ctx, err, true);
  if (err instanceof OpenAI.APIConnectionError) return networkFailure(ctx, err);
  if (err instanceof OpenAI.APIError) {
    const body = (err.error ?? {}) as { message?: string; type?: string; code?: string };
    return httpFailure(ctx, err.status, {
      type: err.code ?? body.code ?? err.type ?? body.type ?? null,
      message: body.message ?? err.message,
      requestId: err.requestID ?? null,
    });
  }
  return unknownFailure(ctx, err);
}

/** Text-generation models only: the list endpoint also returns embedding, audio and image models. */
const NON_TEXT = /(embed|tts|whisper|transcribe|dall-e|image|audio|realtime|moderation|sora|speech|search-preview|computer-use)/i;

async function listModels(ctx: ProviderContext, filter: boolean): Promise<ModelInfo[]> {
  const out: ModelInfo[] = [];
  try {
    for await (const m of client(ctx).models.list()) {
      if (!filter || !NON_TEXT.test(m.id)) out.push({ id: m.id });
    }
  } catch (err) {
    throw mapError(ctx, err);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export const openaiAdapter: ProviderAdapter = {
  async generate(ctx, model, req): Promise<GenerateResult> {
    let res: OpenAI.Responses.Response;
    try {
      res = await client(ctx).responses.create({
        model,
        instructions: req.system,
        input: req.prompt,
        ...(req.maxTokens ? { max_output_tokens: req.maxTokens } : {}),
        ...(req.effort ? { reasoning: { effort: req.effort as OpenAI.ReasoningEffort } } : {}),
        text: { format: { type: "json_schema", name: req.schemaName, schema: req.wire as Record<string, unknown>, strict: true } },
        store: false,
      });
    } catch (err) {
      throw mapError(ctx, err);
    }
    const requestId = (res as { _request_id?: string | null })._request_id ?? null;
    for (const item of res.output ?? []) {
      if (item.type !== "message") continue;
      for (const part of item.content) {
        if (part.type === "refusal") throw failure(ctx, "refused", { requestId }, part.refusal ? ` – ${part.refusal}` : "");
      }
    }
    if (res.status === "incomplete") {
      const why = res.incomplete_details?.reason ?? null;
      if (why === "content_filter") throw failure(ctx, "refused", { requestId, category: "content_filter" });
      throw failure(ctx, "truncated", { requestId, message: why });
    }
    if (res.status === "failed") throw failure(ctx, "error", { requestId, message: res.error?.message ?? "the response failed" });
    return { text: res.output_text ?? "", model: res.model ?? model, requestId };
  },
  listModels: (ctx) => listModels(ctx, true),
};

type Mode = "json_schema" | "json_object" | "prompt";

/** A rejection that means "this server doesn't do that response_format" rather than a real error. */
function formatUnsupported(err: AiUnavailableError) {
  return (err.reason === "unsupported" || err.reason === "bad_request") && /(response_format|json_schema|json_object|schema|structured|grammar|format)/i.test(err.detail.message ?? "");
}

export const compatibleAdapter: ProviderAdapter = {
  async generate(ctx, model, req): Promise<GenerateResult> {
    const configured = ctx.settings.structured as "auto" | Mode;
    const modes: Mode[] = configured === "auto" ? ["json_schema", "json_object", "prompt"] : [configured];
    let lastError: AiUnavailableError | null = null;
    for (const mode of modes) {
      try {
        return await completeOnce(ctx, model, req, mode);
      } catch (err) {
        const mapped = mapError(ctx, err);
        if (configured === "auto" && formatUnsupported(mapped)) {
          console.warn(`[ai] ${req.task}: ${ctx.label} rejected response_format ${mode}; trying the next way of asking for JSON`);
          lastError = mapped;
          continue;
        }
        throw mapped;
      }
    }
    throw lastError ?? failure(ctx, "unsupported");
  },
  listModels: (ctx) => listModels(ctx, false),
};

async function completeOnce(ctx: ProviderContext, model: string, req: Parameters<ProviderAdapter["generate"]>[2], mode: Mode): Promise<GenerateResult> {
  const system = mode === "json_schema" ? req.system : req.system + schemaInstructions(req.wire);
  const res = await client(ctx).chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: req.prompt },
    ],
    // Compatible servers commonly understand max_tokens but not max_completion_tokens.
    ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
    ...(req.effort ? { reasoning_effort: req.effort as OpenAI.ReasoningEffort } : {}),
    ...(mode === "json_schema"
      ? { response_format: { type: "json_schema" as const, json_schema: { name: req.schemaName, schema: req.wire as Record<string, unknown>, strict: true } } }
      : mode === "json_object"
        ? { response_format: { type: "json_object" as const } }
        : {}),
  });
  const requestId = (res as { _request_id?: string | null })._request_id ?? null;
  const choice = res.choices?.[0];
  if (!choice) throw failure(ctx, "malformed", { requestId, message: "the response had no choices" });
  if (choice.message?.refusal) throw failure(ctx, "refused", { requestId }, ` – ${choice.message.refusal}`);
  if (choice.finish_reason === "length") throw failure(ctx, "truncated", { requestId });
  if (choice.finish_reason === "content_filter") throw failure(ctx, "refused", { requestId, category: "content_filter" });
  return { text: stripJsonFence(choice.message?.content ?? ""), model: res.model || model, requestId };
}
