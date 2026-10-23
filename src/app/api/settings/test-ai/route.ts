import { z } from "zod";
import { route } from "@/server/api";
import { AiUnavailableError, REASON_TEXT, aiStatus, callStructured } from "@/server/ai/client";

export const POST = route(async () => {
  const status = aiStatus();
  if (!status.enabled) return { ok: false, message: REASON_TEXT[status.reason!] };
  try {
    const out = await callStructured({
      system: "Reply with the requested JSON only.",
      prompt: 'Return {"ok": true}.',
      schema: z.object({ ok: z.boolean() }),
      maxTokens: 2000,
      effort: "low",
    });
    return { ok: out.ok, message: `Connected to ${status.model}.` };
  } catch (err) {
    return { ok: false, message: err instanceof AiUnavailableError ? REASON_TEXT[err.reason] : "Unexpected error." };
  }
});
