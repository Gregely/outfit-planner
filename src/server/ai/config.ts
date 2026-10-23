import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { settings } from "@/server/db/schema";
import { BUILT_IN_PROVIDERS, PROVIDERS, STRUCTURED_MODES, providerKindOf, type ProviderKind, type TaskGroup } from "@/lib/ai-providers";
import { secretStore } from "@/server/platform/secrets";

/**
 * Which AI provider and model each kind of task uses, plus per-provider options. Stored in the
 * settings table under "ai" – a device setting, so it is left out of backups and survives a
 * restore. API keys are NOT stored here (see server/platform/secrets.ts).
 */

const AI_KEY = "ai";

const providerId = z
  .string()
  .trim()
  .regex(/^(anthropic|openai|gemini|custom-[a-z0-9-]{1,40})$/, "Unknown provider");
export const modelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[\w.:/@+-]+$/, "Model IDs can only contain letters, numbers and . : / @ + - _");

export const targetSchema = z.object({ provider: providerId, model: modelIdSchema });
export type AiTarget = z.output<typeof targetSchema>;

const modelInfoSchema = z.object({ id: modelIdSchema, label: z.string().max(200).optional() });

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Use an http:// or https:// address");

export const providerSettingsSchema = z.object({
  /** custom endpoints only */
  name: z.string().trim().min(1).max(60).optional(),
  /** override the API address (required for custom endpoints) */
  baseUrl: httpUrl.nullable().default(null),
  /** reasoning effort / thinking level; null = the model's default */
  effort: z.string().trim().max(20).nullable().default(null),
  /** custom endpoints: how to ask for JSON */
  structured: z.enum(STRUCTURED_MODES.map((m) => m.id) as [string, ...string[]]).default("auto"),
  /** custom endpoints: whether requests need an API key (local servers usually don't) */
  keyRequired: z.boolean().default(false),
  /** Anthropic: use the API's server-side refusal fallback on models that support it */
  refusalFallback: z.boolean().default(true),
  /** last model list fetched from the provider */
  models: z.array(modelInfoSchema).max(500).default([]),
  modelsFetchedAt: z.string().nullable().default(null),
  lastTest: z
    .object({ ok: z.boolean(), at: z.string(), message: z.string().max(600), model: z.string().nullable() })
    .nullable()
    .default(null),
});
export type ProviderSettings = z.output<typeof providerSettingsSchema>;

export const aiConfigSchema = z.object({
  version: z.literal(1).default(1),
  active: targetSchema.nullable().default(null),
  tasks: z
    .object({ import: targetSchema.nullable().default(null), daily: targetSchema.nullable().default(null), weekly: targetSchema.nullable().default(null) })
    .default({ import: null, daily: null, weekly: null }),
  providers: z.record(providerId, providerSettingsSchema).default({}),
});
export type AiConfig = z.output<typeof aiConfigSchema>;

const defaults = () => providerSettingsSchema.parse({});

/**
 * Before anything is saved, derive a configuration from the environment the web app used to
 * read (ANTHROPIC_API_KEY / ANTHROPIC_MODEL / ANTHROPIC_EFFORT / ANTHROPIC_REFUSAL_FALLBACK),
 * so existing setups keep working unchanged.
 */
function fromEnvironment(): AiConfig {
  const config = aiConfigSchema.parse({});
  const env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {};
  const anthropic = { ...defaults() };
  const effort = env.ANTHROPIC_EFFORT?.trim();
  if (effort) anthropic.effort = effort;
  if ((env.ANTHROPIC_REFUSAL_FALLBACK ?? "").trim() === "off") anthropic.refusalFallback = false;
  config.providers.anthropic = anthropic;
  const envModel: Partial<Record<ProviderKind, string | undefined>> = {
    anthropic: env.ANTHROPIC_MODEL?.trim(),
    openai: env.OPENAI_MODEL?.trim(),
    gemini: env.GEMINI_MODEL?.trim(),
  };
  for (const id of BUILT_IN_PROVIDERS) {
    if (secretStore.has(id)) {
      config.active = { provider: id, model: envModel[id] || PROVIDERS[id].defaultModel! };
      break;
    }
  }
  return config;
}

export function getAiConfig(): AiConfig {
  const row = getDb().select().from(settings).where(eq(settings.key, AI_KEY)).get();
  if (!row) return fromEnvironment();
  const parsed = aiConfigSchema.safeParse(row.value);
  return parsed.success ? parsed.data : fromEnvironment();
}

export function saveAiConfig(next: AiConfig): AiConfig {
  const data = aiConfigSchema.parse(next);
  getDb()
    .insert(settings)
    .values({ key: AI_KEY, value: data })
    .onConflictDoUpdate({ target: settings.key, set: { value: data } })
    .run();
  return data;
}

export function providerSettings(config: AiConfig, id: string): ProviderSettings {
  return config.providers[id] ?? defaults();
}

export function updateProvider(id: string, patch: Partial<ProviderSettings>): AiConfig {
  const config = getAiConfig();
  config.providers[id] = providerSettingsSchema.parse({ ...providerSettings(config, id), ...patch });
  return saveAiConfig(config);
}

/** Built-in providers plus any custom endpoints the person added. */
export function providerIds(config: AiConfig): string[] {
  return [...BUILT_IN_PROVIDERS, ...Object.keys(config.providers).filter((id) => id.startsWith("custom-"))];
}

export function providerLabel(config: AiConfig, id: string): string {
  const kind = providerKindOf(id);
  if (kind === "openai-compatible") return providerSettings(config, id).name ?? "Custom endpoint";
  return PROVIDERS[kind].vendor;
}

export function providerExists(config: AiConfig, id: string) {
  return providerIds(config).includes(id) && (providerKindOf(id) !== "openai-compatible" || Boolean(config.providers[id]?.baseUrl));
}

/** The provider and model a task should use: its own override, else the active choice. */
export function targetFor(config: AiConfig, group: TaskGroup | null): AiTarget | null {
  const override = group ? config.tasks[group] : null;
  const target = override ?? config.active;
  return target && providerExists(config, target.provider) ? target : null;
}

export function removeProviderReferences(config: AiConfig, id: string): AiConfig {
  const strip = (t: AiTarget | null) => (t?.provider === id ? null : t);
  return {
    ...config,
    active: strip(config.active),
    tasks: { import: strip(config.tasks.import), daily: strip(config.tasks.daily), weekly: strip(config.tasks.weekly) },
  };
}
