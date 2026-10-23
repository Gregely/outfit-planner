"use client";

import { useState } from "react";
import { CATALOGUE_CHECKED, PROVIDERS, STRUCTURED_MODES, TASK_GROUPS, type TaskGroup } from "@/lib/ai-providers";
import { api } from "@/lib/client-api";
import { isNativeApp } from "@/lib/platform";
import type { AiSettingsView, ProviderView } from "@/server/services/ai-settings";
import { Badge, Button, Field, Notice, cx } from "./ui";
import { useConfirm, useMutation } from "./feedback-ui";
import { AlertIcon, CheckIcon, PlusIcon, RefreshIcon, SparkIcon, TrashIcon } from "./icons";

type Target = { provider: string; model: string };
type TestResult = { ok: boolean; message: string; steps: { label: string; ok: boolean; detail: string }[]; latencyMs: number | null };

const toneOf = (t: ProviderView["status"]["tone"]) => (t === "ok" ? "moss" : t === "warn" ? "gold" : "neutral");

function defaultModel(p: ProviderView | undefined): string {
  if (!p) return "";
  return PROVIDERS[p.kind].defaultModel ?? p.models[0]?.id ?? "";
}

/** Model chooser: the provider's documented models, the live list from the account, or any ID typed in. */
export function ModelPicker({ provider, value, onChange, id }: { provider: ProviderView | undefined; value: string; onChange: (m: string) => void; id?: string }) {
  const models = provider?.models ?? [];
  const known = models.some((m) => m.id === value);
  const [custom, setCustom] = useState(!known && value !== "");
  if (!provider) return <select id={id} className="input" disabled><option>Choose a provider first</option></select>;
  if (custom || models.length === 0) {
    return (
      <div className="flex gap-2">
        <input
          id={id}
          className="input min-w-0 flex-1 font-mono text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder={provider.kind === "openai-compatible" ? "e.g. llama3.2 – as your server names it" : "Model ID"}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Model ID"
        />
        {models.length ? (
          <Button size="sm" variant="ghost" onClick={() => setCustom(false)}>
            List
          </Button>
        ) : null}
      </div>
    );
  }
  const catalogue = models.filter((m) => m.source === "catalogue");
  const live = models.filter((m) => m.source === "live");
  return (
    <select
      id={id}
      className="input"
      value={value}
      aria-label="Model"
      onChange={(e) => {
        if (e.target.value === "__custom") setCustom(true);
        else onChange(e.target.value);
      }}
    >
      {!known ? <option value={value}>{value || "Choose a model"}</option> : null}
      {catalogue.length ? (
        <optgroup label="Suggested">
          {catalogue.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label ? `${m.label} (${m.id})` : m.id}
            </option>
          ))}
        </optgroup>
      ) : null}
      {live.length ? (
        <optgroup label="Available to your key">
          {live.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id}
            </option>
          ))}
        </optgroup>
      ) : null}
      <option value="__custom">Another model ID…</option>
    </select>
  );
}

