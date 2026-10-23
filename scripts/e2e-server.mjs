// Starts the app for end-to-end tests with an empty, temporary data folder.
// Usage: node scripts/e2e-server.mjs <port> [start|dev]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = process.argv[2] ?? "3210";
const mode = process.argv[3] === "dev" ? "dev" : "start";
const dir = path.resolve("data", `e2e-${mode}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), mode, "-H", "127.0.0.1", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_PATH: path.join(dir, "e2e.db"),
    UPLOADS_DIR: path.join(dir, "uploads"),
    // No real AI providers: runs are free and deterministic. Tests that need a model add the
    // local mock server (scripts/e2e-mock-ai.mjs) as an OpenAI-compatible endpoint.
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_AUTH_TOKEN: "",
    OPENAI_API_KEY: "",
    GEMINI_API_KEY: "",
    GOOGLE_API_KEY: "",
    TZ: process.env.TZ ?? "Europe/London",
  },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
