import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
      // route handlers run outside a Next.js request in unit tests – the same shim the Android build uses
      "next/server": path.resolve(import.meta.dirname, "mobile/src/shims/next-server.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    testTimeout: 20000,
  },
});
