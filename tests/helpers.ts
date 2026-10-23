import { loadSampleWardrobe } from "@/server/services/sample";
import { __setAiFetch } from "@/server/ai/client";
import type { GarmentView } from "@/server/services/garments";
import { TEST_WARDROBE } from "./fixtures/wardrobe";
import { createGarments } from "@/server/services/garments";

/** Seed the fixed test wardrobe (independent of the app's sample data). */
export function seedWardrobe(): Record<string, GarmentView> {
  const created = createGarments(TEST_WARDROBE, "test");
  return Object.fromEntries(created.map((g) => [g.name, g]));
}

/** @deprecated kept for older call sites – seeds the fixed test wardrobe */
export const seedSample = seedWardrobe;

export function seedAppSample() {
  return loadSampleWardrobe();
}

/* ------------------------------------------------------------------ */
/* Fake providers, at the HTTP level                                   */
/* ------------------------------------------------------------------ */

/**
 * The fakes below speak each provider's real wire format, so the official SDKs, our adapters,
 * parsing and validation all run exactly as they would against the real APIs.
 */

export type FakeRequest = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> };

/** A handler may return the answer object, a full fake response, or an HTTP error. */
export class HttpReply {
  constructor(
    public status: number,
    public body: unknown,
    public headers: Record<string, string> = {},
  ) {}
}

export function httpError(status: number, message: string, type = "invalid_request_error", headers: Record<string, string> = {}) {
  return new HttpReply(status, { type: "error", error: { type, message } }, { "request-id": "req_test123", ...headers });
}

export class NetworkDown extends TypeError {
  constructor() {
    super("fetch failed");
  }
}

type AnthropicMessage = { stop_reason: string | null; stop_details?: unknown; content: { type: string; text?: string }[]; model?: string };

function sse(events: { event: string; data: unknown }[]) {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
}

/** A Messages API streaming response for the given final message. */
export function anthropicStream(msg: AnthropicMessage) {
  const model = msg.model ?? "claude-opus-5-5";
  const events: { event: string; data: unknown }[] = [
    {
      event: "message_start",
      data: { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } },
    },
  ];
  msg.content.forEach((block, index) => {
    if (block.type === "text") {
      events.push({ event: "content_block_start", data: { type: "content_block_start", index, content_block: { type: "text", text: "" } } });
      events.push({ event: "content_block_delta", data: { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text ?? "" } } });
    } else {
      events.push({ event: "content_block_start", data: { type: "content_block_start", index, content_block: block } });
    }
    events.push({ event: "content_block_stop", data: { type: "content_block_stop", index } });
  });
  events.push({ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: msg.stop_reason, stop_sequence: null, stop_details: msg.stop_details ?? null }, usage: { output_tokens: 5 } } });
  events.push({ event: "message_stop", data: { type: "message_stop" } });
  return new Response(sse(events), { status: 200, headers: { "content-type": "text/event-stream", "request-id": "req_test123" } });
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

type Handler = (req: FakeRequest) => unknown | Promise<unknown>;

export type FakeProviders = {
  anthropic?: Handler;
  openai?: Handler;
  gemini?: Handler;
  /** any other host: an OpenAI-compatible server */
  compatible?: Handler;
  /** model lists, keyed by provider */
  models?: Partial<Record<"anthropic" | "openai" | "gemini" | "compatible", string[]>>;
};

function toResponse(out: unknown, wrap: (answer: unknown) => Response): Response {
  if (out instanceof Response) return out;
  if (out instanceof HttpReply) return json(out.body, out.status, out.headers);
  return wrap(out);
}

/**
 * Install a fake network for every provider. Returns the list of requests made (bodies parsed),
 * for assertions about exactly what was sent.
 */
