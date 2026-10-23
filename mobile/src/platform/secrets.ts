import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { isNative } from "./device";

/**
 * API keys on Android: encrypted with an AES-256-GCM key held in the Android Keystore (the key
 * never leaves the secure hardware where available) via @aparajita/capacitor-secure-storage.
 * They're kept out of the database, backups, logs and Android's cloud backup. A key is read
 * from the Keystore only for the moment a request to that provider is made.
 *
 * In a desktop browser (tests / preview builds only) the plugin falls back to localStorage,
 * which is NOT secure – the app says so in Settings.
 */

const PREFIX = "ai-key.";
const present = new Set<string>();

export async function initSecrets() {
  await SecureStorage.setKeyPrefix("wardrobe-studio.").catch(() => {});
  try {
    for (const key of await SecureStorage.keys()) if (key.startsWith(PREFIX)) present.add(key.slice(PREFIX.length));
  } catch (err) {
    console.warn("[secrets] couldn't list stored keys", err instanceof Error ? err.message : err);
  }
}

export const secretStore = {
  kind: isNative ? ("android-keystore" as const) : ("browser-storage" as const),
  description: isNative ? "Encrypted with a key in the Android Keystore" : "Browser storage (preview build – not secure)",
  has(id: string) {
    return present.has(id);
  },
  source(id: string): "stored" | "environment" | null {
    return present.has(id) ? "stored" : null;
  },
  async get(id: string): Promise<string | null> {
    if (!present.has(id)) return null;
    const value = await SecureStorage.getItem(PREFIX + id);
    return typeof value === "string" && value ? value : null;
  },
  async set(id: string, value: string) {
    await SecureStorage.setItem(PREFIX + id, value);
    present.add(id);
  },
  async remove(id: string) {
    await SecureStorage.removeItem(PREFIX + id).catch(() => {});
    present.delete(id);
  },
};
