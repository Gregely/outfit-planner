import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { categoryCare, settings } from "@/server/db/schema";
import { appSettingsSchema, type AppSettings } from "@/lib/schemas";
import { CATEGORIES, DEFAULT_CARE, type CareDefault, type Category } from "@/lib/domain";
import { todayIn } from "@/lib/dates";

const APP_KEY = "app";

/**
 * Settings rows that describe this device rather than the wardrobe (AI provider and model
 * choices). They are not exported in backups and survive a restore.
 */
export const DEVICE_SETTING_KEYS = ["ai"];

export function getSettings(): AppSettings {
  const row = getDb().select().from(settings).where(eq(settings.key, APP_KEY)).get();
  const parsed = appSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : appSettingsSchema.parse({});
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = appSettingsSchema.parse({ ...getSettings(), ...patch });
  getDb()
    .insert(settings)
    .values({ key: APP_KEY, value: next })
    .onConflictDoUpdate({ target: settings.key, set: { value: next } })
    .run();
  return next;
}

/** Today's date in the saved location's timezone. */
export function today(): string {
  return todayIn(getSettings().location?.timezone ?? process.env.TZ ?? null);
}

export function getCareDefaults(): Record<Category, CareDefault> {
  const rows = getDb().select().from(categoryCare).all();
  const out = { ...DEFAULT_CARE };
  for (const r of rows) {
    if ((CATEGORIES as readonly string[]).includes(r.category)) {
      out[r.category] = { washAfterWears: r.washAfterWears, needsIroning: r.needsIroning };
    }
  }
  return out;
}

export function setCareDefault(category: Category, care: CareDefault) {
  getDb()
    .insert(categoryCare)
    .values({ category, ...care })
    .onConflictDoUpdate({ target: categoryCare.category, set: care })
    .run();
  return getCareDefaults();
}
