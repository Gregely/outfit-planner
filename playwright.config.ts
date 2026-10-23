import { defineConfig, devices } from "@playwright/test";

const PROD = 3210;
const DEV = 3211;
const MOBILE = 4173;
const MOCK_AI = 3299;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "production",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, baseURL: `http://127.0.0.1:${PROD}` },
    },
    {
      // `next dev` runs React Strict Mode, which mounts, unmounts and remounts components –
      // the case that used to dismiss freshly opened dialogs.
      name: "dev-strict-mode",
      testMatch: /dialogs\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, baseURL: `http://127.0.0.1:${DEV}` },
    },
    {
      // The Android app's web bundle (mobile/dist) in a phone-sized Chromium: no server, SQLite
      // in WebAssembly, storage in IndexedDB via the Capacitor Filesystem web fallback.
      name: "android-bundle",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], baseURL: `http://127.0.0.1:${MOBILE}` },
    },
  ],
  webServer: [
    { command: `node scripts/e2e-mock-ai.mjs ${MOCK_AI}`, url: `http://127.0.0.1:${MOCK_AI}/v1/models`, reuseExistingServer: false, timeout: 10_000 },
    { command: `npx vite preview --config mobile/vite.config.mts --port ${MOBILE} --strictPort`, url: `http://127.0.0.1:${MOBILE}`, reuseExistingServer: false, timeout: 60_000 },
    { command: `node scripts/e2e-server.mjs ${PROD} start`, url: `http://127.0.0.1:${PROD}`, reuseExistingServer: false, timeout: 60_000 },
    { command: `node scripts/e2e-server.mjs ${DEV} dev`, url: `http://127.0.0.1:${DEV}`, reuseExistingServer: false, timeout: 120_000 },
  ],
});
