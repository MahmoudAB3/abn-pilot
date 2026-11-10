import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout — base dédiée réinitialisée + jeu de démonstration.
 * La connexion utilise la route de développement (/api/dev/login), jamais disponible en production.
 * E2E_BASE_URL permet de cibler un serveur déjà lancé (même base que E2E_DATABASE_URL).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const databaseUrl = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/pilotage_e2e?schema=public";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Africa/Casablanca",
    trace: "retain-on-failure",
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next dev -p 3200", url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 180_000, env: { DATABASE_URL: databaseUrl, AUTH_DEV_LOGIN: "true", ALLOWED_GOOGLE_DOMAINS: "abnsoft.ma", AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-0123456789" } },
});
