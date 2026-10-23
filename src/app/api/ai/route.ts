import { z } from "zod";
import { route, readJson } from "@/server/api";
import { getSettings } from "@/server/services/settings";
import { getAiSettingsView, updateAiSettings } from "@/server/services/ai-settings";

/** AI provider settings. Never includes API keys – only whether one is configured. */
export const GET = route(() => getAiSettingsView(getSettings().aiEnabled));

export const PUT = route(async (req) => {
  updateAiSettings(await readJson(req, z.unknown(), { maxBytes: 20_000 }));
  return getAiSettingsView(getSettings().aiEnabled);
});
