import type { ProviderKind } from "@/lib/ai-providers";
import { anthropicAdapter } from "./anthropic";
import { compatibleAdapter, openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import type { ProviderAdapter } from "./types";

/** Adding a provider = one adapter here plus a descriptor in lib/ai-providers.ts. */
export const ADAPTERS: Record<ProviderKind, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  "openai-compatible": compatibleAdapter,
};

export type { GenerateRequest, GenerateResult, ModelInfo, ProviderAdapter, ProviderContext } from "./types";
