import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiUnavailableError, callStructured, describeAiError } from "@/server/ai/client";
import { secretStore } from "@/server/platform/secrets";
import { addCustomEndpoint, updateAiSettings } from "@/server/services/ai-settings";
import { suggestOutfits, planWeek } from "@/server/stylist";
import { listGarments } from "@/server/services/garments";
import { getOutfit, listOutfits } from "@/server/services/outfits";
import { getDb } from "@/server/db";
import { outfits as outfitsTable } from "@/server/db/schema";
import { getProfile, saveProfile } from "@/server/services/preferences";
import { today } from "@/server/services/settings";
import { fakeProviders, HttpReply, seedSample } from "../helpers";

const tiny = z.object({ colour: z.enum(["red", "navy blue"]), n: z.number().int() });
const call = (group: "import" | "daily" | "weekly" = "daily") => callStructured({ system: "SYS", prompt: "PROMPT", schema: tiny, task: "test task", group });

async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AiUnavailableError);
    return err as AiUnavailableError;
  }
  throw new Error("expected failure");
}

async function configureProvider(provider: string, model: string, key: string | null = "test-key") {
  if (key) await secretStore.set(provider, key);
  updateAiSettings({ active: { provider, model } });
}

describe("OpenAI (Responses API)", () => {
  it("sends a strict JSON schema, the instructions, effort and store: false", async () => {
    const calls = fakeProviders({ openai: () => ({ colour: "red", n: 4 }) });
    await configureProvider("openai", "gpt-6.1-sol", "sk-proj-abcdefgh");
    updateAiSettings({ providers: { openai: { effort: "low" } } });
    const { data, meta } = await call();
    expect(data).toEqual({ colour: "red", n: 4 });
    expect(meta).toEqual({ provider: "openai", providerLabel: "OpenAI", model: "gpt-6.1-sol" });
    const req = calls[0];
    expect(req.url).toBe("https://api.openai.com/v1/responses");
    expect(req.headers.authorization).toBe("Bearer sk-proj-abcdefgh");
    expect(req.body).toMatchObject({ model: "gpt-6.1-sol", instructions: "SYS", input: "PROMPT", store: false, reasoning: { effort: "low" }, max_output_tokens: 32000 });
    const format = (req.body.text as { format: { type: string; strict: boolean; name: string; schema: { additionalProperties: boolean } } }).format;
    expect(format).toMatchObject({ type: "json_schema", strict: true, name: "test_task" });
    expect(format.schema.additionalProperties).toBe(false);
  });

  it("reports refusals, truncation and model or setting problems distinctly", async () => {
    await configureProvider("openai", "gpt-6-luna");
    fakeProviders({
      openai: () => ({ id: "r", object: "response", status: "completed", model: "gpt-6-luna", output: [{ type: "message", id: "m", status: "completed", role: "assistant", content: [{ type: "refusal", refusal: "I can't help with that." }] }] }),
    });
    expect(describeAiError(await failure(call()))).toMatch(/OpenAI declined this request – I can't help with that\./);
    fakeProviders({ openai: () => ({ id: "r", object: "response", status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, model: "gpt-6-luna", output: [] }) });
    expect((await failure(call())).reason).toBe("truncated");
    fakeProviders({ openai: () => new HttpReply(404, { error: { message: "The model `gpt-9` does not exist or you do not have access to it.", type: "invalid_request_error", code: "model_not_found" } }) });
    const missing = await failure(call());
    expect(missing.reason).toBe("model_unavailable");
    expect(describeAiError(missing)).toMatch(/that model isn't available from OpenAI.*refresh the model list/);
    fakeProviders({ openai: () => new HttpReply(400, { error: { message: "Unsupported value: 'reasoning.effort' does not support 'none' with this model.", type: "invalid_request_error", param: "reasoning.effort", code: "unsupported_value" } }) });
    const unsupported = await failure(call());
    expect(unsupported.reason).toBe("unsupported");
    expect(describeAiError(unsupported)).toMatch(/Model default/);
    fakeProviders({ openai: () => new HttpReply(401, { error: { message: "Incorrect API key provided: sk-proj-****abcd.", type: "invalid_request_error", code: "invalid_api_key" } }) });
    expect((await failure(call())).reason).toBe("auth");
  });
});

describe("Gemini (generateContent)", () => {
  it("asks for JSON with a response schema and thinking level, key in a header", async () => {
    const calls = fakeProviders({ gemini: () => ({ colour: "navy blue", n: 2 }) });
    await configureProvider("gemini", "gemini-3.8-flash", "AIzaTESTKEY1234567890");
    updateAiSettings({ providers: { gemini: { effort: "high" } } });
    const { data, meta } = await call();
    expect(data).toEqual({ colour: "navy blue", n: 2 });
    expect(meta.providerLabel).toBe("Gemini");
    const req = calls[0];
    expect(req.url).toMatch(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
    expect(req.url).not.toContain("AIza");
    expect(req.headers["x-goog-api-key"]).toBe("AIzaTESTKEY1234567890");
    const config = req.body.generationConfig as Record<string, unknown>;
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseJsonSchema).toMatchObject({ type: "object", required: ["colour", "n"] });
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "HIGH" });
    expect(JSON.stringify(req.body.systemInstruction)).toContain("SYS");
  });

  it("treats safety blocks as refusals and MAX_TOKENS as truncation", async () => {
    await configureProvider("gemini", "gemini-3.8-flash");
    fakeProviders({ gemini: () => ({ candidates: [{ content: { role: "model", parts: [] }, finishReason: "SAFETY" }] }) });
    expect((await failure(call())).reason).toBe("refused");
    fakeProviders({ gemini: () => ({ candidates: [{ content: { role: "model", parts: [{ text: '{"colour":' }] }, finishReason: "MAX_TOKENS" }] }) });
    expect((await failure(call())).reason).toBe("truncated");
    fakeProviders({ gemini: () => new HttpReply(400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }) });
    expect((await failure(call())).reason).toBe("auth");
  });
});

