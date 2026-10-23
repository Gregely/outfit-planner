import "server-only";
import { z } from "zod";
import { PROVIDERS, STRUCTURED_MODES, TASK_GROUPS, providerKindOf, type ProviderKind, type TaskGroup } from "@/lib/ai-providers";
import { BadRequestError, NotFoundError } from "@/server/errors";
import { secretStore } from "@/server/platform/secrets";
import { aiStatus, setProviderKey } from "@/server/ai/client";
import {
  getAiConfig,
  providerExists,
  providerIds,
  providerLabel,
  providerSettings,
  providerSettingsSchema,
  removeProviderReferences,
  saveAiConfig,
  targetSchema,
} from "@/server/ai/config";

/**
 * Settings → AI providers. Everything here is safe to send to the browser: keys are reported
 * only as "configured / where from", never returned.
 */

export type ProviderView = {
  id: string;
  kind: ProviderKind;
  label: string;
  /** custom endpoints only */
  name: string | null;
  baseUrl: string | null;
  defaultBaseUrl: string | null;
  effort: string | null;
  structured: string;
  keyRequired: boolean;
  refusalFallback: boolean;
  key: { configured: boolean; source: "stored" | "environment" | null };
  models: { id: string; label?: string; source: "live" | "catalogue" }[];
  modelsFetchedAt: string | null;
  lastTest: { ok: boolean; at: string; message: string; model: string | null } | null;
  /** short status line for the provider card */
  status: { tone: "ok" | "warn" | "off"; text: string };
};

export type AiSettingsView = {
  enabled: boolean;
  active: { provider: string; model: string } | null;
  tasks: Record<TaskGroup, { provider: string; model: string } | null>;
  providers: ProviderView[];
  status: Record<TaskGroup, ReturnType<typeof aiStatus>>;
  storage: { kind: string; description: string };
};

function modelsFor(id: string, live: { id: string; label?: string }[]) {
  const kind = providerKindOf(id);
  const out: ProviderView["models"] = [];
  const seen = new Set<string>();
  for (const m of PROVIDERS[kind].catalogue) {
    seen.add(m.id);
    out.push({ id: m.id, label: m.label, source: "catalogue" });
  }
  for (const m of live) if (!seen.has(m.id)) out.push({ id: m.id, label: m.label, source: "live" });
  return out;
}

export function getAiSettingsView(enabled: boolean): AiSettingsView {
  const config = getAiConfig();
  const providers = providerIds(config).map((id): ProviderView => {
    const kind = providerKindOf(id);
    const s = providerSettings(config, id);
    const keyRequired = kind === "openai-compatible" ? s.keyRequired : PROVIDERS[kind].keyRequired;
    const key = { configured: secretStore.has(id), source: secretStore.source(id) };
    const usable = (!keyRequired || key.configured) && (kind !== "openai-compatible" || Boolean(s.baseUrl));
    const status: ProviderView["status"] = !usable
      ? { tone: "off", text: kind === "openai-compatible" && !s.baseUrl ? "Needs an address" : "Needs an API key" }
      : s.lastTest
        ? s.lastTest.ok
          ? { tone: "ok", text: `Working${s.lastTest.model ? ` · ${s.lastTest.model}` : ""}` }
          : { tone: "warn", text: "Last test failed" }
        : { tone: "warn", text: "Not tested yet" };
    return {
      id,
      kind,
      label: providerLabel(config, id),
      name: s.name ?? null,
      baseUrl: s.baseUrl,
      defaultBaseUrl: PROVIDERS[kind].defaultBaseUrl,
      effort: s.effort,
      structured: s.structured,
      keyRequired,
      refusalFallback: s.refusalFallback,
      key,
      models: modelsFor(id, s.models),
      modelsFetchedAt: s.modelsFetchedAt,
      lastTest: s.lastTest,
      status,
    };
  });
  return {
    enabled,
    active: config.active,
    tasks: config.tasks,
    providers,
    status: Object.fromEntries(TASK_GROUPS.map((g) => [g.id, aiStatus(g.id, config)])) as AiSettingsView["status"],
    storage: { kind: secretStore.kind, description: secretStore.description },
  };
}

