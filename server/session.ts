import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import { getOrganization } from "./org";
import { unauthenticated } from "./errors";
import type { UserCtx } from "./authz";

/**
 * Contexte de l'utilisateur courant, calculé une fois par requête.
 * Une session n'est valide que si l'appartenance à l'organisation est ACTIVE :
 * désactiver un compte le déconnecte immédiatement, même si un cookie subsiste.
 */
export const getUserCtx = cache(async (): Promise<UserCtx | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const org = await getOrganization();
  const m = await db.organizationMembership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId } },
    select: { role: true, status: true, user: { select: { name: true, email: true } } },
  });
  if (!m || m.status !== "ACTIVE") return null;
  return { userId, orgId: org.id, role: m.role, name: m.user.name ?? m.user.email, email: m.user.email };
});

export async function requireUserCtx(): Promise<UserCtx> {
  const ctx = await getUserCtx();
  if (!ctx) throw unauthenticated();
  return ctx;
}

/** Pour les pages : redirige vers la connexion au lieu de lever une erreur. */
export async function requirePageCtx(): Promise<UserCtx> {
  const ctx = await getUserCtx();
  if (!ctx) redirect("/connexion");
  return ctx;
}