describe("OpenAI-compatible endpoints", () => {
  it("works without a key and falls back from json_schema to JSON mode when the server rejects it", async () => {
    const { id } = addCustomEndpoint({ name: "Home Ollama", baseUrl: "http://192.168.1.20:11434/v1/" });
    expect(id).toBe("custom-home-ollama");
    await configureProvider(id, "llama3.2", null);
    const calls = fakeProviders({
      compatible: (req) =>
        (req.body.response_format as { type: string }).type === "json_schema"
          ? new HttpReply(400, { error: { message: "response_format type json_schema is not supported" } })
          : { choices: [{ index: 0, message: { role: "assistant", content: '```json\n{"colour":"red","n":1}\n```' }, finish_reason: "stop" }], model: "llama3.2" },
    });
    const { data, meta } = await call();
    expect(data).toEqual({ colour: "red", n: 1 });
    expect(meta).toMatchObject({ provider: id, providerLabel: "Home Ollama" });
    expect(calls.map((c) => (c.body.response_format as { type: string }).type)).toEqual(["json_schema", "json_object"]);
    expect(calls[0].url).toBe("http://192.168.1.20:11434/v1/chat/completions");
    expect(calls[0].body.max_tokens).toBeUndefined(); // local models keep their own limit
    expect(String((calls[1].body.messages as { content: string }[])[0].content)).toContain('"required":["colour","n"]');
  });

  it("uses only the configured mode when one is chosen, and sends a key if given", async () => {
    const { id } = addCustomEndpoint({ name: "Router", baseUrl: "https://router.example/api/v1", keyRequired: true, structured: "prompt" });
    await configureProvider(id, "some/model:free", "sk-router-123456");
    const calls = fakeProviders({ compatible: () => ({ colour: "red", n: 9 }) });
    await call();
    expect(calls[0].body.response_format).toBeUndefined();
    expect(calls[0].headers.authorization).toBe("Bearer sk-router-123456");
  });
});

