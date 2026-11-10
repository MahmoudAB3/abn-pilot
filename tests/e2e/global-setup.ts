import { execSync } from "node:child_process";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/pilotage_e2e?schema=public";
  execSync("npx tsx scripts/db-reset.ts", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, ALLOWED_GOOGLE_DOMAINS: "abnsoft.ma", NODE_ENV: "development" } });
}