export function fakeProviders(fakes: FakeProviders) {
  const calls: FakeRequest[] = [];
  __setAiFetch(async (input, init) => {
    const req = new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k] = v));
    const text = req.method === "GET" ? "" : await req.text();
    const call: FakeRequest = { url: req.url, method: req.method, headers, body: text ? JSON.parse(text) : {} };
    calls.push(structuredClone(call));
    const isModels = req.method === "GET" && /\/models\/?$/.test(url.pathname);
    if (url.host === "api.anthropic.com") {
      if (isModels) return json({ data: (fakes.models?.anthropic ?? []).map((id) => ({ id, display_name: id, type: "model", created_at: "2026-01-01T00:00:00Z" })), has_more: false, first_id: null, last_id: null });
      if (!fakes.anthropic) throw new NetworkDown();
      return toResponse(await fakes.anthropic(call), (answer) =>
        answer && typeof answer === "object" && "content" in answer && "stop_reason" in answer
          ? anthropicStream({ model: String(call.body.model), ...(answer as AnthropicMessage) })
          : anthropicStream({ model: String(call.body.model), stop_reason: "end_turn", content: answer === null || answer === undefined ? [] : [{ type: "text", text: JSON.stringify(answer) }] }),
      );
    }
    if (url.host === "api.openai.com") {
      if (isModels) return json({ object: "list", data: (fakes.models?.openai ?? []).map((id) => ({ id, object: "model", created: 0, owned_by: "openai" })) });
      if (!fakes.openai) throw new NetworkDown();
      return toResponse(await fakes.openai(call), (answer) =>
        answer && typeof answer === "object" && "output" in answer
          ? json(answer)
          : json({
              id: "resp_test",
              object: "response",
              created_at: 0,
              status: "completed",
              model: String(call.body.model),
              output: [{ type: "message", id: "msg_test", status: "completed", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(answer), annotations: [] }] }],
              incomplete_details: null,
              error: null,
            }, 200, { "x-request-id": "req_openai1" }),
      );
    }
    if (url.host === "generativelanguage.googleapis.com") {
      if (req.method === "GET" && /\/models$/.test(url.pathname)) {
        return json({ models: (fakes.models?.gemini ?? []).map((id) => ({ name: `models/${id}`, displayName: id, supportedGenerationMethods: ["generateContent"] })) });
      }
      if (!fakes.gemini) throw new NetworkDown();
      return toResponse(await fakes.gemini(call), (answer) =>
        answer && typeof answer === "object" && "candidates" in answer
          ? json(answer)
          : json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP", index: 0 }], modelVersion: url.pathname.split("/").pop()!.split(":")[0], responseId: "gem_test" }),
      );
    }
    if (isModels) return json({ object: "list", data: (fakes.models?.compatible ?? []).map((id) => ({ id, object: "model" })) });
    if (!fakes.compatible) throw new NetworkDown();
    return toResponse(await fakes.compatible(call), (answer) =>
      answer && typeof answer === "object" && "choices" in answer
        ? json(answer)
        : json({ id: "chat_test", object: "chat.completion", created: 0, model: String(call.body.model), choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(answer) }, finish_reason: "stop" }] }),
    );
  });
  return calls;
}

/**
 * The common case: Anthropic configured through ANTHROPIC_API_KEY (as in earlier versions),
 * answering with `handler(requestBody)`. Returns the request bodies.
 */
export function fakeAi(handler: (params: Record<string, unknown>) => unknown, stopReason = "end_turn") {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const bodies: Record<string, unknown>[] = [];
  fakeProviders({
    anthropic: async (req) => {
      bodies.push(req.body);
      const out = await handler(req.body);
      if (out instanceof HttpReply || out instanceof Response) return out;
      if (out && typeof out === "object" && "content" in (out as object) && "stop_reason" in (out as object)) return out;
      return { stop_reason: stopReason, content: out === null || out === undefined ? [] : [{ type: "text", text: JSON.stringify(out) }] };
    },
  });
  return bodies;
}

export function promptOf(params: Record<string, unknown>): string {
  const messages = params.messages as { content: string }[];
  return messages[0].content;
}
