import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiUnavailableError, aiStatus, callStructured, describeAiError } from "@/server/ai/client";
import { answerText } from "@/server/ai/providers/anthropic";
import { scrubSecrets } from "@/server/ai/errors";
import { describeSchemaLimits, MAX_UNION_PARAMS, normaliseToSchema, toWireSchema } from "@/server/ai/wire-schema";
import { aiActivitiesSchema, aiAlternativesSchema, aiExtractionSchema, aiGapsSchema, aiOutfitsSchema, aiWeekSchema } from "@/server/ai/tasks";
import { updateAiSettings } from "@/server/services/ai-settings";
import { extractGarmentsFromText } from "@/server/services/importer";
import { saveSettings } from "@/server/services/settings";
import { fakeAi, httpError, NetworkDown } from "../helpers";

const ALL_SCHEMAS = { aiExtractionSchema, aiActivitiesSchema, aiOutfitsSchema, aiWeekSchema, aiAlternativesSchema, aiGapsSchema };

const tiny = z.object({ colour: z.enum(["red", "navy blue"]), n: z.number().int() });
const call = () => callStructured({ system: "s", prompt: "p", schema: tiny, task: "test", group: "daily" });

async function failure(p: Promise<unknown>): Promise<AiUnavailableError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AiUnavailableError);
    return err as AiUnavailableError;
  }
  throw new Error("expected the call to fail");
}

describe("structured-output schemas stay within the documented limits", () => {
  it.each(Object.entries(ALL_SCHEMAS))("%s compiles within 16 union / 24 optional parameters", (_name, schema) => {
    expect(describeSchemaLimits(toWireSchema(schema)).problems).toEqual([]);
  });

  it("detects the kind of schema that broke garment import (18 nullable fields)", () => {
    const shape = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`f${i}`, z.string().nullable()]));
    const limits = describeSchemaLimits(toWireSchema(z.object(shape)));
    expect(limits.unions).toBe(18);
    expect(limits.unions).toBeGreaterThan(MAX_UNION_PARAMS);
    expect(limits.problems[0]).toMatch(/union-typed/);
  });

  it("keeps enums in the wire schema so constrained decoding enforces them", () => {
    const wire = toWireSchema(aiExtractionSchema) as { properties: { garments: { items: { properties: Record<string, { enum?: string[] }> } } } };
    const garment = wire.properties.garments.items.properties;
    expect(garment.category.enum).toContain("shorts");
    expect(garment.fit.enum).toContain("unspecified");
    expect(JSON.stringify(wire)).not.toMatch(/"(minimum|maximum|minLength|maxLength)"/);
  });
});

describe("Anthropic requests", () => {
  it("sends the schema via output_config.format with every field required, and the model's default effort", async () => {
    const calls = fakeAi(() => ({ colour: "red", n: 1 }));
    const { data, meta } = await call();
    expect(data).toEqual({ colour: "red", n: 1 });
    expect(meta).toEqual({ provider: "anthropic", providerLabel: "Claude", model: "claude-opus-5-5" });
    const output = calls[0].output_config as { effort?: string; format: { type: string; schema: { required: string[]; additionalProperties: boolean } } };
    expect(output.format.type).toBe("json_schema");
    expect(output.format.schema.required).toEqual(["colour", "n"]);
    expect(output.format.schema.additionalProperties).toBe(false);
    expect(output.effort).toBeUndefined();
    expect(calls[0].model).toBe("claude-opus-5-5");
  });

  it("uses the configured effort, except on models that reject it", async () => {
    let calls = fakeAi(() => ({ colour: "red", n: 1 }));
    updateAiSettings({ providers: { anthropic: { effort: "high" } } });
    await call();
    expect((calls[0].output_config as { effort?: string }).effort).toBe("high");
    updateAiSettings({ active: { provider: "anthropic", model: "claude-haiku-4-5" } });
    calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    expect((calls[0].output_config as { effort?: string }).effort).toBeUndefined();
  });

  it("requests server-side fallback only on models that support it", async () => {
    let calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    expect(calls[0].fallbacks).toBe("default");
    expect(calls[0].betas).toBeUndefined(); // the SDK sends betas as the anthropic-beta header
    updateAiSettings({ active: { provider: "anthropic", model: "claude-haiku-5-5" } });
    calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    expect(calls[0].fallbacks).toBeUndefined();
    updateAiSettings({ active: { provider: "anthropic", model: "claude-opus-5-5" }, providers: { anthropic: { refusalFallback: false } } });
    calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    expect(calls[0].fallbacks).toBeUndefined();
  });

  it("retries once without the fallback beta if the API rejects it", async () => {
    let n = 0;
    const calls = fakeAi(() => (++n === 1 ? httpError(400, "fallbacks: unknown parameter") : { colour: "red", n: 1 }));
    expect((await call()).data).toEqual({ colour: "red", n: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[1].fallbacks).toBeUndefined();
  });

  it("reads the answer after the last server-side fallback hand-off", async () => {
    const message = {
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"colour": "re' }, { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" } }, { type: "text", text: '{"colour": "navy blue", "n": 3}' }],
    };
    expect(answerText(message)).toBe('{"colour": "navy blue", "n": 3}');
    fakeAi(() => message);
    expect((await call()).data).toEqual({ colour: "navy blue", n: 3 });
  });
});

