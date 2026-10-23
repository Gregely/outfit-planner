import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { AiUnavailableError } from "../errors";
import { failure, httpFailure, unknownFailure } from "./shared";
import type { GenerateResult, ModelInfo, ProviderAdapter, ProviderContext } from "./types";

/**
 * Google Gemini via the official Google Gen AI SDK: generateContent with JSON output
 * (`responseMimeType: "application/json"` + `responseJsonSchema`) and `thinkingConfig`.
 * The key goes in the x-goog-api-key header, never in the URL.
 */

const LEVELS: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const BLOCKED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
  FinishReason.IMAGE_PROHIBITED_CONTENT,
]);

function client(ctx: ProviderContext) {
  return new GoogleGenAI({
    apiKey: ctx.apiKey ?? undefined,
    httpOptions: { baseUrl: ctx.baseUrl ?? undefined, fetch: ctx.fetch, timeout: ctx.timeoutMs, retryOptions: { attempts: ctx.retries + 1 } },
  });
}

/** The SDK reports API errors with the HTTP status and the JSON error body as the message. */
function mapError(ctx: ProviderContext, err: unknown) {
  if (err instanceof AiUnavailableError) return err;
  if (err instanceof ApiError) {
    let message = err.message;
    let type: string | null = null;
    try {
      const body = JSON.parse(message.slice(message.indexOf("{"))) as { error?: { message?: string; status?: string } };
      if (body.error?.message) message = body.error.message;
      type = body.error?.status ?? null;
    } catch {
      // keep the raw message
    }
    return httpFailure(ctx, err.status, { type, message });
  }
  return unknownFailure(ctx, err);
}

export const geminiAdapter: ProviderAdapter = {
  async generate(ctx, model, req): Promise<GenerateResult> {
    let res: GenerateContentResponse;
    try {
      res = await client(ctx).models.generateContent({
        model,
        contents: req.prompt,
        config: {
          systemInstruction: req.system,
          responseMimeType: "application/json",
          responseJsonSchema: req.wire,
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
          ...(req.effort && LEVELS[req.effort] ? { thinkingConfig: { thinkingLevel: LEVELS[req.effort] } } : {}),
        },
      });
    } catch (err) {
      throw mapError(ctx, err);
    }
    const requestId = res.responseId ?? null;
    if (res.promptFeedback?.blockReason) {
      throw failure(ctx, "refused", { requestId, category: String(res.promptFeedback.blockReason) }, res.promptFeedback.blockReasonMessage ? ` – ${res.promptFeedback.blockReasonMessage}` : "");
    }
    const candidate = res.candidates?.[0];
    const finish = candidate?.finishReason;
    if (finish && BLOCKED.has(finish)) throw failure(ctx, "refused", { requestId, category: String(finish) });
    if (finish === FinishReason.MAX_TOKENS) throw failure(ctx, "truncated", { requestId });
    return { text: res.text ?? "", model: res.modelVersion ?? model, requestId };
  },

  async listModels(ctx): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    try {
      const pager = await client(ctx).models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        if (!m.name || !(m.supportedActions ?? []).includes("generateContent")) continue;
        out.push({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? undefined });
      }
    } catch (err) {
      throw mapError(ctx, err);
    }
    return out;
  },
};
