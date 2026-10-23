import "server-only";
import { z } from "zod";
import { CATEGORIES } from "@/lib/domain";
import { PROVIDERS, providerKindOf, type AiUi, type TaskGroup } from "@/lib/ai-providers";
import { getSettings } from "@/server/services/settings";
import { secretStore } from "@/server/platform/secrets";
import { isOnline, providerFetch } from "@/server/platform/http";
import { describeSchemaLimits, normaliseToSchema, toWireSchema, type WireSchema } from "./wire-schema";
import { AiUnavailableError, describeAiError, reasonText, type AiFailureReason } from "./errors";
import { getAiConfig, modelIdSchema, providerLabel, providerSettings, saveAiConfig, targetFor, updateProvider, type AiConfig } from "./config";
import { ADAPTERS, type ModelInfo, type ProviderContext } from "./providers";

export { AiUnavailableError, REASON_TEXT, describeAiError, reasonText, type AiFailureReason } from "./errors";

/**
 * Provider-independent structured calls. Whichever provider and model a task is configured to
 * use, the request carries the same JSON schema and the answer goes through the same parsing
 * and Zod validation here – and then through the same garment-ID, availability and rule checks
 * in the stylist – so switching models can never bypass a hard constraint.
 */

export type GenerationMeta = { provider: string; providerLabel: string; model: string };

export type AiStatus = {
  enabled: boolean;
  reason: AiFailureReason | null;
  /** user-facing explanation when disabled */
  message: string | null;
  provider: string | null;
  providerLabel: string | null;
  model: string | null;
};

const TIMEOUT_MS = 10 * 60_000;

let fetchOverride: { fetch: typeof fetch; retries: number } | null = null;

/** Test hook: route every provider request through this fetch (pass null to restore). */
export function __setAiFetch(f: typeof fetch | null, opts: { retries?: number } = {}) {
  fetchOverride = f ? { fetch: f, retries: opts.retries ?? 0 } : null;
}

/** Can AI be used for this kind of task right now? Cheap and synchronous – safe to call while rendering. */
export function aiStatus(group: TaskGroup | null = null, config: AiConfig = getAiConfig()): AiStatus {
  const off = (reason: AiFailureReason, provider: string | null = null, model: string | null = null): AiStatus => {
    const label = provider ? providerLabel(config, provider) : null;
    return { enabled: false, reason, message: reasonText(reason, label ?? undefined), provider, providerLabel: label, model };
  };
  if (typeof process !== "undefined" && process.env?.AI_DISABLED === "1") return off("disabled");
  if (!getSettings().aiEnabled) return off("disabled");
  const target = targetFor(config, group);
  if (!target) return off("not_configured");
  const kind = providerKindOf(target.provider);
  const needsKey = kind === "openai-compatible" ? providerSettings(config, target.provider).keyRequired : PROVIDERS[kind].keyRequired;
  if (needsKey && !secretStore.has(target.provider)) return off("no_key", target.provider, target.model);
  if (!isOnline()) return off("offline", target.provider, target.model);
  return { enabled: true, reason: null, message: null, provider: target.provider, providerLabel: providerLabel(config, target.provider), model: target.model };
}

async function contextFor(config: AiConfig, id: string): Promise<ProviderContext> {
  const kind = providerKindOf(id);
  const settings = providerSettings(config, id);
  return {
    id,
    kind,
    label: providerLabel(config, id),
    settings,
    apiKey: await secretStore.get(id),
    bearer: "isBearerToken" in secretStore ? (secretStore as { isBearerToken(id: string): boolean }).isBearerToken(id) : false,
    baseUrl: settings.baseUrl,
    fetch: fetchOverride?.fetch ?? providerFetch(),
    timeoutMs: TIMEOUT_MS,
    retries: fetchOverride?.retries ?? 2,
  };
}

const wireCache = new WeakMap<z.ZodType, WireSchema>();

function wireFor(schema: z.ZodType): WireSchema {
  let wire = wireCache.get(schema);
  if (!wire) {
    wire = toWireSchema(schema);
    const limits = describeSchemaLimits(wire);
    if (limits.problems.length) {
      // A programming error, caught by tests – never send a schema an API will refuse to compile.
      throw new AiUnavailableError("bad_request", "Internal error: the structured-output schema exceeds documented limits", { message: limits.problems.join("; ") });
    }
    wireCache.set(schema, wire);
  }
  return wire;
}

/** Parse and validate an answer exactly the same way for every provider. */
export function parseAnswer<T>(text: string, schema: z.ZodType<T>, wire: WireSchema, label: string, requestId: string | null = null): T {
  const fail = (why: string) => new AiUnavailableError("malformed", reasonText("malformed", label), { message: why, requestId });
  const trimmed = text.trim();
  if (!trimmed) throw fail("the answer was empty");
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw fail(`not valid JSON: ${trimmed.slice(0, 120)}`);
  }
  // Enum values may differ only in letter case or separators; map them to the canonical value.
  const checked = schema.safeParse(normaliseToSchema(json, wire));
  if (!checked.success) throw fail(checked.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "));
  return checked.data;
}

type StructuredOptions<T> = {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** which configured model to use */
  group: TaskGroup;
  /** label for logs */
  task: string;
  maxTokens?: number;
  /** override the configured target (connection tests) */
  target?: { provider: string; model: string };
};

