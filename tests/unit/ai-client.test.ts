import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { AiUnavailableError, aiConfig, answerText, callStructured, describeAiError } from "@/server/ai/client";
import { describeSchemaLimits, MAX_UNION_PARAMS, normaliseToSchema, toWireSchema } from "@/server/ai/wire-schema";
import { aiActivitiesSchema, aiAlternativesSchema, aiExtractionSchema, aiGapsSchema, aiOutfitsSchema, aiWeekSchema } from "@/server/ai/tasks";
import { extractGarmentsFromText } from "@/server/services/importer";
import { fakeAi } from "../helpers";

const ALL_SCHEMAS = { aiExtractionSchema, aiActivitiesSchema, aiOutfitsSchema, aiWeekSchema, aiAlternativesSchema, aiGapsSchema };

const tiny = z.object({ colour: z.enum(["red", "navy blue"]), n: z.number().int() });
const call = () => callStructured({ system: "s", prompt: "p", schema: tiny, task: "test" });

async function failure(p: Promise<unknown>): Promise<AiUnavailableError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AiUnavailableError);
    return err as AiUnavailableError;
  }
  throw new Error("expected the call to fail");
}

afterEach(() => {
  delete process.env.ANTHROPIC_MODEL;
  delete process.env.ANTHROPIC_REFUSAL_FALLBACK;
  delete process.env.ANTHROPIC_EFFORT;
});

describe("structured-output schemas stay within the documented limits", () => {
  it.each(Object.entries(ALL_SCHEMAS))("%s compiles within 16 union / 24 optional parameters", (_name, schema) => {
    const limits = describeSchemaLimits(toWireSchema(schema));
    expect(limits.problems).toEqual([]);
  });

  it("detects the kind of schema that broke garment import (18 nullable fields)", () => {
    const shape = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`f${i}`, z.string().nullable()]));
    const limits = describeSchemaLimits(toWireSchema(z.object(shape)));
    expect(limits.unions).toBe(18);
    expect(limits.unions).toBeGreaterThan(MAX_UNION_PARAMS);
    expect(limits.problems[0]).toMatch(/union-typed/);
  });

  it("keeps enums in the wire schema so constrained decoding enforces them", () => {
    const wire = toWireSchema(aiExtractionSchema) as { properties: { garments: { items: { properties: Record<string, { enum?: string[]; additionalProperties?: boolean }> } } } };
    const garment = wire.properties.garments.items.properties;
    expect(garment.category.enum).toContain("shorts");
    expect(garment.fit.enum).toContain("unspecified");
    expect(JSON.stringify(wire)).not.toMatch(/"(minimum|maximum|minLength|maxLength)"/);
  });

  it("sends the schema via output_config.format with every field required", async () => {
    const calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    const format = (calls[0].output_config as { format: { type: string; schema: { required: string[]; additionalProperties: boolean } } }).format;
    expect(format.type).toBe("json_schema");
    expect(format.schema.required).toEqual(["colour", "n"]);
    expect(format.schema.additionalProperties).toBe(false);
    expect(calls[0].model).toBe("claude-opus-5-5");
  });
});

describe("Claude failures are reported for what they are", () => {
  it("surfaces the API's own message, status and request id for a 400", async () => {
    fakeAi(() => {
      throw new Anthropic.BadRequestError(
        400,
        { type: "error", error: { type: "invalid_request_error", message: "Schema is too complex for compilation." } },
        "400",
        new Headers({ "request-id": "req_abc" }),
      );
    });
    const err = await failure(call());
    expect(err.reason).toBe("bad_request");
    expect(describeAiError(err)).toMatch(/rejected the request \[400, invalid_request_error\]: Schema is too complex for compilation\. \(request req_abc\)/);
  });

  it("puts the diagnosis in the import notice and still falls back to the offline parser", async () => {
    fakeAi(() => {
      throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "max_tokens: too large" } }, "400", new Headers());
    });
    const res = await extractGarmentsFromText("black Nike polyester shorts");
    expect(res.method).toBe("rules");
    expect(res.notice).toMatch(/rejected the request.*max_tokens: too large.*offline parser/);
    expect(res.notice).not.toMatch(/declined/);
    expect(res.proposals[0].input.subcategory).toBe("athletic shorts");
  });

  it("distinguishes a refusal (with its category) from an API error", async () => {
    fakeAi(() => ({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "Not able to help with that." }, content: [] }));
    const refusal = await failure(call());
    expect(refusal.reason).toBe("refused");
    expect(describeAiError(refusal)).toMatch(/declined this request – Not able to help with that\. \[category: cyber\]/);

    fakeAi(() => {
      throw new Anthropic.InternalServerError(500, { type: "error", error: { type: "api_error", message: "Internal server error" } }, "500", new Headers());
    });
    const apiError = await failure(call());
    expect(apiError.reason).not.toBe("refused");
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

  it("maps auth, rate-limit and network errors to clear reasons", async () => {
    for (const [make, reason] of [
      [() => new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers()), "auth"],
      [() => new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers()), "rate_limited"],
      [() => new Anthropic.APIConnectionError({ message: "Connection error." }), "network"],
    ] as const) {
      fakeAi(() => {
        throw make();
      });
      expect((await failure(call())).reason).toBe(reason);
    }
  });

  it("accepts enum values that differ only in case or separators", async () => {
    fakeAi(() => ({ colour: "Navy_Blue", n: 2 }));
    expect(await call()).toEqual({ colour: "navy blue", n: 2 });
    expect(normaliseToSchema({ colour: " RED " }, toWireSchema(tiny))).toEqual({ colour: "red" });
  });

  it("reads the answer after the last server-side fallback hand-off", async () => {
    const message = {
      stop_reason: "end_turn",
      content: [
        { type: "text", text: '{"colour": "re' },
        { type: "fallback" },
        { type: "text", text: '{"colour": "navy blue", "n": 3}' },
      ],
    };
    expect(answerText(message)).toBe('{"colour": "navy blue", "n": 3}');
    fakeAi(() => message);
    expect(await call()).toEqual({ colour: "navy blue", n: 3 });
  });
});

describe("model configuration", () => {
  it("requests server-side fallback only on models that support it", async () => {
    let calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    expect(calls[0].fallbacks).toBe("default");
    expect(calls[0].betas).toEqual(["server-side-fallback-2026-07-01"]);

    process.env.ANTHROPIC_MODEL = "claude-haiku-5-5";
    calls = fakeAi(() => ({ colour: "red", n: 1 }));
    await call();
    expect(calls[0].model).toBe("claude-haiku-5-5");
    expect(calls[0].fallbacks).toBeUndefined();
    expect(calls[0].betas).toBeUndefined();

    process.env.ANTHROPIC_MODEL = "claude-opus-5-5";
    process.env.ANTHROPIC_REFUSAL_FALLBACK = "off";
    expect(aiConfig().refusalFallback).toBe(false);
  });

  it("omits effort for models that reject it", () => {
    process.env.ANTHROPIC_MODEL = "claude-haiku-4-5";
    expect(aiConfig().effort).toBeNull();
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5-5";
    expect(aiConfig().effort).toBe("medium");
  });

  it("retries once without the fallback beta if the API rejects it", async () => {
    let n = 0;
    const calls = fakeAi(() => {
      n++;
      if (n === 1) throw new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "fallbacks: unknown parameter" } }, "400", new Headers());
      return { colour: "red", n: 1 };
    });
    expect(await call()).toEqual({ colour: "red", n: 1 });
    expect(calls).toHaveLength(2);
    expect(calls[1].fallbacks).toBeUndefined();
  });
});