describe("switching providers and models", () => {
  it("routes each task to its own model and records who made each outfit", async () => {
    seedSample();
    await secretStore.set("openai", "sk-openai-test");
    await secretStore.set("anthropic", "sk-ant-test");
    updateAiSettings({ active: { provider: "openai", model: "gpt-6-luna" }, tasks: { weekly: { provider: "anthropic", model: "claude-sonnet-5-5" } } });
    const garments = listGarments();
    const pick = (re: RegExp) => garments.find((g) => re.test(g.name))!.id;
    const outfit = [pick(/^White t-shirt/), pick(/^Raw denim jeans/), pick(/^Black combat boots/)];
    const hits: string[] = [];
    fakeProviders({
      openai: () => {
        hits.push("openai");
        return { outfits: [{ name: "Easy denim", garment_ids: outfit, explanation: "Simple and easy." }] };
      },
      anthropic: (req) => {
        hits.push(`anthropic:${req.body.model}`);
        const prompt = (req.body.messages as { content: string }[])[0].content;
        const dates = [...prompt.matchAll(/^DATE: (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]);
        return { days: dates.slice(0, 1).map((date) => ({ date, name: "Week look", garment_ids: outfit, explanation: "Planned." })) };
      },
    });
    const daily = await suggestOutfits({ count: 1 });
    expect(daily.source).toBe("ai");
    expect(daily.generatedBy).toEqual({ provider: "openai", providerLabel: "OpenAI", model: "gpt-6-luna" });
    expect(getOutfit(daily.outfits[0].id).generatedBy).toEqual({ provider: "openai", providerLabel: "OpenAI", model: "gpt-6-luna" });
    const week = await planWeek(today());
    expect(hits).toEqual(["openai", "anthropic:claude-sonnet-5-5"]);
    expect(week.generatedBy?.model).toBe("claude-sonnet-5-5");
  });

  it("keeps wardrobe, preferences and history when the model changes", async () => {
    seedSample();
    saveProfile({ styleDescription: "Sporty and practical", favouriteColours: ["green"] });
    await secretStore.set("openai", "k-openai-123");
    await secretStore.set("gemini", "AIzaKEY-123456789012");
    updateAiSettings({ active: { provider: "openai", model: "gpt-6.1-sol" } });
    fakeProviders({ openai: () => ({ outfits: [] }), gemini: () => ({ outfits: [] }) });
    await suggestOutfits({ count: 2 });
    const countOutfits = () => getDb().select().from(outfitsTable).all().length;
    const before = { garments: listGarments().length, outfits: countOutfits(), saved: listOutfits().length, profile: getProfile() };
    updateAiSettings({ active: { provider: "gemini", model: "gemini-3.8-flash" } });
    expect(listGarments()).toHaveLength(before.garments);
    expect(countOutfits()).toBe(before.outfits);
    expect(listOutfits()).toHaveLength(before.saved);
    expect(getProfile()).toEqual(before.profile);
  });

  it("applies the same hard constraints whichever provider answers", async () => {
    seedSample();
    for (const [provider, model] of [["openai", "gpt-6-luna"], ["gemini", "gemini-3.8-flash"]] as const) {
      await configureProvider(provider, model);
      const answer = { outfits: [{ name: "Invented", garment_ids: [999999, 1], explanation: "x" }] };
      fakeProviders({ openai: () => answer, gemini: () => answer });
      const res = await suggestOutfits({ count: 1 });
      expect(res.source).toBe("rules");
      expect(res.rejected).toBeGreaterThan(0);
      expect(res.outfits[0].items.every((i) => i.garment && i.garment.id !== 999999)).toBe(true);
    }
  });
});
