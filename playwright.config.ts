import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

/**
 * End-to-end configuration.
 *
 * These tests drive the real application in a real browser against a real
 * database, worker and parser service. They are deliberately separate from the
 * Vitest suite: unit and RLS tests prove that individual pieces behave, and
 * these prove the pieces are actually wired to each other — which is where
 * every bug found so far in this project has lived.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Some CI images ship a Chromium build that does not match the one Playwright
 * would download. When such a build is present, point at it rather than
 * failing on a missing browser; on an ordinary dev machine this is skipped and
 * Playwright uses its own.
 */
function pinnedChromium(): string | undefined {
  const candidates = [
    process.env.E2E_CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Assessment and interview journeys are long; the default 30s is not enough.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // Serial by default: the suite shares one seeded database, and parallel
  // workers approving the same employer grant would race each other.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: { executablePath: pinnedChromium() },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
