// Starts the production server for end-to-end tests with an empty, temporary data folder.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const port = process.argv[2] ?? "3210";
const dir = path.resolve("data", "e2e");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const child = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_PATH: path.join(dir, "e2e.db"),
    UPLOADS_DIR: path.join(dir, "uploads"),
    ANTHROPIC_API_KEY: "",
    AI_DISABLED: "1",
    TZ: process.env.TZ ?? "Europe/London",
  },
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
