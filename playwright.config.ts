import { defineConfig, devices } from "@playwright/test";

const adminBase = process.env.ADMIN_E2E_BASE_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "e2e-report" }], ["github"]]
    : [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  outputDir: "test-results",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: adminBase,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
