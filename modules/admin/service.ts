import type { z } from "zod";
import { db } from "@/server/db";
import { allowedDomains, isSuperAdminEmail } from "@/server/env";
import { assertOrg, type UserCtx } from "@/server/authz";
import { conflict, invalid, notFound } from "@/server/errors";
import { audit } from "@/server/audit";
import type { approveSchema, inviteSchema, roleSchema } from "./schemas";

/** Aucune inscription libre : un compte n'existe que par invitation ou approbation d'un administrateur. */

export async function listUsers(ctx: UserCtx) {
  assertOrg(ctx, "users.manage");
  const [members, requests] = await Promise.all([
    db.organizationMembership.findMany({
      where: { orgId: ctx.orgId },
      include: { user: { select: { id: true, name: true, email: true, image: true, lastLoginAt: true, _count: { select: { sessions: true, projectMembers: true } } } } },
      orderBy: [{ status: "asc" }, { invitedAt: "asc" }],
    }),
    db.accessRequest.findMany({ where: { status: "PENDING" }, orderBy: { requestedAt: "desc" } }),
  ]);
  return { members, requests };
}

/** Annuaire de l'équipe (visible par tous les membres actifs). */
export async function teamDirectory(ctx: UserCtx) {
  return db.organizationMembership.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    include: { user: { select: { id: true, name: true, email: true, image: true, projectMembers: { select: { role: true, project: { select: { key: true, name: true } } } } } } },
    orderBy: { user: { name: "asc" } },
  });
}

function assertDomain(email: string) {
  const domains = allowedDomains();
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  // Contrôle de confort à l'invitation ; la vérification de sécurité reste le claim `hd` à la connexion.
  if (domains.length && !domains.includes(domain)) throw invalid(`Seules les adresses des domaines autorisés (${domains.join(", ")}) peuvent être invitées.`);
}

export async function inviteUser(ctx: UserCtx, input: z.infer<typeof inviteSchema>) {
  assertOrg(ctx, "users.manage");
  assertDomain(input.email);
  return db.$transaction(async (tx) => {
    const user = await tx.user.upsert({ where: { email: input.email }, update: {}, create: { email: input.email, name: input.name || null } });
    const existing = await tx.organizationMembership.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: user.id } } });
    if (existing) throw conflict("Cette personne fait déjà partie de l'organisation.");
    const m = await tx.organizationMembership.create({ data: { orgId: ctx.orgId, userId: user.id, role: input.role, status: "INVITED", invitedById: ctx.userId } });
    if (input.projectIds.length) {
      const projects = await tx.project.findMany({ where: { id: { in: input.projectIds }, orgId: ctx.orgId }, select: { id: true } });
      await tx.projectMembership.createMany({ data: projects.map((p) => ({ projectId: p.id, userId: user.id, role: input.role === "VIEWER" ? "VIEWER" : "MEMBER" })), skipDuplicates: true });
    }
    await tx.accessRequest.updateMany({ where: { email: input.email, status: "PENDING" }, data: { status: "APPROVED", reviewedById: ctx.userId, reviewedAt: new Date() } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.invite", targetType: "user", targetId: user.id, data: { email: input.email, role: input.role } }, tx);
    return m;
  });
}

export async function approveRequest(ctx: UserCtx, input: z.infer<typeof approveSchema>) {
  assertOrg(ctx, "users.manage");
  const req = await db.accessRequest.findUnique({ where: { id: input.requestId } });
  if (!req || req.status !== "PENDING") throw notFound("Demande introuvable ou déjà traitée.");
  return inviteUser(ctx, { email: req.email, name: req.name ?? undefined, role: input.role, projectIds: [] });
}

export async function rejectRequest(ctx: UserCtx, requestId: string) {
  assertOrg(ctx, "users.manage");
  const req = await db.accessRequest.update({ where: { id: requestId }, data: { status: "REJECTED", reviewedById: ctx.userId, reviewedAt: new Date() } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.request.reject", targetType: "access_request", targetId: requestId, data: { email: req.email } });
}

async function membershipOf(ctx: UserCtx, userId: string) {
  const m = await db.organizationMembership.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId } } });
  if (!m) throw notFound("Utilisateur introuvable.");
  return m;
}

/** Les super-administrateurs (SUPER_ADMIN_EMAILS) ne peuvent être ni rétrogradés ni désactivés depuis l'application. */
async function assertNotSuperAdmin(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (isSuperAdminEmail(u?.email)) throw conflict("Ce compte est super-administrateur : il ne peut être ni rétrogradé ni désactivé.");
}

/** Empêche de retirer le dernier administrateur actif. */
async function assertNotLastAdmin(ctx: UserCtx, userId: string) {
  const admins = await db.organizationMembership.count({ where: { orgId: ctx.orgId, role: "ADMIN", status: "ACTIVE", userId: { not: userId } } });
  if (!admins) throw conflict("L'organisation doit conserver au moins un administrateur actif.");
}

export async function changeRole(ctx: UserCtx, input: z.infer<typeof roleSchema>) {
  assertOrg(ctx, "users.manage");
  const m = await membershipOf(ctx, input.userId);
  if (m.role === "ADMIN" && input.role !== "ADMIN") {
    await assertNotSuperAdmin(input.userId);
    await assertNotLastAdmin(ctx, input.userId);
  }
  await db.organizationMembership.update({ where: { id: m.id }, data: { role: input.role } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.role.change", targetType: "user", targetId: input.userId, data: { from: m.role, to: input.role } });
}

/** Désactivation : appartenance désactivée et révocation immédiate de toutes les sessions. */
export async function deactivateUser(ctx: UserCtx, userId: string) {
  assertOrg(ctx, "users.manage");
  if (userId === ctx.userId) throw conflict("Vous ne pouvez pas désactiver votre propre compte.");
  await assertNotSuperAdmin(userId);
  const m = await membershipOf(ctx, userId);
  if (m.role === "ADMIN") await assertNotLastAdmin(ctx, userId);
  await db.$transaction([
    db.organizationMembership.update({ where: { id: m.id }, data: { status: "DEACTIVATED", deactivatedAt: new Date() } }),
    db.session.deleteMany({ where: { userId } }),
  ]);
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.deactivate", targetType: "user", targetId: userId });
}

export async function reactivateUser(ctx: UserCtx, userId: string) {
  assertOrg(ctx, "users.manage");
  const m = await membershipOf(ctx, userId);
  const hasAccount = await db.account.count({ where: { userId } });
  await db.organizationMembership.update({ where: { id: m.id }, data: { status: hasAccount ? "ACTIVE" : "INVITED", deactivatedAt: null } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.reactivate", targetType: "user", targetId: userId });
}

export async function revokeSessions(ctx: UserCtx, userId: string) {
  if (userId !== ctx.userId) assertOrg(ctx, "users.manage");
  await membershipOf(ctx, userId);
  const { count } = await db.session.deleteMany({ where: { userId } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.sessions.revoke", targetType: "user", targetId: userId, data: { count } });
  return count;
}

export async function listAudit(ctx: UserCtx, cursor?: string) {
  assertOrg(ctx, "audit.view");
  const rows = await db.auditLog.findMany({ where: { orgId: ctx.orgId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const actors = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, name: true, email: true } });
  return { items: rows.slice(0, 50).map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId) ?? null })), nextCursor: rows.length > 50 ? rows[49]!.id : null };
}