export async function callStructured<T>(opts: StructuredOptions<T>): Promise<{ data: T; meta: GenerationMeta }> {
  const config = getAiConfig();
  let target = opts.target ?? null;
  if (!target) {
    const status = aiStatus(opts.group, config);
    if (!status.enabled) throw new AiUnavailableError(status.reason!, status.message!);
    target = { provider: status.provider!, model: status.model! };
  }
  const ctx = await contextFor(config, target.provider);
  const wire = wireFor(opts.schema);
  const builtIn = ctx.kind !== "openai-compatible";
  try {
    const out = await ADAPTERS[ctx.kind].generate(ctx, target.model, {
      system: opts.system,
      prompt: opts.prompt,
      wire,
      schemaName: opts.task.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 60) || "answer",
      // Custom servers often run small local models; let them use their own limit.
      maxTokens: builtIn ? (opts.maxTokens ?? 32000) : null,
      effort: ctx.settings.effort,
      task: opts.task,
    });
    const data = parseAnswer(out.text, opts.schema, wire, ctx.label, out.requestId);
    return { data, meta: { provider: ctx.id, providerLabel: ctx.label, model: out.model || target.model } };
  } catch (err) {
    const mapped =
      err instanceof AiUnavailableError ? err : new AiUnavailableError("error", reasonText("error", ctx.label), { message: err instanceof Error ? err.message : String(err) });
    console.error(`[ai] ${opts.task} via ${ctx.label} (${target.model}) failed: ${describeAiError(mapped)}`);
    throw mapped;
  }
}

/* ------------------------------------------------------------------ */
/* Settings: model lists and connection tests                          */
/* ------------------------------------------------------------------ */

export async function listProviderModels(id: string): Promise<ModelInfo[]> {
  const config = getAiConfig();
  const ctx = await contextFor(config, id);
  const kind = providerKindOf(id);
  if (kind === "openai-compatible" && !ctx.settings.baseUrl) throw new AiUnavailableError("not_configured", "Add the endpoint's address first.");
  if ((kind === "openai-compatible" ? ctx.settings.keyRequired : PROVIDERS[kind].keyRequired) && !ctx.apiKey) {
    throw new AiUnavailableError("no_key", reasonText("no_key", ctx.label));
  }
  const models = (await ADAPTERS[kind].listModels(ctx)).filter((m) => modelIdSchema.safeParse(m.id).success);
  updateProvider(id, { models: models.slice(0, 500), modelsFetchedAt: new Date().toISOString() });
  return models;
}

const probeSchema = z.object({
  status: z.enum(["ok"]).describe('Always "ok"'),
  garment: z.string().describe("The garment named in the text, in a few words"),
  category: z.enum(CATEGORIES).describe("Its category"),
});

export type ConnectionTest = { ok: boolean; message: string; steps: { label: string; ok: boolean; detail: string }[]; latencyMs: number | null };

/**
 * A real check, never a guess: lists models where the provider supports it, then asks the
 * chosen model for a small structured answer and validates it like any other.
 */
export async function testProvider(id: string, model: string): Promise<ConnectionTest> {
  const kind = providerKindOf(id);
  const steps: ConnectionTest["steps"] = [];
  const record = (result: ConnectionTest) => {
    updateProvider(id, { lastTest: { ok: result.ok, at: new Date().toISOString(), message: result.message.slice(0, 600), model } });
    return result;
  };
  if (!isOnline()) return record({ ok: false, message: reasonText("offline"), steps, latencyMs: null });

  if (PROVIDERS[kind].canListModels) {
    try {
      const models = await listProviderModels(id);
      const listed = models.some((m) => m.id === model);
      steps.push({ label: "List models", ok: true, detail: `${models.length} model${models.length === 1 ? "" : "s"} available${listed || !models.length ? "" : ` – “${model}” isn't among them`}` });
    } catch (err) {
      const reason = err instanceof AiUnavailableError ? err.reason : "error";
      steps.push({ label: "List models", ok: false, detail: describeAiError(err) });
      // A wrong key, missing address or dead network fails everything; stop here. Some
      // compatible servers simply don't implement /models, so carry on for those.
      if (reason === "auth" || reason === "no_key" || reason === "not_configured" || reason === "network" || reason === "timeout") {
        return record({ ok: false, message: describeAiError(err), steps, latencyMs: null });
      }
    }
  }

  const started = Date.now();
  try {
    const { meta } = await callStructured({
      system: "You are a connection test for a wardrobe app. Answer in the requested JSON format.",
      prompt: 'Connection test. Fill in the fields for this description: "black polyester running shorts".',
      schema: probeSchema,
      group: "daily",
      task: "connection test",
      maxTokens: 8000,
      target: { provider: id, model },
    });
    const latencyMs = Date.now() - started;
    steps.push({ label: "Structured answer", ok: true, detail: `${meta.model} returned a valid answer in ${(latencyMs / 1000).toFixed(1)} s` });
    return record({ ok: true, message: `Connected – ${meta.model} returned a valid structured answer.`, steps, latencyMs });
  } catch (err) {
    steps.push({ label: "Structured answer", ok: false, detail: describeAiError(err) });
    return record({ ok: false, message: describeAiError(err), steps, latencyMs: null });
  }
}

/** Keys: write-only from the UI's point of view. */
export async function setProviderKey(id: string, key: string | null) {
  if (key) await secretStore.set(id, key);
  else await secretStore.remove(id);
  // a new key invalidates the previous test result
  const config = getAiConfig();
  const s = providerSettings(config, id);
  if (s.lastTest) {
    config.providers[id] = { ...s, lastTest: null };
    saveAiConfig(config);
  }
}

/** AI status in the shape the UI components take. */
export function aiUi(group: TaskGroup | null = null): AiUi {
  const s = aiStatus(group);
  return { enabled: s.enabled, reason: s.enabled ? null : s.message, label: s.providerLabel, model: s.model };
}
