import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const admin = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://lifeos:lifeos@localhost:5433/postgres");
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  // Locally reuse installed Chrome; CI installs the bundled Chromium.
  use: { baseURL: `http://localhost:${PORT}`, channel: process.env.CI ? undefined : "chrome" },
  projects: [
    // Distinct client IPs so the 5/min sign-in limit is per project, as it would be per device.
    { name: "desktop", use: { ...devices["Desktop Chrome"], extraHTTPHeaders: { "x-forwarded-for": "198.51.100.1" } } },
    { name: "mobile", use: { ...devices["Pixel 7"], extraHTTPHeaders: { "x-forwarded-for": "198.51.100.2" } } },
  ],
  webServer: {
    command: `tsx tests/e2e/prepare-db.ts && next build && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: Object.assign(new URL(admin), { pathname: "/lifeos_e2e" }).toString(),
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      LIFEOS_MASTER_KEY: randomBytes(32).toString("base64"),
    },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
