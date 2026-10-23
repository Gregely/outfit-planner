import { route, readJson } from "@/server/api";
import { commitImport, commitSchema } from "@/server/services/importer";
import { saveSettings } from "@/server/services/settings";

export const POST = route(async (req) => {
  const body = await readJson(req, commitSchema, { maxBytes: 5_000_000 });
  const result = commitImport(body);
  saveSettings({ onboarded: true });
  return result;
});
