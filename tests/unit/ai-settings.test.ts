import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GET as getAi, PUT as putAi } from "@/app/api/ai/route";
import { PUT as putKey, DELETE as deleteKey } from "@/app/api/ai/providers/[id]/key/route";
import { POST as testRoute } from "@/app/api/ai/providers/[id]/test/route";
import { POST as modelsRoute } from "@/app/api/ai/providers/[id]/models/route";
import { getAiConfig } from "@/server/ai/config";
import { aiStatus } from "@/server/ai/client";
import { secretStore } from "@/server/platform/secrets";
import { addCustomEndpoint, removeCustomEndpoint, updateAiSettings } from "@/server/services/ai-settings";
import { exportBackup, restoreBackup } from "@/server/services/backup";
import { fakeProviders, HttpReply, seedSample } from "../helpers";

const KEY = "sk-proj-SUPERSECRETKEYVALUE123";
const jsonReq = (method: string, body?: unknown) =>
  new Request("http://127.0.0.1/api/ai", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("API keys", () => {
  it("are write-only: saved through the API, reported as configured, never returned", async () => {
    const saved = await putKey(jsonReq("PUT", { apiKey: KEY }), ctx("openai"));
    expect(saved.status).toBe(200);
    expect(secretStore.has("openai")).toBe(true);
    const view = await (await getAi(jsonReq("GET"), { params: Promise.resolve({}) })).text();
    expect(view).not.toContain(KEY);
    expect(view).not.toContain("SUPERSECRET");
    const openai = JSON.parse(view).providers.find((p: { id: string }) => p.id === "openai");
    expect(openai.key).toEqual({ configured: true, source: "stored" });
    await deleteKey(jsonReq("DELETE"), ctx("openai"));
    expect(secretStore.has("openai")).toBe(false);
  });

  it("rejects obviously wrong keys and unknown providers", async () => {
    expect((await putKey(jsonReq("PUT", { apiKey: "short" }), ctx("openai"))).status).toBe(400);
    expect((await putKey(jsonReq("PUT", { apiKey: "has spaces in the middle" }), ctx("openai"))).status).toBe(400);
    expect((await putKey(jsonReq("PUT", { apiKey: KEY }), ctx("custom-nope"))).status).toBe(404);
  });

  it("are stored outside the database in a file only the owner can read", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ws-secrets-")), "secrets.json");
    process.env.SECRETS_PATH = file;
    await secretStore.set("gemini", "AIzaFILETEST1234567890");
    expect((fs.statSync(file).mode & 0o777).toString(8)).toBe("600");
    expect(JSON.parse(fs.readFileSync(file, "utf8")).keys.gemini).toBe("AIzaFILETEST1234567890");
    expect(JSON.stringify(getAiConfig())).not.toContain("AIzaFILETEST");
  });

  it("never end up in backups, and a restore keeps this device's AI setup", async () => {
    seedSample();
    await secretStore.set("openai", KEY);
    updateAiSettings({ active: { provider: "openai", model: "gpt-6-luna" } });
    const backup = await exportBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain(KEY);
    expect(backup.data.settings?.ai).toBeUndefined();
    updateAiSettings({ active: { provider: "openai", model: "gpt-6.1-sol" } });
    await restoreBackup(JSON.parse(text));
    expect(getAiConfig().active).toEqual({ provider: "openai", model: "gpt-6.1-sol" });
    expect(secretStore.has("openai")).toBe(true);
  });
});

