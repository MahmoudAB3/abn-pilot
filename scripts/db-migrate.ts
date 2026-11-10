/**
 * Applique prisma/migrations/* dans l'ordre, dans des transactions, avec un verrou consultatif.
 * Compatible avec la table `_prisma_migrations` de Prisma (même schéma, même checksum SHA-256) :
 * `prisma migrate deploy` peut prendre le relais là où les moteurs natifs sont disponibles.
 *
 * Pourquoi : le moteur de schéma WASM (sans binaire natif) échoue à l'introspection
 * du type PostgreSQL `name`. Ce script ne fait pas d'introspection.
 */
import { directDatabaseUrl } from "../server/load-env";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const DIR = join(process.cwd(), "prisma", "migrations");
const LOCK_ID = 72_707_101; // identifiant arbitraire du verrou consultatif

export async function migrate(databaseUrl = process.env.DATABASE_URL, log = console.log) {
  if (!databaseUrl) throw new Error("DATABASE_URL manquant");
  // Verrou consultatif de session + transactions explicites : connexion directe obligatoire
  // (le pooler Neon/PgBouncer en mode transaction ne conserve pas la session).
  const client = new Client({ connectionString: directDatabaseUrl(databaseUrl) });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const { rows } = await client.query<{ migration_name: string; checksum: string }>(
      `SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const applied = new Map(rows.map((r) => [r.migration_name, r.checksum]));
    const dirs = readdirSync(DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(DIR, d.name, "migration.sql")))
      .map((d) => d.name)
      .sort();
    let count = 0;
    for (const name of dirs) {
      const sql = readFileSync(join(DIR, name, "migration.sql"), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) log(`⚠ ${name} : le fichier a changé depuis son application (ignoré).`);
        continue;
      }
      const id = randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1, $2, $3, now())`,
          [id, checksum, name],
        );
        await client.query(sql);
        await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
        await client.query("COMMIT");
        log(`✓ ${name}`);
        count++;
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Échec de la migration ${name} : ${(e as Error).message}`);
      }
    }
    log(count ? `${count} migration(s) appliquée(s).` : "Base de données à jour.");
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("db-migrate.ts")) {
  migrate().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
