import { route } from "@/server/api";
import { loadSampleWardrobe } from "@/server/services/sample";
import { saveSettings } from "@/server/services/settings";

export const POST = route(() => {
  const created = loadSampleWardrobe();
  saveSettings({ onboarded: true });
  return { created: created.length };
});
