import { z } from "zod";
import { route, readJson } from "@/server/api";
import { addCustomEndpoint } from "@/server/services/ai-settings";

/** Add an OpenAI-compatible endpoint (self-hosted, local or third-party). */
export const POST = route(async (req) => addCustomEndpoint(await readJson(req, z.unknown(), { maxBytes: 4_000 })));
