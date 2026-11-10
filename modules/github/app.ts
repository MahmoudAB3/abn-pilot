import type { App } from "octokit";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env, githubConfigured } from "@/server/env";
import { AppError } from "@/server/errors";

let app: App | null = null;

/**
 * GitHub App (authentification JWT de l'application → jetons d'installation éphémères).
 * Aucun jeton personnel, aucun jeton stocké en base. Le client `octokit` intègre
 * la reprise sur erreur et le respect des limites de débit (plugins retry/throttling).
 */
export async function githubApp(): Promise<App> {
  if (!githubConfigured()) throw new AppError("UNAVAILABLE", "L'intégration GitHub n'est pas configurée sur ce serveur.");
  if (!app) {
    const e = env();
    // Import dynamique : `octokit` est un module ESM, le worker s'exécute en CommonJS.
    const { App } = await import("octokit");
    app = new App({
      appId: e.GITHUB_APP_ID!,
      privateKey: e.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      webhooks: { secret: e.GITHUB_WEBHOOK_SECRET! },
    });
  }
  return app;
}

export const installationOctokit = async (installationId: bigint | number) => (await githubApp()).getInstallationOctokit(Number(installationId));

/** Comptes GitHub autorisés à installer l'app (protection si l'app est rendue publique par erreur). */
export function allowedOwners() {
  return (process.env.GITHUB_ALLOWED_OWNERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
export const ownerAllowed = (login: string) => {
  const list = allowedOwners();
  return list.length === 0 || list.includes(login.toLowerCase());
};

/* ─── Paramètre `state` signé pour le parcours d'installation (anti-CSRF) ─── */

export function signState(userId: string, ttlSeconds = 600) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", env().AUTH_SECRET).update(`gh-install.${payload}`).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string | null, userId: string): boolean {
  if (!state) return false;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", env().AUTH_SECRET).update(`gh-install.${payload}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u: string; e: number };
    return data.u === userId && data.e > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function installUrl(userId: string) {
  return `https://github.com/apps/${env().GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(signState(userId))}`;
}
