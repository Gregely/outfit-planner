import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * API keys for the web app. Keys live only on the server – never in the database, backups,
 * logs or anything sent to the browser – in one of two places:
 *
 * 1. Environment variables (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY…), read-only.
 * 2. Keys entered in Settings, saved to a JSON file readable only by your user account
 *    (mode 0600) next to the database: data/secrets.json, or SECRETS_PATH.
 *
 * A key saved in Settings takes precedence over the environment. The Android app replaces this
 * module with one backed by the Android Keystore (mobile/src/platform/secrets.ts).
 */

const ENV_VARS: Record<string, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  openai: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
};

type FileShape = { version: 1; keys: Record<string, string> };

let memory: FileShape | null = null;

function file(): string | null {
  const configured = process.env.SECRETS_PATH?.trim();
  if (configured) return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
  const db = process.env.DATABASE_PATH?.trim();
  if (db === ":memory:") return null; // tests: keep keys in memory only
  const dir = db ? path.dirname(path.resolve(/*turbopackIgnore: true*/ process.cwd(), db)) : path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data");
  return path.join(dir, "secrets.json");
}

function load(): FileShape {
  const f = file();
  if (!f) return (memory ??= { version: 1, keys: {} });
  try {
    const parsed = JSON.parse(fs.readFileSync(f, "utf8")) as FileShape;
    return parsed && typeof parsed.keys === "object" ? parsed : { version: 1, keys: {} };
  } catch {
    return { version: 1, keys: {} };
  }
}

function save(data: FileShape) {
  const f = file();
  if (!f) {
    memory = data;
    return;
  }
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, f);
  fs.chmodSync(f, 0o600);
}

function fromEnv(id: string): string | null {
  for (const name of ENV_VARS[id] ?? []) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return null;
}

export const secretStore = {
  kind: "server-file" as const,
  description: "Stored on this computer, readable only by your user account – never sent to the browser",
  has(id: string): boolean {
    return Boolean(load().keys[id] || fromEnv(id));
  },
  source(id: string): "stored" | "environment" | null {
    if (load().keys[id]) return "stored";
    return fromEnv(id) ? "environment" : null;
  },
  /** Anthropic only: ANTHROPIC_AUTH_TOKEN is a bearer token rather than an API key. */
  isBearerToken(id: string): boolean {
    return id === "anthropic" && !load().keys[id] && !process.env.ANTHROPIC_API_KEY?.trim() && Boolean(process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  },
  async get(id: string): Promise<string | null> {
    return load().keys[id] || fromEnv(id);
  },
  async set(id: string, value: string): Promise<void> {
    const data = load();
    data.keys[id] = value;
    save(data);
  },
  async remove(id: string): Promise<void> {
    const data = load();
    delete data.keys[id];
    save(data);
  },
  /** Test helper */
  __reset() {
    memory = null;
  },
};
