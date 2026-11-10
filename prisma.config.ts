import { directDatabaseUrl } from "./server/load-env";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma fonctionne entièrement sur adaptateur JS (pilote `pg`) :
 * aucun binaire natif n'est téléchargé, ni pour les requêtes ni pour les migrations.
 */
export default defineConfig({
  experimental: { adapter: true },
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  engine: "js",
  // Connexion directe (sans PgBouncer) : les commandes de schéma Prisma utilisent l'état de session.
  adapter: async () => new PrismaPg({ connectionString: directDatabaseUrl()! }),
});
