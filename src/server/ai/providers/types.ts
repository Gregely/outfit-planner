import type { ProviderKind } from "@/lib/ai-providers";
import type { ProviderSettings } from "../config";
import type { WireSchema } from "../wire-schema";

/** One structured-output request, in provider-neutral terms. */
export type GenerateRequest = {
  system: string;
  prompt: string;
  /** JSON Schema the answer must follow (already checked against documented limits) */
  wire: WireSchema;
  /** short identifier some APIs require for the schema */
  schemaName: string;
  /** upper bound for the answer; null = let the provider decide */
  maxTokens: number | null;
  effort: string | null;
  task: string;
};

/** The raw answer text; the caller parses and validates it the same way for every provider. */
export type GenerateResult = { text: string; model: string; requestId: string | null };

export type ProviderContext = {
  id: string;
  kind: ProviderKind;
  label: string;
  settings: ProviderSettings;
  apiKey: string | null;
  /** Anthropic only: the credential is an OAuth bearer token rather than an API key */
  bearer: boolean;
  baseUrl: string | null;
  fetch: typeof fetch;
  timeoutMs: number;
  /** SDK retries for 429 / 5xx / connection errors */
  retries: number;
};

export type ModelInfo = { id: string; label?: string };

export interface ProviderAdapter {
  generate(ctx: ProviderContext, model: string, req: GenerateRequest): Promise<GenerateResult>;
  listModels(ctx: ProviderContext): Promise<ModelInfo[]>;
}
