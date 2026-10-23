import { loadSampleWardrobe } from "@/server/services/sample";
import { __setAiTransport, type AiMessage } from "@/server/ai/client";
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

/**
 * Install a fake Anthropic transport. `handler` receives the request params and returns the
 * JSON answer (sent back as a text block), or a full message to simulate refusals etc.
 */
export function fakeAi(handler: (params: Record<string, unknown>) => unknown, stopReason = "end_turn") {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const calls: Record<string, unknown>[] = [];
  __setAiTransport(async (params) => {
    calls.push(structuredClone(params));
    const out = await handler(params);
    if (out && typeof out === "object" && "content" in (out as object) && "stop_reason" in (out as object)) return out as AiMessage;
    return { stop_reason: stopReason, content: out === null || out === undefined ? [] : [{ type: "text", text: JSON.stringify(out) }] };
  });
  return calls;
}

export function promptOf(params: Record<string, unknown>): string {
  const messages = params.messages as { content: string }[];
  return messages[0].content;
}