function TargetPicker({ providers, value, onSave, allowInherit, busy, label }: { providers: ProviderView[]; value: Target | null; onSave: (t: Target | null) => void; allowInherit?: boolean; busy?: boolean; label: string }) {
  const [provider, setProvider] = useState(value?.provider ?? (allowInherit ? "" : (providers.find((p) => p.status.tone !== "off")?.id ?? providers[0]?.id ?? "")));
  const current = providers.find((p) => p.id === provider);
  const [model, setModel] = useState(value?.model ?? defaultModel(current));
  const dirty = (value?.provider ?? "") !== provider || (value?.model ?? "") !== (provider ? model : "");
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
      <Field label={`${label} · provider`}>
        <select
          className="input"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel(defaultModel(providers.find((p) => p.id === e.target.value)));
          }}
        >
          {allowInherit ? <option value="">Same as the main model</option> : <option value="" disabled>Choose…</option>}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.status.tone === "off" ? ` – ${p.status.text.toLowerCase()}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {provider ? (
        <Field label="Model">
          <ModelPicker key={provider} provider={current} value={model} onChange={setModel} />
        </Field>
      ) : (
        <div />
      )}
      <Button variant={dirty ? "primary" : "secondary"} disabled={!dirty || (Boolean(provider) && !model)} busy={busy} onClick={() => onSave(provider ? { provider, model } : null)}>
        Save
      </Button>
    </div>
  );
}

function StatusLine({ view }: { view: AiSettingsView }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line text-sm">
      {TASK_GROUPS.map((g) => {
        const s = view.status[g.id];
        return (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>{g.label}</span>
            {s.enabled ? (
              <Badge tone="moss">
                <CheckIcon size={12} /> {s.providerLabel} · {s.model}
              </Badge>
            ) : (
              <Badge tone="neutral">Built-in stylist{s.message && s.reason !== "not_configured" ? ` · ${s.message}` : ""}</Badge>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ProviderCard({ p, active, onActivate }: { p: ProviderView; active: boolean; onActivate: (model: string) => void }) {
  const { run, pending } = useMutation();
  const confirm = useConfirm();
  const [key, setKey] = useState("");
  const [testModel, setTestModel] = useState(p.lastTest?.model ?? defaultModel(p));
  const [test, setTest] = useState<TestResult | null>(null);
  const [baseUrl, setBaseUrl] = useState(p.baseUrl ?? "");
  const d = PROVIDERS[p.kind];
  const save = (body: Record<string, unknown>, success = "Saved") => run("save", () => api("/api/ai", { method: "PUT", body: { providers: { [p.id]: body } } }), { success });
  return (
    <details className="card group overflow-hidden" open={active || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 select-none">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{p.label}</span>
          <span className="block truncate text-xs text-muted">{p.kind === "openai-compatible" ? (p.baseUrl ?? "No address yet") : d.structured}</span>
        </span>
        {active ? <Badge tone="accent">Main</Badge> : null}
        <Badge tone={toneOf(p.status.tone)}>{p.status.text}</Badge>
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4">
        {/* key */}
        <Field
          label="API key"
          hint={
            p.key.configured
              ? p.key.source === "environment"
                ? `Read from the server's environment (${d.envVars.join(" or ")}). Saving a key here overrides it.`
                : "Saved. It can't be shown again – paste a new one to replace it."
              : p.keyRequired
                ? d.keyUrl
                  ? <>Create one at <a className="link" href={d.keyUrl} target="_blank" rel="noreferrer">{new URL(d.keyUrl).host}</a>.</>
                  : "This endpoint expects a key."
                : "Optional – local servers usually don't need one."
          }
        >
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              className="input min-w-0 flex-1 font-mono"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={p.key.configured ? "•••••••• saved" : "Paste the key"}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`${p.label} API key`}
            />
            <Button
              variant="primary"
              disabled={key.trim().length < 8}
              busy={pending === "key"}
              onClick={async () => {
                const r = await run("key", () => api(`/api/ai/providers/${p.id}/key`, { method: "PUT", body: { apiKey: key.trim() } }), { success: "Key saved" });
                if (r) setKey("");
              }}
            >
              Save key
            </Button>
            {p.key.source === "stored" ? (
              <Button
                variant="ghost"
                busy={pending === "delkey"}
                onClick={async () => {
                  if (await confirm({ title: `Remove the ${p.label} key?`, body: "Requests to this provider will stop until you add a key again.", confirmLabel: "Remove", danger: true })) {
                    await run("delkey", () => api(`/api/ai/providers/${p.id}/key`, { method: "DELETE" }), { success: "Key removed" });
                  }
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </Field>

        {/* address */}
        {p.kind === "openai-compatible" || p.baseUrl ? (
          <Field label="API address" hint={p.kind === "openai-compatible" ? "The OpenAI-compatible base URL, usually ending in /v1." : `Leave empty for the default (${p.defaultBaseUrl}).`}>
            <div className="flex gap-2">
              <input className="input min-w-0 flex-1 font-mono text-sm" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={p.defaultBaseUrl ?? "http://192.168.1.20:11434/v1"} inputMode="url" autoCapitalize="none" spellCheck={false} />
              <Button disabled={baseUrl === (p.baseUrl ?? "")} busy={pending === "save"} onClick={() => save({ baseUrl: baseUrl.trim() || null })}>
                Save
              </Button>
            </div>
            {/^http:\/\//i.test(baseUrl) && !/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(baseUrl) ? (
              <p className="mt-1 text-xs text-danger">This address isn&apos;t encrypted (http://) and isn&apos;t on your local network – your key and wardrobe would travel in plain text.</p>
            ) : null}
          </Field>
        ) : null}

        {/* generation settings */}
        <div className="grid gap-3 sm:grid-cols-2">
          {d.effort ? (
            <Field label={d.effort.label} hint={d.effort.note}>
              <select className="input" value={p.effort ?? ""} onChange={(e) => save({ effort: e.target.value || null }, "Updated")}>
                <option value="">Model default</option>
                {d.effort.levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {p.kind === "openai-compatible" ? (
            <Field label="How to ask for JSON" hint={STRUCTURED_MODES.find((m) => m.id === p.structured)?.hint}>
              <select className="input" value={p.structured} onChange={(e) => save({ structured: e.target.value }, "Updated")}>
                {STRUCTURED_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        {p.kind === "openai-compatible" ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-accent" checked={p.keyRequired} onChange={(e) => save({ keyRequired: e.target.checked }, "Updated")} />
            This endpoint needs an API key
          </label>
        ) : null}
        {p.kind === "anthropic" ? (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-accent" checked={p.refusalFallback} onChange={(e) => save({ refusalFallback: e.target.checked }, "Updated")} />
            <span>
              Server-side refusal fallback
              <span className="block text-xs text-muted">On models that support it, a request the model declines is retried by another Claude model inside the same call.</span>
            </span>
          </label>
        ) : null}

        {/* models + test */}
        <div className="space-y-2 rounded-xl bg-paper-deep/60 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Model" className="min-w-0 flex-1">
              <ModelPicker provider={p} value={testModel} onChange={setTestModel} />
            </Field>
            <Button
              busy={pending === "models"}
              title="Fetch the current model list from the provider"
              onClick={() =>
                run("models", () => api<{ ok: boolean; message: string }>(`/api/ai/providers/${p.id}/models`, { method: "POST" }), {
                  success: (r) => (r.ok ? r.message : null),
                }).then((r) => r && !r.ok && setTest({ ok: false, message: r.message, steps: [], latencyMs: null }))
              }
            >
              <RefreshIcon size={15} /> Models
            </Button>
          </div>
          <p className="text-xs text-muted">
            {p.modelsFetchedAt ? `Live list fetched ${new Date(p.modelsFetchedAt).toLocaleString()}.` : d.catalogue.length ? `Suggestions from ${d.label}'s documentation (checked ${CATALOGUE_CHECKED}); refresh to see what your key can use.` : "Refresh to load the models this server offers, or type an ID."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!testModel}
              busy={pending === "test"}
              onClick={async () => {
                setTest(null);
                const r = await run("test", () => api<TestResult>(`/api/ai/providers/${p.id}/test`, { body: { model: testModel } }));
                if (r) setTest(r);
              }}
            >
              Test connection
            </Button>
            <Button variant={active ? "secondary" : "primary"} disabled={!testModel || p.status.tone === "off"} onClick={() => onActivate(testModel)}>
              <SparkIcon size={15} /> Use {testModel || "this model"}
            </Button>
          </div>
          {test ? (
            <div role="status" className={cx("rounded-lg border px-3 py-2 text-sm", test.ok ? "border-moss/40 bg-moss-soft" : "border-danger/30 bg-accent-soft")}>
              <p className="flex items-start gap-1.5 font-medium">
                {test.ok ? <CheckIcon size={15} /> : <AlertIcon size={15} />} {test.message}
              </p>
              {test.steps.length ? (
                <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                  {test.steps.map((s, i) => (
                    <li key={i}>
                      {s.ok ? "✓" : "✗"} {s.label}: {s.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : p.lastTest ? (
            <p className="text-xs text-muted">
              Last test {new Date(p.lastTest.at).toLocaleString()}: {p.lastTest.ok ? "passed" : "failed"}
              {p.lastTest.model ? ` (${p.lastTest.model})` : ""}. {p.lastTest.ok ? "" : p.lastTest.message}
            </p>
          ) : null}
        </div>

        {p.kind === "openai-compatible" ? (
          <Button
            variant="ghost"
            onClick={async () => {
              if (await confirm({ title: `Remove ${p.label}?`, body: "Its address, settings and key are deleted. Tasks using it go back to the main model.", confirmLabel: "Remove", danger: true })) {
                await run("remove", () => api(`/api/ai/providers/${p.id}`, { method: "DELETE" }), { success: "Endpoint removed" });
              }
            }}
          >
            <TrashIcon size={15} /> Remove endpoint
          </Button>
        ) : null}
      </div>
    </details>
  );
}

function AddEndpoint() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [keyRequired, setKeyRequired] = useState(false);
  const { run, pending } = useMutation();
  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <PlusIcon size={15} /> Add an OpenAI-compatible endpoint
      </Button>
    );
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("add", () => api("/api/ai/custom", { body: { name, baseUrl: baseUrl.trim(), keyRequired } }), { success: `${name} added – test it below` });
        if (r) {
          setOpen(false);
          setName("");
          setBaseUrl("");
        }
      }}
    >
      <p className="text-sm text-muted">Any server that speaks the OpenAI Chat Completions API: Ollama, LM Studio, vLLM, llama.cpp, OpenRouter and similar.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Ollama" maxLength={60} />
        </Field>
        <Field label="Base URL">
          <input className="input font-mono text-sm" required value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://192.168.1.20:11434/v1" inputMode="url" autoCapitalize="none" spellCheck={false} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-accent" checked={keyRequired} onChange={(e) => setKeyRequired(e.target.checked)} />
        Needs an API key
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" busy={pending === "add"}>
          Add endpoint
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AiProvidersSettings({ view }: { view: AiSettingsView }) {
  const { run, pending } = useMutation();
  const native = isNativeApp();
  const setTarget = (body: Record<string, unknown>, success: string) => run("target", () => api("/api/ai", { method: "PUT", body }), { success });
  const usable = view.providers.filter((p) => p.status.tone !== "off");
  return (
    <div className="space-y-5">
      <div className="card space-y-4 p-4 sm:p-5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={view.enabled}
            onChange={(e) => run("toggle", () => api("/api/settings", { method: "PUT", body: { aiEnabled: e.target.checked } }), { success: e.target.checked ? "AI switched on" : "AI switched off – using the built-in stylist" })}
          />
          Use AI for suggestions, imports and planning
        </label>
        <StatusLine view={view} />
        <TargetPicker
          key={`${view.active?.provider}:${view.active?.model}`}
          providers={view.providers}
          value={view.active}
          busy={pending === "target"}
          label="Main model"
          onSave={(t) => setTarget({ active: t }, "Main model saved")}
        />
        <details className="group">
          <summary className="cursor-pointer text-sm text-ink-soft">Use different models for specific tasks</summary>
          <div className="mt-3 space-y-4">
            {TASK_GROUPS.map((g) => (
              <div key={g.id}>
                <p className="mb-1 text-xs text-muted">{g.hint}</p>
                <TargetPicker
                  key={`${g.id}:${view.tasks[g.id]?.provider}:${view.tasks[g.id]?.model}`}
                  providers={view.providers}
                  value={view.tasks[g.id]}
                  allowInherit
                  label={g.label}
                  onSave={(t) => setTarget({ tasks: { [g.id as TaskGroup]: t } }, `${g.label} model saved`)}
                />
              </div>
            ))}
          </div>
        </details>
        {!usable.length ? (
          <Notice tone="info">
            No AI provider is set up yet, so the built-in rule-based stylist does everything – wardrobe, illustrations, laundry, planning and backups all work without one. Add a key below to get AI suggestions.
          </Notice>
        ) : null}
      </div>

      <div className="space-y-3">
        {view.providers.map((p) => (
          <ProviderCard key={p.id} p={p} active={view.active?.provider === p.id} onActivate={(model) => setTarget({ active: { provider: p.id, model } }, `Now using ${p.label} · ${model}`)} />
        ))}
        <AddEndpoint />
      </div>

      <div className="space-y-1.5 text-xs leading-relaxed text-muted">
        <p>
          <strong className="font-medium text-ink-soft">Keys:</strong> {view.storage.description}. They are never included in backups, exports or logs, and never shown again after saving.
        </p>
        <p>
          <strong className="font-medium text-ink-soft">What&apos;s sent:</strong> when AI is used, the chosen provider receives your available garments (names, types, colours, materials), your style profile and rules, the day&apos;s weather and plans, and your request – nothing else.
          {native ? " Requests go straight from this phone to the provider." : " Requests go from this computer's server straight to the provider."}
        </p>
        <p>
          <strong className="font-medium text-ink-soft">Safety net:</strong> whichever model you pick, every suggestion is checked by the app – garments must exist and be available, outfits must be complete, and your rules always hold. Anything that fails is replaced by the built-in stylist, and outfits show which model made them.
        </p>
      </div>
    </div>
  );
}
