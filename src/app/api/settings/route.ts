import { route, readJson } from "@/server/api";
import { getCareDefaults, getSettings, saveSettings } from "@/server/services/settings";
import { settingsPatchSchema } from "@/lib/schemas";
import { aiStatus } from "@/server/ai/client";

export const GET = route(() => ({ settings: getSettings(), care: getCareDefaults(), ai: aiStatus() }));
export const PUT = route(async (req) => ({ settings: saveSettings(await readJson(req, settingsPatchSchema)) }));
