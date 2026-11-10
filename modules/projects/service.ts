import type { Prisma, StatusCategory } from "@prisma/client";
import { db } from "@/server/db";
import { assertOrg, assertProject, projectAccess, visibleProjectsWhere, type UserCtx } from "@/server/authz";
import { conflict, invalid, notFound } from "@/server/errors";
import { audit } from "@/server/audit";
import type { z } from "zod";
import type { automationsSchema, createProjectSchema, labelSchema, memberSchema, removeMemberSchema, updateProjectSchema, workflowSchema } from "./schemas";

export const DEFAULT_WORKFLOW: { name: string; category: StatusCategory; wipLimit?: number }[] = [
  { name: "Backlog", category: "BACKLOG" },
  { name: "À faire", category: "TODO" },
  { name: "En cours", category: "IN_PROGRESS" },
  { name: "En revue", category: "IN_REVIEW" },
  { name: "En test", category: "IN_TEST" },
  { name: "Terminé", category: "DONE" },
];

export async function listProjects(ctx: UserCtx, opts: { includeArchived?: boolean } = {}) {
  const projects = await db.project.findMany({
    where: { ...visibleProjectsWhere(ctx), ...(opts.includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
    orderBy: { name: "asc" },
    include: {
      lead: { select: { id: true, name: true, email: true, image: true } },
      members: { select: { user: { select: { id: true, name: true, email: true, image: true } } }, take: 8 },
      _count: { select: { members: true } },
    },
  });
  if (!projects.length) return [];
  // Comptages agrégés en une requête (tickets ouverts / terminés / en retard / bloqués)
  const stats = await db.$queryRaw<{ projectId: string; total: bigint; done: bigint; overdue: bigint; blocked: bigint }[]>`
    SELECT i."projectId",
      count(*)                                                             AS total,
      count(*) FILTER (WHERE s.category = 'DONE')                          AS done,
      count(*) FILTER (WHERE s.category <> 'DONE' AND i."dueDate" < CURRENT_DATE) AS overdue,
      count(*) FILTER (WHERE s.category <> 'DONE' AND i.blocked)          AS blocked
    FROM "Issue" i JOIN "WorkflowStatus" s ON s.id = i."statusId"
    WHERE i."archivedAt" IS NULL AND i.type <> 'EPIC' AND i."projectId" = ANY(${projects.map((p) => p.id)})
    GROUP BY i."projectId"`;
  const byId = new Map(stats.map((s) => [s.projectId, s]));
  return projects.map((p) => {
    const s = byId.get(p.id);
    const total = Number(s?.total ?? 0);
    const done = Number(s?.done ?? 0);
    const overdue = Number(s?.overdue ?? 0);
    const blocked = Number(s?.blocked ?? 0);
    return { ...p, stats: { total, done, open: total - done, overdue, blocked, progress: total ? Math.round((done / total) * 100) : 0 }, health: projectHealth({ overdue, blocked, open: total - done, targetDate: p.targetDate, progress: total ? done / total : 0 }) };
  });
}

/**
 * Santé calculée à partir de signaux réels (aucune saisie manuelle) :
 * « en retard » si la date cible est dépassée avec du travail restant, ou si > 20 % des tickets ouverts sont en retard ;
 * « à risque » s'il y a des blocages ou des retards ponctuels.
 */
export function projectHealth(s: { overdue: number; blocked: number; open: number; targetDate: Date | null; progress: number }): "en-bonne-voie" | "a-risque" | "en-retard" {
  const today = new Date(new Date().toISOString().slice(0, 10));
  if (s.targetDate && s.targetDate < today && s.open > 0) return "en-retard";
  if (s.open > 0 && s.overdue / s.open > 0.2) return "en-retard";
  if (s.blocked > 0 || s.overdue > 0) return "a-risque";
  return "en-bonne-voie";
}

export async function getProject(ctx: UserCtx, key: string) {
  const access = await projectAccess(ctx, { key });
  const project = await db.project.findUniqueOrThrow({
    where: { id: access.project.id },
    include: {
      lead: { select: { id: true, name: true, email: true, image: true } },
      statuses: { orderBy: { position: "asc" } },
      labels: { orderBy: { name: "asc" } },
      members: { include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { addedAt: "asc" } },
      repositories: { include: { repository: { select: { id: true, fullName: true, htmlUrl: true, removedAt: true, defaultBranch: true } } } },
    },
  });
  return { project, permissions: access.permissions, can: access.can };
}

export async function createProject(ctx: UserCtx, input: z.infer<typeof createProjectSchema>) {
  assertOrg(ctx, "projects.create");
  const exists = await db.project.findUnique({ where: { orgId_key: { orgId: ctx.orgId, key: input.key } } });
  if (exists) throw conflict(`La clé ${input.key} est déjà utilisée par un autre projet.`);
  const leadId = input.leadId ?? ctx.userId;
  const memberIds = [...new Set([ctx.userId, leadId, ...input.memberIds])];
  // Seuls des utilisateurs de l'organisation peuvent être ajoutés
  const valid = await db.organizationMembership.findMany({ where: { orgId: ctx.orgId, userId: { in: memberIds }, status: { not: "DEACTIVATED" } }, select: { userId: true, role: true } });
  const validIds = new Set(valid.map((v) => v.userId));
  const orgViewers = new Set(valid.filter((v) => v.role === "VIEWER").map((v) => v.userId));
  if (orgViewers.has(leadId)) throw invalid("Un observateur ne peut pas être responsable de projet.");
  if (!validIds.has(leadId)) throw invalid("Le responsable doit être un membre actif de l'organisation.");

  return db.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        orgId: ctx.orgId,
        key: input.key,
        name: input.name,
        description: input.description,
        leadId,
        targetDate: input.targetDate,
        statuses: { create: DEFAULT_WORKFLOW.map((s, i) => ({ ...s, position: i })) },
        // Les observateurs de l'organisation restent observateurs dans le projet
        members: { create: [...validIds].map((userId) => ({ userId, role: userId === leadId ? "LEAD" : orgViewers.has(userId) ? "VIEWER" : "MEMBER" })) },
      },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.create", targetType: "project", targetId: project.id, data: { key: project.key } }, tx);
    return project;
  });
}