describe("failures are reported for what they are", () => {
  it("surfaces the API's own message, status and request id for a 400", async () => {
    fakeAi(() => httpError(400, "Schema is too complex for compilation."));
    const err = await failure(call());
    expect(err.reason).toBe("bad_request");
    expect(describeAiError(err)).toMatch(/Claude rejected the request \[400, invalid_request_error\]: Schema is too complex for compilation\. \(request req_test123\)/);
  });

  it("puts the diagnosis in the import notice and still falls back to the offline parser", async () => {
    fakeAi(() => httpError(400, "max_tokens: too large"));
    const res = await extractGarmentsFromText("black Nike polyester shorts");
    expect(res.method).toBe("rules");
    expect(res.notice).toMatch(/Claude couldn't read it – Claude rejected the request.*max_tokens: too large.*offline parser/);
    expect(res.notice).not.toMatch(/declined/);
    expect(res.proposals[0].input.subcategory).toBe("athletic shorts");
  });

  it("distinguishes a refusal (with its category) from an API error", async () => {
    fakeAi(() => ({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "Not able to help with that." }, content: [] }));
    const refusal = await failure(call());
    expect(refusal.reason).toBe("refused");
    expect(describeAiError(refusal)).toMatch(/Claude declined this request – Not able to help with that\. \[category: cyber\]/);

    fakeAi(() => httpError(500, "Internal server error", "api_error"));
    const apiError = await failure(call());
    expect(apiError.reason).toBe("overloaded");
    expect(describeAiError(apiError)).not.toMatch(/declined/);
  });

  it("reports truncation and malformed answers separately", async () => {
    fakeAi(() => ({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"colour": "re' }] }));
    expect((await failure(call())).reason).toBe("truncated");
    fakeAi(() => ({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] }));
    const bad = await failure(call());
    expect(bad.reason).toBe("malformed");
    expect(describeAiError(bad)).toMatch(/didn't match the expected format/);
    fakeAi(() => ({ colour: "green", n: 1 }));
    expect(describeAiError(await failure(call()))).toMatch(/colour/);
  });

  it.each([
    [() => httpError(401, "invalid x-api-key", "authentication_error"), "auth"],
    [() => httpError(429, "rate limited", "rate_limit_error"), "rate_limited"],
    [() => httpError(529, "Overloaded", "overloaded_error"), "overloaded"],
    [() => httpError(404, "model: claude-nope not found", "not_found_error"), "model_unavailable"],
    [() => httpError(400, "output_config.effort: xhigh is not supported on this model"), "unsupported"],
    [
      () => {
        throw new NetworkDown();
      },
      "network",
    ],
  ] as const)("maps %#", async (make, reason) => {
    fakeAi(() => make());
    expect((await failure(call())).reason).toBe(reason);
  });

  it("accepts enum values that differ only in case or separators", async () => {
    fakeAi(() => ({ colour: "Navy_Blue", n: 2 }));
    expect((await call()).data).toEqual({ colour: "navy blue", n: 2 });
    expect(normaliseToSchema({ colour: " RED " }, toWireSchema(tiny))).toEqual({ colour: "red" });
  });
});

describe("availability", () => {
  it("is off without a provider, without a key, or when switched off – never pretending to work", () => {
    expect(aiStatus("daily")).toMatchObject({ enabled: false, reason: "not_configured" });
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(aiStatus("daily")).toMatchObject({ enabled: true, provider: "anthropic", model: "claude-opus-5-5" });
    saveSettings({ aiEnabled: false });
    expect(aiStatus("daily")).toMatchObject({ enabled: false, reason: "disabled" });
    saveSettings({ aiEnabled: true });
    updateAiSettings({ active: { provider: "openai", model: "gpt-6.1-sol" } });
    expect(aiStatus("daily")).toMatchObject({ enabled: false, reason: "no_key", message: "OpenAI needs an API key" });
  });

  it("never lets a key appear in messages or logs", async () => {
    const key = "sk-ant-api03-SECRETSECRETSECRET";
    process.env.ANTHROPIC_API_KEY = key;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    fakeAi(() => httpError(401, `invalid x-api-key: ${key}`, "authentication_error"));
    process.env.ANTHROPIC_API_KEY = key;
    const err = await failure(call());
    expect(describeAiError(err)).not.toContain(key);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(key);
    expect(scrubSecrets(`url?key=AIzaSyA1234567890abcdefghijklmnop&x=1`)).not.toMatch(/AIza/);
    errors.mockRestore();
  });
});
