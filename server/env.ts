import { z } from "zod";

/**
 * Configuration validée au premier accès (et non à l'import) pour que `next build`
 * fonctionne sans secrets. Toute variable manquante produit une erreur explicite.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ORGANIZATION_SLUG: z.string().min(1).default("abnsoft"),
  ORGANIZATION_NAME: z.string().min(1).default("ABN Software Synergie"),

  AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit contenir au moins 32 caractères"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  /** Domaines Google Workspace autorisés, séparés par des virgules (claim `hd` vérifié). */
  ALLOWED_GOOGLE_DOMAINS: z.string().default(""),
  SESSION_MAX_AGE_HOURS: z.coerce.number().int().positive().default(168),
  /** Connexion de développement sans Google (refusée en production quoi qu'il arrive). */
  AUTH_DEV_LOGIN: z.enum(["true", "false"]).default("false"),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  UPLOAD_DIR: z.string().default("./storage/uploads"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join(".")} : ${i.message}`).join("\n");
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const allowedDomains = () =>
  env()
    .ALLOWED_GOOGLE_DOMAINS.split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

export const devLoginEnabled = () => env().NODE_ENV !== "production" && env().AUTH_DEV_LOGIN === "true";

export const githubConfigured = () => {
  const e = env();
  return Boolean(e.GITHUB_APP_ID && e.GITHUB_APP_PRIVATE_KEY && e.GITHUB_WEBHOOK_SECRET && e.GITHUB_APP_SLUG);
};

/** Réinitialise le cache (tests). */
export const resetEnvCache = () => {
  cached = undefined;
};
