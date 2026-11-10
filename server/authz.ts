import type { OrgRole, ProjectRole } from "@prisma/client";
import { forbidden, notFound } from "./errors";
import { db } from "./db";

/**
 * Autorisation — appliquée dans chaque service, jamais seulement dans l'interface.
 *
 * Rôle effectif dans un projet :
 *  - ADMIN : accès à tous les projets de l'organisation ;
 *  - autres rôles : appartenance au projet obligatoire ;
 *  - appartenance VIEWER : lecture seule, quel que soit le rôle d'organisation ;
 *  - appartenance LEAD : au moins les droits Product Owner sur ce projet.
 */

export type OrgPermission = "org.manage" | "users.manage" | "projects.create" | "github.manage" | "audit.view" | "reports.view";

export type ProjectPermission =
  | "project.view"
  | "project.manage"
  | "members.manage"
  | "workflow.manage"
  | "repo.link"
  | "issue.create"
  | "issue.edit"
  | "issue.delete"
  | "issue.comment"
  | "board.move"
  | "backlog.prioritize"
  | "sprint.manage"
  | "release.manage"
  | "worklog.create";

const ORG: Record<OrgRole, OrgPermission[]> = {
  ADMIN: ["org.manage", "users.manage", "projects.create", "github.manage", "audit.view", "reports.view"],
  PRODUCT_OWNER: ["projects.create", "reports.view"],
  DEVELOPER: ["reports.view"],
  VIEWER: ["reports.view"],
};

const CONTRIBUTOR: ProjectPermission[] = ["project.view", "issue.create", "issue.edit", "issue.comment", "board.move", "worklog.create"];
const MANAGER: ProjectPermission[] = [...CONTRIBUTOR, "project.manage", "members.manage", "issue.delete", "backlog.prioritize", "sprint.manage", "release.manage"];

const PROJECT: Record<OrgRole, ProjectPermission[]> = {
  ADMIN: [...MANAGER, "workflow.manage", "repo.link"],
  PRODUCT_OWNER: MANAGER,
  DEVELOPER: CONTRIBUTOR,
  VIEWER: ["project.view"],
};

export interface UserCtx {
  userId: string;
  orgId: string;
  role: OrgRole;
  name: string;
  email: string;
}

export const orgCan = (ctx: Pick<UserCtx, "role">, p: OrgPermission) => ORG[ctx.role].includes(p);

export function assertOrg(ctx: Pick<UserCtx, "role">, p: OrgPermission) {
  if (!orgCan(ctx, p)) throw forbidden();
}

export function effectiveProjectPermissions(orgRole: OrgRole, projectRole: ProjectRole | null): ProjectPermission[] {
  if (orgRole === "ADMIN") return PROJECT.ADMIN;
  if (!projectRole) return [];
  if (projectRole === "VIEWER") return PROJECT.VIEWER;
  if (projectRole === "LEAD" && (orgRole === "DEVELOPER" || orgRole === "PRODUCT_OWNER")) return MANAGER;
  return PROJECT[orgRole];
}

export interface ProjectAccess {
  project: { id: string; key: string; name: string; orgId: string };
  permissions: ProjectPermission[];
  can: (p: ProjectPermission) => boolean;
}

/**
 * Charge un projet si l'utilisateur y a accès. Un projet inaccessible renvoie « introuvable »
 * (et non « interdit ») pour ne pas révéler son existence.
 */
export async function projectAccess(ctx: UserCtx, where: { id: string } | { key: string }): Promise<ProjectAccess> {
  const project = await db.project.findFirst({
    where: { orgId: ctx.orgId, ...("id" in where ? { id: where.id } : { key: where.key.toUpperCase() }) },
    select: { id: true, key: true, name: true, orgId: true, members: { where: { userId: ctx.userId }, select: { role: true } } },
  });
  if (!project) throw notFound("Projet introuvable.");
  const permissions = effectiveProjectPermissions(ctx.role, project.members[0]?.role ?? null);
  if (!permissions.includes("project.view")) throw notFound("Projet introuvable.");
  const p = { id: project.id, key: project.key, name: project.name, orgId: project.orgId };
  return { project: p, permissions, can: (perm) => permissions.includes(perm) };
}

export async function assertProject(ctx: UserCtx, where: { id: string } | { key: string }, perm: ProjectPermission) {
  const access = await projectAccess(ctx, where);
  if (!access.can(perm)) throw forbidden();
  return access;
}

/** Filtre Prisma : projets visibles par l'utilisateur. */
export const visibleProjectsWhere = (ctx: UserCtx) =>
  ctx.role === "ADMIN" ? { orgId: ctx.orgId } : { orgId: ctx.orgId, members: { some: { userId: ctx.userId } } };

/** Accès à un ticket via son projet. */
export async function issueAccess(ctx: UserCtx, where: { id: string } | { key: string }, perm: ProjectPermission = "project.view") {
  const issue = await db.issue.findFirst({
    where: { ...("id" in where ? { id: where.id } : { key: where.key.toUpperCase() }), project: { orgId: ctx.orgId } },
    select: { id: true, key: true, projectId: true },
  });
  if (!issue) throw notFound("Ticket introuvable.");
  const access = await projectAccess(ctx, { id: issue.projectId }).catch(() => {
    throw notFound("Ticket introuvable.");
  });
  if (!access.can(perm)) throw forbidden();
  return { issue, access };
}