export async function updateProject(ctx: UserCtx, input: z.infer<typeof updateProjectSchema>) {
  await assertProject(ctx, { id: input.projectId }, "project.manage");
  const { projectId, ...data } = input;
  if (data.leadId) {
    const m = await db.projectMembership.findUnique({ where: { projectId_userId: { projectId, userId: data.leadId } } });
    if (!m) throw invalid("Le responsable doit être membre du projet.");
  }
  const project = await db.project.update({ where: { id: projectId }, data });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.update", targetType: "project", targetId: projectId, data: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue });
  return project;
}

export async function upsertMember(ctx: UserCtx, input: z.infer<typeof memberSchema>) {
  await assertProject(ctx, { id: input.projectId }, "members.manage");
  const m = await db.organizationMembership.findUnique({ where: { orgId_userId: { orgId: ctx.orgId, userId: input.userId } } });
  if (!m || m.status === "DEACTIVATED") throw invalid("Cet utilisateur n'est pas un membre actif de l'organisation.");
  if (m.role === "VIEWER" && input.role !== "VIEWER") throw invalid("Un observateur de l'organisation ne peut être qu'observateur dans un projet.");
  await db.projectMembership.upsert({
    where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
    update: { role: input.role },
    create: { projectId: input.projectId, userId: input.userId, role: input.role },
  });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.member.upsert", targetType: "project", targetId: input.projectId, data: { userId: input.userId, role: input.role } });
}

export async function removeMember(ctx: UserCtx, input: z.infer<typeof removeMemberSchema>) {
  await assertProject(ctx, { id: input.projectId }, "members.manage");
  const project = await db.project.findUniqueOrThrow({ where: { id: input.projectId }, select: { leadId: true } });
  if (project.leadId === input.userId) throw conflict("Désignez un autre responsable avant de retirer celui-ci.");
  await db.projectMembership.deleteMany({ where: { projectId: input.projectId, userId: input.userId } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.member.remove", targetType: "project", targetId: input.projectId, data: { userId: input.userId } });
}

/** Remplace la liste des statuts : ajout, renommage, réordonnancement ; suppression seulement si vide. */
export async function saveWorkflow(ctx: UserCtx, input: z.infer<typeof workflowSchema>) {
  await assertProject(ctx, { id: input.projectId }, "workflow.manage");
  const current = await db.workflowStatus.findMany({ where: { projectId: input.projectId }, include: { _count: { select: { issues: true } } } });
  const keep = new Set(input.statuses.map((s) => s.id).filter(Boolean));
  for (const s of input.statuses) if (s.id && !current.some((c) => c.id === s.id)) throw notFound("Statut introuvable.");
  const removed = current.filter((c) => !keep.has(c.id));
  const nonEmpty = removed.find((r) => r._count.issues > 0);
  if (nonEmpty) throw conflict(`Le statut « ${nonEmpty.name} » contient ${nonEmpty._count.issues} ticket(s) : déplacez-les avant de le supprimer.`);
  await db.$transaction(async (tx) => {
    await tx.workflowStatus.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    // Noms temporaires pour éviter les collisions de la contrainte d'unicité pendant les renommages
    for (const s of current.filter((c) => keep.has(c.id))) await tx.workflowStatus.update({ where: { id: s.id }, data: { name: `__tmp_${s.id}` } });
    for (const [i, s] of input.statuses.entries()) {
      if (s.id) await tx.workflowStatus.update({ where: { id: s.id }, data: { name: s.name, category: s.category, position: i, wipLimit: s.wipLimit ?? null } });
      else await tx.workflowStatus.create({ data: { projectId: input.projectId, name: s.name, category: s.category, position: i, wipLimit: s.wipLimit ?? null } });
    }
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.workflow.update", targetType: "project", targetId: input.projectId, data: { statuses: input.statuses.map((s) => s.name) } }, tx);
  });
}

export async function saveAutomations(ctx: UserCtx, input: z.infer<typeof automationsSchema>) {
  await assertProject(ctx, { id: input.projectId }, "workflow.manage");
  const { projectId, ...data } = input;
  await db.project.update({ where: { id: projectId }, data });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.automations.update", targetType: "project", targetId: projectId, data });
}

export async function createLabel(ctx: UserCtx, input: z.infer<typeof labelSchema>) {
  await assertProject(ctx, { id: input.projectId }, "issue.edit");
  return db.label.create({ data: input });
}

/** Membres assignables d'un projet (pour les sélecteurs). */
export async function projectMembers(ctx: UserCtx, projectId: string) {
  await projectAccess(ctx, { id: projectId });
  const members = await db.projectMembership.findMany({
    where: { projectId, role: { not: "VIEWER" }, user: { memberships: { some: { orgId: ctx.orgId, status: "ACTIVE" } } } },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });
  return members.map((m) => m.user);
}