describe("configuration", () => {
  it("migrates the old environment configuration without any setup", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-env";
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    process.env.ANTHROPIC_EFFORT = "low";
    process.env.ANTHROPIC_REFUSAL_FALLBACK = "off";
    const config = getAiConfig();
    expect(config.active).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" });
    expect(config.providers.anthropic).toMatchObject({ effort: "low", refusalFallback: false });
    expect(secretStore.source("anthropic")).toBe("environment");
  });

  it("picks up other providers' environment keys with their documented default model", () => {
    process.env.OPENAI_API_KEY = "sk-openai-env";
    expect(getAiConfig().active).toEqual({ provider: "openai", model: "gpt-6.1-sol" });
  });

  it("validates choices: known providers, valid effort levels, a model ID that looks like one", async () => {
    const bad = async (body: unknown) => (await putAi(jsonReq("PUT", body), { params: Promise.resolve({}) })).status;
    expect(await bad({ active: { provider: "custom-ghost", model: "x" } })).toBe(400);
    expect(await bad({ active: { provider: "openai", model: "gpt 6; drop table" } })).toBe(400);
    expect(await bad({ providers: { gemini: { effort: "xhigh" } } })).toBe(400);
    expect(await bad({ providers: { anthropic: { effort: "max" } } })).toBe(200);
  });

  it("removing a custom endpoint clears its key and any task that used it", async () => {
    const { id } = addCustomEndpoint({ name: "LM Studio", baseUrl: "http://localhost:1234/v1", keyRequired: true });
    await secretStore.set(id, "lm-studio-key");
    updateAiSettings({ active: { provider: id, model: "qwen" }, tasks: { import: { provider: id, model: "qwen" } } });
    await removeCustomEndpoint(id);
    expect(getAiConfig().active).toBeNull();
    expect(getAiConfig().tasks.import).toBeNull();
    expect(secretStore.has(id)).toBe(false);
    expect(aiStatus("import").reason).toBe("not_configured");
  });
});

describe("connection tests are real", () => {
  it("passes only when the model returns a valid structured answer", async () => {
    await secretStore.set("openai", KEY);
    fakeProviders({
      models: { openai: ["gpt-6-luna", "gpt-6.1-sol", "text-embedding-4"] },
      openai: () => ({ status: "ok", garment: "black running shorts", category: "shorts" }),
    });
    const res = await (await testRoute(jsonReq("POST", { model: "gpt-6-luna" }), ctx("openai"))).json();
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/gpt-6-luna returned a valid structured answer/);
    expect(res.steps[0].detail).toMatch(/2 models available/); // embeddings filtered out
    expect(getAiConfig().providers.openai.lastTest).toMatchObject({ ok: true, model: "gpt-6-luna" });
  });

  it("fails clearly on a bad key and stops before generating", async () => {
    await secretStore.set("anthropic", "sk-ant-wrong-key");
    let generated = false;
    fakeProviders({
      anthropic: () => {
        generated = true;
        return {};
      },
    });
    // the model list request is answered with 401
    fakeProviders({ anthropic: () => new HttpReply(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }) });
    const res = await (await testRoute(jsonReq("POST", { model: "claude-opus-5-5" }), ctx("anthropic"))).json();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Claude rejected the API key/);
    expect(generated).toBe(false);
  });

  it("reports an unavailable model and a malformed answer as failures, not successes", async () => {
    await secretStore.set("gemini", "AIzaKEY-123456789012");
    fakeProviders({ models: { gemini: ["gemini-3.8-flash"] }, gemini: () => ({ status: "fine?" }) });
    const res = await (await testRoute(jsonReq("POST", { model: "gemini-9-imaginary" }), ctx("gemini"))).json();
    expect(res.ok).toBe(false);
    expect(res.steps[0].detail).toMatch(/isn't among them/);
    expect(res.message).toMatch(/didn't match the expected format/);
  });

  it("refreshes the model list from the provider", async () => {
    const { id } = addCustomEndpoint({ name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" });
    fakeProviders({ models: { compatible: ["llama3.2:latest", "qwen3:8b"] } });
    const res = await (await modelsRoute(jsonReq("POST"), ctx(id))).json();
    expect(res.models.map((m: { id: string }) => m.id)).toEqual(["llama3.2:latest", "qwen3:8b"]);
    expect(getAiConfig().providers[id].models).toHaveLength(2);
  });
});
