import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { resetDbConnection } from "@/server/db";
import { __setAiFetch } from "@/server/ai/client";
import { secretStore } from "@/server/platform/secrets";

process.env.DATABASE_PATH = ":memory:";
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wardrobe-test-uploads-"));
const AI_ENV = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_MODEL", "ANTHROPIC_EFFORT", "ANTHROPIC_REFUSAL_FALLBACK", "OPENAI_API_KEY", "OPENAI_MODEL", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL", "AI_DISABLED", "SECRETS_PATH"];
for (const k of AI_ENV) delete process.env[k];

beforeEach(() => {
  resetDbConnection();
  __setAiFetch(null);
  secretStore.__reset();
  for (const k of AI_ENV) delete process.env[k];
  // No real network in unit tests: any un-mocked fetch fails like an offline machine would.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("fetch failed (network disabled in tests)");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setAiFetch(null);
});
