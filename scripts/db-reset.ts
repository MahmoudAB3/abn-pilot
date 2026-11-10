/** Réinitialise la base de développement : schéma supprimé, migrations, démonstration. Refusé en production. */
import { directDatabaseUrl } from "../server/load-env";
import { execSync } from "node:child_process";
import { Client } from "pg";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusé en production.");
  // Garde-fou : ne jamais vider la branche Neon de production.
  if (process.env.NEON_BRANCH === "production" && !process.env.DATABASE_URL?.includes("localhost"))
    throw new Error("Refusé : DATABASE_URL pointe vers la branche Neon « production ».");
  const c = new Client({ connectionString: directDatabaseUrl() });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  execSync("npx tsx scripts/db-migrate.ts", { stdio: "inherit" });
  if (!process.argv.includes("--no-seed")) execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
}
main().catch((e) => (console.error(e.message), process.exit(1)));
