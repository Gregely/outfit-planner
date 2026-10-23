import { defineConfig, devices } from "@playwright/test";

const PROD = 3210;
const DEV = 3211;

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
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, baseURL: `http://127.0.0.1:${PROD}` },
    },
    {
      // `next dev` runs React Strict Mode, which mounts, unmounts and remounts components –
      // the case that used to dismiss freshly opened dialogs.
      name: "dev-strict-mode",
      testMatch: /dialogs\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, baseURL: `http://127.0.0.1:${DEV}` },
    },
  ],
  webServer: [
    { command: `node scripts/e2e-server.mjs ${PROD} start`, url: `http://127.0.0.1:${PROD}`, reuseExistingServer: false, timeout: 60_000 },
    { command: `node scripts/e2e-server.mjs ${DEV} dev`, url: `http://127.0.0.1:${DEV}`, reuseExistingServer: false, timeout: 120_000 },
  ],
});
