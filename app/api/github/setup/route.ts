import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { getUserCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { audit } from "@/server/audit";
import { githubApp, ownerAllowed, verifyState } from "@/modules/github/app";
import { upsertInstallation } from "@/modules/github/processor";
import { refreshInstallationRepositories } from "@/modules/github/sync";

/**
 * URL de configuration (« Setup URL ») de la GitHub App.
 * Le `state` signé prouve que l'installation a été lancée par un administrateur connecté ;
 * l'identifiant d'installation est revérifié auprès de l'API GitHub (jamais pris pour argent comptant).
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/parametres/github?${q}`, req.url));
  const ctx = await getUserCtx();
  if (!ctx || !orgCan(ctx, "github.manage")) return new NextResponse("Accès refusé", { status: 403 });
  const installationId = Number(req.nextUrl.searchParams.get("installation_id"));
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return back("erreur=installation");
  if (!verifyState(req.nextUrl.searchParams.get("state"), ctx.userId)) return back("erreur=state");
  try {
    const { data } = await (await githubApp()).octokit.request("GET /app/installations/{installation_id}", { installation_id: installationId });
    const account = data.account as { login?: string; slug?: string; type?: string } | null;
    const login = account?.login ?? account?.slug ?? "";
    if (!ownerAllowed(login)) return back("erreur=compte");
    const row = await upsertInstallation(db, { installationId, accountLogin: login, accountType: account?.type ?? "Organization", repositorySelection: data.repository_selection });
    await refreshInstallationRepositories(row.id);
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "github.installation.connect", targetType: "github_installation", targetId: row.id, data: { account: login } });
    return back("connecte=1");
  } catch (e) {
    logger.error({ message: (e as Error).message }, "installation GitHub");
    return back("erreur=api");
  }
}
