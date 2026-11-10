import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Client Prisma unique (réutilisé entre rechargements à chaud en développement).
 * Pilote `pg` via adaptateur : pas de moteur natif à télécharger.
 */
function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
    // Base distante (Neon) : chaque requête d'une transaction interactive coûte un aller-retour réseau.
    // Le délai par défaut de Prisma (5 s) est trop court pour les créations en lot hors région.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });
}

const g = globalThis as unknown as { __pilotageDb?: ReturnType<typeof create> };
export const db = g.__pilotageDb ?? create();
if (process.env.NODE_ENV !== "production") g.__pilotageDb = db;

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
