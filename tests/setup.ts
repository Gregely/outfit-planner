import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { resetDbConnection } from "@/server/db";
import { __setAiTransport } from "@/server/ai/client";

process.env.DATABASE_PATH = ":memory:";
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wardrobe-test-uploads-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_DISABLED;

beforeEach(() => {
  resetDbConnection();
  __setAiTransport(null);
  delete process.env.ANTHROPIC_API_KEY;
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
  __setAiTransport(null);
});
