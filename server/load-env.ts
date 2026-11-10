/**
 * Chargement des variables d'environnement pour les scripts hors Next.js (worker, migrations,
 * seed, prisma.config). Même priorité que Next.js : variables du processus > .env.local > .env.
 * `neon env pull` écrit DATABASE_URL (poolée) et DATABASE_URL_UNPOOLED dans .env.local.
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * URL de connexion directe (sans PgBouncer) pour les opérations à état de session :
 * migrations (verrou consultatif), DROP SCHEMA, etc. Sur Neon, l'hôte direct est l'hôte
 * poolé sans le suffixe `-pooler`. Dérivée de DATABASE_URL pour rester sur la même base,
 * même quand DATABASE_URL est surchargée (tests, e2e).
 */
export function directDatabaseUrl(url = process.env.DATABASE_URL): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace(/-pooler(?=\.)/, "");
    return u.toString();
  } catch {
    return url;
  }
}