const target = targetSchema.nullable();

export const aiSettingsPatchSchema = z.object({
  active: target.optional(),
  tasks: z.object({ import: target.optional(), daily: target.optional(), weekly: target.optional() }).optional(),
  providers: z
    .record(
      z.string(),
      providerSettingsSchema
        .pick({ name: true, baseUrl: true, effort: true, structured: true, keyRequired: true, refusalFallback: true })
        .partial(),
    )
    .optional(),
});

export function updateAiSettings(raw: unknown) {
  const patch = aiSettingsPatchSchema.parse(raw);
  const config = getAiConfig();
  for (const [id, p] of Object.entries(patch.providers ?? {})) {
    if (!providerIds(config).includes(id) && !config.providers[id]) throw new NotFoundError("Provider");
    const kind = providerKindOf(id);
    if (p.effort && PROVIDERS[kind].effort && !PROVIDERS[kind].effort!.levels.includes(p.effort)) {
      throw new BadRequestError(`${PROVIDERS[kind].label} doesn't have a “${p.effort}” setting.`);
    }
    if (kind === "openai-compatible" && "baseUrl" in p && !p.baseUrl) throw new BadRequestError("A custom endpoint needs an address.");
    config.providers[id] = providerSettingsSchema.parse({ ...providerSettings(config, id), ...p });
  }
  const check = (t: { provider: string; model: string } | null | undefined) => {
    if (t && !providerExists(config, t.provider)) throw new BadRequestError("Set up that provider before choosing one of its models.");
  };
  if (patch.active !== undefined) {
    check(patch.active);
    config.active = patch.active;
  }
  for (const g of ["import", "daily", "weekly"] as const) {
    const t = patch.tasks?.[g];
    if (t !== undefined) {
      check(t);
      config.tasks[g] = t;
    }
  }
  saveAiConfig(config);
}

export const customEndpointSchema = z.object({
  name: z.string().trim().min(1).max(60),
  baseUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Use an http:// or https:// address"),
  keyRequired: z.boolean().default(false),
  structured: z.enum(STRUCTURED_MODES.map((m) => m.id) as [string, ...string[]]).default("auto"),
});

export function addCustomEndpoint(raw: unknown): { id: string } {
  const data = customEndpointSchema.parse(raw);
  const config = getAiConfig();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "endpoint";
  let id = `custom-${slug}`;
  for (let n = 2; config.providers[id]; n++) id = `custom-${slug}-${n}`;
  config.providers[id] = providerSettingsSchema.parse({ ...data, baseUrl: data.baseUrl.replace(/\/+$/, "") });
  saveAiConfig(config);
  return { id };
}

export async function removeCustomEndpoint(id: string) {
  if (!id.startsWith("custom-")) throw new BadRequestError("Built-in providers can't be removed – just remove their key.");
  const config = getAiConfig();
  if (!config.providers[id]) throw new NotFoundError("Provider");
  delete config.providers[id];
  saveAiConfig(removeProviderReferences(config, id));
  await secretStore.remove(id);
}

export const keySchema = z.object({ apiKey: z.string().trim().min(8, "That doesn't look like an API key.").max(400) });

export async function saveProviderKey(id: string, raw: unknown) {
  const config = getAiConfig();
  if (!providerIds(config).includes(id)) throw new NotFoundError("Provider");
  const { apiKey } = keySchema.parse(raw);
  if (/\s/.test(apiKey)) throw new BadRequestError("API keys don't contain spaces – check what was pasted.");
  await setProviderKey(id, apiKey);
}

export async function deleteProviderKey(id: string) {
  const config = getAiConfig();
  if (!providerIds(config).includes(id)) throw new NotFoundError("Provider");
  await setProviderKey(id, null);
}

export function assertProvider(id: string) {
  const config = getAiConfig();
  if (!providerIds(config).includes(id)) throw new NotFoundError("Provider");
  return config;
}
