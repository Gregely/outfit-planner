import { loadSampleWardrobe } from "@/server/services/sample";
import { __setAiClient, type AiClient } from "@/server/ai/client";
import type { GarmentView } from "@/server/services/garments";

export function seedSample(): Record<string, GarmentView> {
  const created = loadSampleWardrobe();
  return Object.fromEntries(created.map((g) => [g.name, g]));
}

/** Install a fake Anthropic client. `handler` receives the request params and returns parsed_output. */
export function fakeAi(handler: (params: Record<string, unknown>) => unknown, stopReason = "end_turn") {
  process.env.ANTHROPIC_API_KEY = "test-key";
  const calls: Record<string, unknown>[] = [];
  const client: AiClient = {
    beta: {
      messages: {
        parse: async (params) => {
          calls.push(params);
          const out = await handler(params);
          return { stop_reason: stopReason, parsed_output: out };
        },
      },
    },
  };
  __setAiClient(client);
  return calls;
}

export function promptOf(params: Record<string, unknown>): string {
  const messages = params.messages as { content: string }[];
  return messages[0].content;
}
