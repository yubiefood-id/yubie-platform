import { defineConfig, devices } from "@playwright/test";
import { testEnvironment } from "./e2e/support/environment.js";
import { resolve, sep } from "node:path";
import { statSync } from "node:fs";

const port = 4173;
const environment = testEnvironment();
const remote = environment.remote;
const authState = remote && process.env.E2E_AUTH_STATE ? resolve(process.env.E2E_AUTH_STATE) : undefined;
if (authState && (!authState.startsWith(resolve("playwright/.auth") + sep) || (statSync(authState).mode & 0o077) !== 0)) throw new Error("E2E_CONFIG: auth state must be a private file under playwright/.auth (mode 600)");
const fullMatrix = process.env.E2E_BROWSER_MATRIX === "full" || remote;
const browserProjects = [
  { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  { name: "mobile-chromium", use: { ...devices["Pixel 7"], browserName: "chromium" as const } },
  ...(fullMatrix ? [
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile-webkit", workers: 1, use: { ...devices["iPhone 13"], browserName: "webkit" as const } },
  ] : []),
];
const needsPreflight = environment.tier === "staging" || environment.tier === "sandbox";

export default defineConfig({
  testDir: "./e2e",
  outputDir: `test-results/${environment.tier}`,
  fullyParallel: !remote,
  workers: remote ? 1 : process.env.CI ? 4 : undefined,
  forbidOnly: true,
  failOnFlakyTests: true,
  retries: remote ? 0 : process.env.CI ? 1 : 0,
  globalTimeout: remote ? 30 * 60_000 : 10 * 60_000,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  metadata: { tier: environment.tier, expectedSha: environment.expectedSha },
  reporter: remote ? [["./e2e/support/redacted-reporter.ts"]] : [["line"], ["html", { open: "never" }], ["./e2e/support/redacted-reporter.ts"]],
  use: {
    baseURL: environment.baseURL,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    storageState: authState,
    serviceWorkers: "block",
    navigationTimeout: 20_000,
    actionTimeout: 10_000,
    trace: remote ? "off" : "retain-on-failure",
    screenshot: remote ? "off" : "only-on-failure",
  },
  projects: [
    ...(needsPreflight ? [{ name: "preflight", testMatch: "remote/preflight.spec.ts", use: { ...devices["Desktop Chrome"] } }] : []),
    ...(environment.tier === "sandbox" ? [{ name: "sandbox-financial-gate", testMatch: "sandbox/**/*.spec.ts", dependencies: ["preflight"], use: { ...devices["Desktop Chrome"] } }] : []),
    ...browserProjects.map((project) => ({ ...project,
      testMatch: environment.tier === "mock" ? ["mock/**/*.spec.ts", "commerce.spec.ts"] : environment.tier === "production-smoke" ? "production-smoke/**/*.spec.ts" : environment.tier === "sandbox" ? "staging/**/*.spec.ts" : "staging/**/*.spec.ts",
      dependencies: needsPreflight ? ["preflight"] : [],
    })),
  ],
  webServer: remote ? undefined : [{
    command: `npm run build --workspace @yubie/web && NODE_ENV=test npm run start --workspace @yubie/web -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 300_000,
  }, {
    command: "npm run build --workspace @yubie/admin && node e2e/mock/admin-server.mjs",
    url: "http://127.0.0.1:4174/healthz",
    reuseExistingServer: false,
    timeout: 120_000,
  }],
});
