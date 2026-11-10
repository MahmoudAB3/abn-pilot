import type { ActivityType, IssueType, Prisma, StatusChangeSource, WorkflowStatus } from "@prisma/client";
import type { z } from "zod";
import { db, type Tx } from "@/server/db";
import { assertProject, issueAccess, projectAccess, visibleProjectsWhere, type UserCtx } from "@/server/authz";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { RANK_STEP, rankBetween } from "@/lib/rank";
import { extractMentions, notify } from "@/modules/notifications/service";
import type {
  bulkUpdateSchema,
  commentSchema,
  createIssueSchema,
  editCommentSchema,
  IssueFilters,
  issuePatchSchema,
  linkSchema,
  moveIssueSchema,
  reorderSchema,
  workLogSchema,
} from "./schemas";

type Patch = z.infer<typeof issuePatchSchema>;

/* ────────────────────────────── Règles de hiérarchie ────────────────────────────── */

/**
 * Épopée : jamais de parent.
 * Story / tâche / anomalie : parent facultatif, obligatoirement une épopée du même projet.
 * Sous-tâche : parent obligatoire, story / tâche / anomalie du même projet.
 */
export function hierarchyError(type: IssueType, parent: { type: IssueType; projectId: string } | null, projectId: string): string | null {
  if (type === "EPIC") return parent ? "Une épopée ne peut pas avoir de parent." : null;
  if (type === "SUBTASK") {
    if (!parent) return "Une sous-tâche doit être rattachée à un ticket parent.";
    if (parent.type === "EPIC" || parent.type === "SUBTASK") return "Le parent d'une sous-tâche doit être une story, une tâche ou une anomalie.";
  } else if (parent && parent.type !== "EPIC") {
    return "Ce type de ticket ne peut être rattaché qu'à une épopée.";
  }
  if (parent && parent.projectId !== projectId) return "Le parent doit appartenir au même projet.";
  return null;
}

async function validateHierarchy(tx: Tx, issue: { id?: string; type: IssueType; projectId: string }, parentId: string | null | undefined) {
  const parent = parentId ? await tx.issue.findUnique({ where: { id: parentId }, select: { id: true, type: true, projectId: true, archivedAt: true } }) : null;
  if (parentId && !parent) throw notFound("Ticket parent introuvable.");
  if (parent?.archivedAt) throw invalid("Le ticket parent est archivé.");
  if (issue.id && parent?.id === issue.id) throw invalid("Un ticket ne peut pas être son propre parent.");
  const err = hierarchyError(issue.type, parent, issue.projectId);
  if (err) throw invalid(err);
  if (issue.id) {
    const children = await tx.issue.findMany({ where: { parentId: issue.id, archivedAt: null }, select: { type: true } });
    for (const c of children) {
      const childErr = hierarchyError(c.type, { type: issue.type, projectId: issue.projectId }, issue.projectId);
      if (childErr) throw conflict("Ce changement de type est incompatible avec les tickets enfants existants.");
    }
  }
}

async function assertAssignable(tx: Tx, ctx: UserCtx, projectId: string, userId: string | null | undefined) {
  if (!userId) return;
  const ok = await tx.user.findFirst({
    where: {
      id: userId,
      memberships: { some: { orgId: ctx.orgId, status: "ACTIVE", role: { not: "VIEWER" } } },
      projectMembers: { some: { projectId, role: { not: "VIEWER" } } },
    },
    select: { id: true },
  });
  if (!ok) throw invalid("La personne assignée doit être un membre actif (non observateur) du projet.");
}

async function assertSprintOfProject(tx: Tx, projectId: string, sprintId: string | null | undefined) {
  if (!sprintId) return;
  const s = await tx.sprint.findUnique({ where: { id: sprintId }, select: { projectId: true, status: true } });
  if (!s || s.projectId !== projectId) throw invalid("Sprint invalide pour ce projet.");
  if (s.status === "COMPLETED") throw invalid("Ce sprint est terminé.");
}

async function statusOf(tx: Tx, projectId: string, statusId: string) {
  const s = await tx.workflowStatus.findUnique({ where: { id: statusId } });
  if (!s || s.projectId !== projectId) throw invalid("Statut invalide pour ce projet.");
  return s;
}

async function logActivity(tx: Tx, issueId: string, actorId: string | null, type: ActivityType, data: Prisma.InputJsonValue = {}) {
  await tx.issueActivity.create({ data: { issueId, actorId, type, data } });
}

/* ──────────────────────────────── Création ──────────────────────────────── */

/** Génère la clé de façon atomique : UPDATE … RETURNING verrouille la ligne projet. */
async function nextIssueNumber(tx: Tx, projectId: string) {
  const [row] = await tx.$queryRaw<{ issueCounter: number; key: string }[]>`
    UPDATE "Project" SET "issueCounter" = "issueCounter" + 1 WHERE id = ${projectId} RETURNING "issueCounter", key`;
  if (!row) throw notFound("Projet introuvable.");
  return { number: row.issueCounter, key: `${row.key}-${row.issueCounter}` };
}

export async function createIssue(ctx: UserCtx, input: z.infer<typeof createIssueSchema>) {
  const access = await assertProject(ctx, { id: input.projectId }, "issue.create");
  return db.$transaction(async (tx) => {
    await validateHierarchy(tx, { type: input.type, projectId: input.projectId }, input.parentId);
    await assertAssignable(tx, ctx, input.projectId, input.assigneeId);
    await assertSprintOfProject(tx, input.projectId, input.sprintId);

    let status: WorkflowStatus;
    if (input.statusId) status = await statusOf(tx, input.projectId, input.statusId);
    else {
      // Dans un sprint → premier statut « À faire » ; sinon → « Backlog »
      const wanted = input.sprintId ? ["TODO", "BACKLOG"] : ["BACKLOG", "TODO"];
      const statuses = await tx.workflowStatus.findMany({ where: { projectId: input.projectId }, orderBy: { position: "asc" } });
      status = statuses.find((s) => s.category === wanted[0]) ?? statuses.find((s) => s.category === wanted[1]) ?? statuses[0]!;
    }
    if (input.labelIds.length) {
      const n = await tx.label.count({ where: { id: { in: input.labelIds }, projectId: input.projectId } });
      if (n !== input.labelIds.length) throw invalid("Étiquette invalide pour ce projet.");
    }

    const { number, key } = await nextIssueNumber(tx, input.projectId);
    const last = await tx.issue.aggregate({ where: { projectId: input.projectId }, _max: { rank: true } });
    const issue = await tx.issue.create({
      data: {
        projectId: input.projectId,
        number,
        key,
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority,
        statusId: status.id,
        assigneeId: input.assigneeId ?? null,
        reporterId: ctx.userId,
        parentId: input.parentId ?? null,
        sprintId: input.sprintId ?? null,
        storyPoints: input.storyPoints ?? null,
        dueDate: input.dueDate ?? null,
        rank: (last._max.rank ?? 0) + RANK_STEP,
        completedAt: status.category === "DONE" ? new Date() : null,
        labels: { create: input.labelIds.map((labelId) => ({ labelId })) },
        watchers: { create: [...new Set([ctx.userId, input.assigneeId].filter(Boolean) as string[])].map((userId) => ({ userId })) },
      },
    });
    await tx.issueStatusHistory.create({ data: { issueId: issue.id, toStatusId: status.id, changedById: ctx.userId } });
    await logActivity(tx, issue.id, ctx.userId, "CREATED", { key });
    if (input.assigneeId) {
      await notify(tx, { recipientIds: [input.assigneeId], type: "ASSIGNED", actorId: ctx.userId, issueId: issue.id, projectId: input.projectId, title: `${ctx.name} vous a assigné ${key}`, body: issue.title });
    }
    void access;
    return issue;
  });
}

/* ─────────────────────────────── Transitions ─────────────────────────────── */

/**
 * Change le statut d'un ticket (utilisateur, automatisation GitHub ou clôture de sprint).
 * Historique, activité, date de complétion et notifications des observateurs.
 */
export async function transition(
  tx: Tx,
  issue: { id: string; key: string; title: string; projectId: string; statusId: string; assigneeId: string | null },
  to: WorkflowStatus,
  actor: { id: string | null; name: string },
  source: StatusChangeSource = "USER",
  extra: Prisma.InputJsonObject = {},
) {
  if (issue.statusId === to.id) return false;
  const from = await tx.workflowStatus.findUnique({ where: { id: issue.statusId } });
  await tx.issue.update({
    where: { id: issue.id },
    data: { statusId: to.id, completedAt: to.category === "DONE" ? new Date() : null, ...(to.category === "DONE" ? { blocked: false, blockedReason: null } : {}) },
  });
  await tx.issueStatusHistory.create({ data: { issueId: issue.id, fromStatusId: issue.statusId, toStatusId: to.id, changedById: actor.id, source } });
  await logActivity(tx, issue.id, actor.id, source === "AUTOMATION" ? "AUTOMATION" : "STATUS_CHANGED", { from: from?.name ?? null, to: to.name, ...extra });
  const watchers = await tx.issueWatcher.findMany({ where: { issueId: issue.id }, select: { userId: true } });
  await notify(tx, {
    recipientIds: [...watchers.map((w) => w.userId), issue.assigneeId],
    type: "STATUS_CHANGED",
    actorId: actor.id,
    issueId: issue.id,
    projectId: issue.projectId,
    title: `${issue.key} est passé à « ${to.name} »`,
    body: issue.title,
  });
  return true;
}

export async function moveIssue(ctx: UserCtx, input: z.infer<typeof moveIssueSchema>) {
  const { issue: ref } = await issueAccess(ctx, { id: input.issueId }, "board.move");
  return db.$transaction(async (tx) => {
    const issue = await tx.issue.findUniqueOrThrow({ where: { id: ref.id } });
    if (issue.archivedAt) throw invalid("Ce ticket est archivé.");
    const to = await statusOf(tx, issue.projectId, input.statusId);
    const neighbours = await tx.issue.findMany({ where: { id: { in: [input.beforeId, input.afterId].filter(Boolean) as string[] }, projectId: issue.projectId }, select: { id: true, rank: true } });
    const rank = rankBetween(neighbours.find((n) => n.id === input.beforeId)?.rank, neighbours.find((n) => n.id === input.afterId)?.rank);
    await tx.issue.update({ where: { id: issue.id }, data: { rank } });
    await transition(tx, issue, to, { id: ctx.userId, name: ctx.name });
    return { id: issue.id, statusId: to.id, rank };
  });
}

/* ─────────────────────────────── Mise à jour ─────────────────────────────── */

const FIELD_LABELS: Record<string, string> = {
  title: "titre",
  description: "description",
  type: "type",
  priority: "priorité",
  storyPoints: "points",
  dueDate: "échéance",
  parentId: "parent",
  milestoneId: "jalon",
  releaseId: "version",
  blocked: "blocage",
  labelIds: "étiquettes",
};

async function applyPatch(tx: Tx, ctx: UserCtx, issueId: string, patch: Patch) {
  const issue = await tx.issue.findUniqueOrThrow({ where: { id: issueId }, include: { labels: true } });
  if (issue.archivedAt && Object.keys(patch).length) throw invalid("Restaurez ce ticket avant de le modifier.");
  const data: Prisma.IssueUncheckedUpdateInput = {};
  const changes: { field: string; from: unknown; to: unknown }[] = [];

  const type = patch.type ?? issue.type;
  const parentId = patch.parentId !== undefined ? patch.parentId : issue.parentId;
  if (patch.type !== undefined || patch.parentId !== undefined) await validateHierarchy(tx, { id: issue.id, type, projectId: issue.projectId }, parentId);
  if (patch.assigneeId !== undefined) await assertAssignable(tx, ctx, issue.projectId, patch.assigneeId);
  if (patch.sprintId !== undefined) await assertSprintOfProject(tx, issue.projectId, patch.sprintId);
  if (patch.milestoneId) {
    const m = await tx.milestone.findUnique({ where: { id: patch.milestoneId } });
    if (!m || m.projectId !== issue.projectId) throw invalid("Jalon invalide pour ce projet.");
  }
  if (patch.releaseId) {
    const r = await tx.release.findUnique({ where: { id: patch.releaseId } });
    if (!r || r.projectId !== issue.projectId) throw invalid("Version invalide pour ce projet.");
  }

  for (const f of ["title", "description", "type", "priority", "storyPoints", "dueDate", "parentId", "milestoneId", "releaseId", "blocked", "blockedReason"] as const) {
    const next = patch[f];
    if (next === undefined) continue;
    const prev = issue[f];
    const same = next instanceof Date && prev instanceof Date ? next.getTime() === prev.getTime() : next === prev;
    if (same) continue;
    (data as Record<string, unknown>)[f] = next;
    if (f !== "blockedReason") changes.push({ field: f, from: f === "description" ? null : prev, to: f === "description" ? null : next });
  }
  if (patch.blocked === false) data.blockedReason = null;

  if (patch.labelIds) {
    const n = await tx.label.count({ where: { id: { in: patch.labelIds }, projectId: issue.projectId } });
    if (n !== patch.labelIds.length) throw invalid("Étiquette invalide pour ce projet.");
    const before = issue.labels.map((l) => l.labelId).sort();
    const after = [...new Set(patch.labelIds)].sort();
    if (before.join() !== after.join()) {
      await tx.issueLabel.deleteMany({ where: { issueId } });
      await tx.issueLabel.createMany({ data: after.map((labelId) => ({ issueId, labelId })) });
      changes.push({ field: "labelIds", from: before.length, to: after.length });
    }
  }

  if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId) {
    data.assigneeId = patch.assigneeId;
    await logActivity(tx, issueId, ctx.userId, "ASSIGNED", { from: issue.assigneeId, to: patch.assigneeId });
    if (patch.assigneeId) {
      await tx.issueWatcher.upsert({ where: { issueId_userId: { issueId, userId: patch.assigneeId } }, update: {}, create: { issueId, userId: patch.assigneeId } });
      await notify(tx, { recipientIds: [patch.assigneeId], type: "ASSIGNED", actorId: ctx.userId, issueId, projectId: issue.projectId, title: `${ctx.name} vous a assigné ${issue.key}`, body: issue.title });
    }
  }
  if (patch.sprintId !== undefined && patch.sprintId !== issue.sprintId) {
    data.sprintId = patch.sprintId;
    await logActivity(tx, issueId, ctx.userId, "SPRINT_CHANGED", { from: issue.sprintId, to: patch.sprintId });
  }

  if (Object.keys(data).length) await tx.issue.update({ where: { id: issueId }, data });
  if (changes.length) await logActivity(tx, issueId, ctx.userId, "UPDATED", { changes: changes.map((c) => ({ ...c, label: FIELD_LABELS[c.field] ?? c.field })) } as unknown as Prisma.InputJsonValue);

  if (patch.statusId && patch.statusId !== issue.statusId) {
    const to = await statusOf(tx, issue.projectId, patch.statusId);
    await transition(tx, { ...issue, assigneeId: (data.assigneeId as string | null | undefined) ?? issue.assigneeId }, to, { id: ctx.userId, name: ctx.name });
  }
  return issue.id;
}

export async function updateIssue(ctx: UserCtx, input: { issueId: string; patch: Patch }) {
  const { access } = await issueAccess(ctx, { id: input.issueId }, "issue.edit");
  // Prioriser ou planifier (sprint, version, jalon) relève du Product Owner
  if ((input.patch.milestoneId !== undefined || input.patch.releaseId !== undefined) && !access.can("release.manage")) throw forbidden();
  return db.$transaction((tx) => applyPatch(tx, ctx, input.issueId, input.patch));
}

export async function bulkUpdate(ctx: UserCtx, input: z.infer<typeof bulkUpdateSchema>) {
  const issues = await db.issue.findMany({ where: { id: { in: input.issueIds }, project: { orgId: ctx.orgId } }, select: { id: true, projectId: true } });
  if (issues.length !== input.issueIds.length) throw notFound("Certains tickets sont introuvables.");
  const projectIds = [...new Set(issues.map((i) => i.projectId))];
  if (projectIds.length !== 1) throw invalid("Les modifications groupées portent sur un seul projet à la fois.");
  const access = await assertProject(ctx, { id: projectIds[0]! }, "issue.edit");
  if (input.patch.archive && !access.can("issue.delete")) throw forbidden();
  if (input.patch.sprintId !== undefined && !access.can("sprint.manage")) throw forbidden();
  const { addLabelIds, archive, ...patch } = input.patch;
  return db.$transaction(
    async (tx) => {
      for (const i of issues) {
        let labelIds: string[] | undefined;
        if (addLabelIds?.length) {
          const current = await tx.issueLabel.findMany({ where: { issueId: i.id }, select: { labelId: true } });
          labelIds = [...new Set([...current.map((c) => c.labelId), ...addLabelIds])];
        }
        await applyPatch(tx, ctx, i.id, { ...patch, ...(labelIds ? { labelIds } : {}) });
        if (archive) {
          await tx.issue.update({ where: { id: i.id }, data: { archivedAt: new Date() } });
          await logActivity(tx, i.id, ctx.userId, "ARCHIVED");
        }
      }
      return issues.length;
    },
    { timeout: 30_000 },
  );
}

/* ─────────────────────── Ordre (backlog / planification) ─────────────────────── */

export async function reorderIssue(ctx: UserCtx, input: z.infer<typeof reorderSchema>) {
  const { access, issue: ref } = await issueAccess(ctx, { id: input.issueId }, "backlog.prioritize");
  return db.$transaction(async (tx) => {
    const issue = await tx.issue.findUniqueOrThrow({ where: { id: ref.id } });
    if (input.sprintId !== issue.sprintId) {
      if (!access.can("sprint.manage")) throw forbidden();
      await assertSprintOfProject(tx, issue.projectId, input.sprintId);
    }
    const neighbours = await tx.issue.findMany({ where: { id: { in: [input.beforeId, input.afterId].filter(Boolean) as string[] }, projectId: issue.projectId }, select: { id: true, rank: true } });
    const rank = rankBetween(neighbours.find((n) => n.id === input.beforeId)?.rank, neighbours.find((n) => n.id === input.afterId)?.rank);
    await tx.issue.update({ where: { id: issue.id }, data: { rank, sprintId: input.sprintId } });
    if (input.sprintId !== issue.sprintId) await logActivity(tx, issue.id, ctx.userId, "SPRINT_CHANGED", { from: issue.sprintId, to: input.sprintId });
    return { rank };
  });
}

/* ─────────────────────── Archivage, restauration, duplication ─────────────────────── */

export async function archiveIssue(ctx: UserCtx, issueId: string) {
  await issueAccess(ctx, { id: issueId }, "issue.delete");
  await db.$transaction(async (tx) => {
    await tx.issue.update({ where: { id: issueId }, data: { archivedAt: new Date() } });
    // Les sous-tâches suivent leur parent
    await tx.issue.updateMany({ where: { parentId: issueId, type: "SUBTASK", archivedAt: null }, data: { archivedAt: new Date() } });
    await logActivity(tx, issueId, ctx.userId, "ARCHIVED");
  });
}

export async function restoreIssue(ctx: UserCtx, issueId: string) {
  await issueAccess(ctx, { id: issueId }, "issue.delete");
  await db.$transaction(async (tx) => {
    const issue = await tx.issue.findUniqueOrThrow({ where: { id: issueId }, include: { parent: { select: { archivedAt: true } } } });
    if (issue.parent?.archivedAt) throw conflict("Restaurez d'abord le ticket parent.");
    await tx.issue.update({ where: { id: issueId }, data: { archivedAt: null } });
    await logActivity(tx, issueId, ctx.userId, "RESTORED");
  });
}

/** Suppression définitive : uniquement un ticket déjà archivé et sans enfant actif. */
export async function deleteIssue(ctx: UserCtx, issueId: string) {
  await issueAccess(ctx, { id: issueId }, "issue.delete");
  const issue = await db.issue.findUniqueOrThrow({ where: { id: issueId }, include: { _count: { select: { children: true } } } });
  if (!issue.archivedAt) throw conflict("Archivez le ticket avant de le supprimer définitivement.");
  if (issue._count.children) throw conflict("Ce ticket a des tickets enfants : supprimez-les ou détachez-les d'abord.");
  await db.issue.delete({ where: { id: issueId } });
}

export async function duplicateIssue(ctx: UserCtx, issueId: string) {
  const { issue: ref } = await issueAccess(ctx, { id: issueId }, "issue.create");
  const src = await db.issue.findUniqueOrThrow({ where: { id: ref.id }, include: { labels: true } });
  return createIssue(ctx, {
    projectId: src.projectId,
    title: `${src.title} (copie)`.slice(0, 240),
    description: src.description,
    type: src.type,
    priority: src.priority,
    parentId: src.parentId,
    sprintId: src.sprintId,
    storyPoints: src.storyPoints,
    dueDate: src.dueDate,
    labelIds: src.labels.map((l) => l.labelId),
    assigneeId: null,
    statusId: null,
  });
}

/* ───────────────────────────── Liens, commentaires ───────────────────────────── */

export async function addLink(ctx: UserCtx, input: z.infer<typeof linkSchema>) {
  const { issue } = await issueAccess(ctx, { id: input.sourceId }, "issue.edit");
  const { issue: target } = await issueAccess(ctx, { key: input.targetKey }, "project.view");
  if (target.id === issue.id) throw invalid("Un ticket ne peut pas être lié à lui-même.");
  return db.$transaction(async (tx) => {
    const link = await tx.issueLink.create({ data: { sourceId: issue.id, targetId: target.id, type: input.type } });
    await logActivity(tx, issue.id, ctx.userId, "LINKED", { type: input.type, target: target.key });
    await logActivity(tx, target.id, ctx.userId, "LINKED", { type: input.type, source: issue.key, inverse: true });
    return link;
  });
}

export async function removeLink(ctx: UserCtx, linkId: string) {
  const link = await db.issueLink.findUnique({ where: { id: linkId } });
  if (!link) throw notFound();
  await issueAccess(ctx, { id: link.sourceId }, "issue.edit");
  await db.issueLink.delete({ where: { id: linkId } });
}

export async function addComment(ctx: UserCtx, input: z.infer<typeof commentSchema>) {
  const { issue } = await issueAccess(ctx, { id: input.issueId }, "issue.comment");
  return db.$transaction(async (tx) => {
    const full = await tx.issue.findUniqueOrThrow({ where: { id: issue.id }, select: { id: true, key: true, title: true, projectId: true, assigneeId: true } });
    const comment = await tx.comment.create({ data: { issueId: issue.id, authorId: ctx.userId, body: input.body } });
    await logActivity(tx, issue.id, ctx.userId, "COMMENTED", { commentId: comment.id });
    await tx.issueWatcher.upsert({ where: { issueId_userId: { issueId: issue.id, userId: ctx.userId } }, update: {}, create: { issueId: issue.id, userId: ctx.userId } });
    const mentioned = extractMentions(input.body);
    if (mentioned.length) {
      await notify(tx, { recipientIds: mentioned, type: "MENTIONED", actorId: ctx.userId, issueId: issue.id, projectId: full.projectId, title: `${ctx.name} vous a mentionné dans ${full.key}`, body: full.title });
    }
    const watchers = await tx.issueWatcher.findMany({ where: { issueId: issue.id, userId: { notIn: mentioned } }, select: { userId: true } });
    await notify(tx, { recipientIds: watchers.map((w) => w.userId), type: "COMMENTED", actorId: ctx.userId, issueId: issue.id, projectId: full.projectId, title: `${ctx.name} a commenté ${full.key}`, body: full.title });
    return comment;
  });
}

async function ownComment(ctx: UserCtx, commentId: string) {
  const c = await db.comment.findUnique({ where: { id: commentId } });
  if (!c || c.deletedAt) throw notFound("Commentaire introuvable.");
  await issueAccess(ctx, { id: c.issueId }, "issue.comment");
  if (c.authorId !== ctx.userId && ctx.role !== "ADMIN") throw forbidden("Seul l'auteur peut modifier ce commentaire.");
  return c;
}

export async function editComment(ctx: UserCtx, input: z.infer<typeof editCommentSchema>) {
  await ownComment(ctx, input.commentId);
  return db.comment.update({ where: { id: input.commentId }, data: { body: input.body } });
}

export async function deleteComment(ctx: UserCtx, commentId: string) {
  await ownComment(ctx, commentId);
  await db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date(), body: "" } });
}

export async function toggleWatch(ctx: UserCtx, issueId: string) {
  await issueAccess(ctx, { id: issueId });
  const where = { issueId_userId: { issueId, userId: ctx.userId } };
  const existing = await db.issueWatcher.findUnique({ where });
  if (existing) await db.issueWatcher.delete({ where });
  else await db.issueWatcher.create({ data: { issueId, userId: ctx.userId } });
  return !existing;
}

export async function logWork(ctx: UserCtx, input: z.infer<typeof workLogSchema>) {
  await issueAccess(ctx, { id: input.issueId }, "worklog.create");
  return db.$transaction(async (tx) => {
    const log = await tx.workLog.create({ data: { ...input, userId: ctx.userId } });
    await logActivity(tx, input.issueId, ctx.userId, "WORK_LOGGED", { minutes: input.minutes });
    return log;
  });
}

/* ──────────────────────────────── Lecture ──────────────────────────────── */

const userSelect = { id: true, name: true, email: true, image: true } as const;

export const cardInclude = {
  status: { select: { id: true, name: true, category: true } },
  assignee: { select: userSelect },
  parent: { select: { id: true, key: true, title: true, type: true } },
  labels: { select: { label: { select: { id: true, name: true, color: true } } } },
  _count: { select: { children: true, comments: true, githubLinks: true } },
} satisfies Prisma.IssueInclude;

export type IssueCardRow = Prisma.IssueGetPayload<{ include: typeof cardInclude }>;

export async function getIssueDetail(ctx: UserCtx, key: string) {
  const { issue: ref, access } = await issueAccess(ctx, { key });
  const issue = await db.issue.findUniqueOrThrow({
    where: { id: ref.id },
    include: {
      ...cardInclude,
      reporter: { select: userSelect },
      project: { select: { id: true, key: true, name: true } },
      sprint: { select: { id: true, name: true, status: true } },
      milestone: { select: { id: true, name: true } },
      release: { select: { id: true, name: true, version: true } },
      children: { where: { archivedAt: null }, include: { status: { select: { name: true, category: true } }, assignee: { select: userSelect } }, orderBy: { rank: "asc" } },
      comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, include: { author: { select: userSelect } } },
      attachments: { orderBy: { createdAt: "desc" }, include: { uploader: { select: userSelect } } },
      activities: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: userSelect } } },
      linksOut: { include: { target: { select: { id: true, key: true, title: true, status: { select: { name: true, category: true } } } } } },
      linksIn: { include: { source: { select: { id: true, key: true, title: true, status: { select: { name: true, category: true } } } } } },
      watchers: { select: { userId: true } },
      workLogs: { select: { minutes: true } },
      githubLinks: {
        include: {
          commit: { include: { repository: { select: { fullName: true } } } },
          pullRequest: { include: { repository: { select: { fullName: true } } } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  await db.recentView.upsert({ where: { userId_issueId: { userId: ctx.userId, issueId: issue.id } }, update: { viewedAt: new Date() }, create: { userId: ctx.userId, issueId: issue.id } });
  return { issue, permissions: access.permissions, watching: issue.watchers.some((w) => w.userId === ctx.userId), loggedMinutes: issue.workLogs.reduce((s, w) => s + w.minutes, 0) };
}

export type IssueDetail = Awaited<ReturnType<typeof getIssueDetail>>;

/** Construit le filtre Prisma correspondant aux filtres de l'interface (filtrage côté serveur). */
export function filtersWhere(ctx: UserCtx, f: Omit<IssueFilters, "limit" | "cursor">): Prisma.IssueWhereInput {
  const and: Prisma.IssueWhereInput[] = [{ project: visibleProjectsWhere(ctx) }];
  if (f.projectId) and.push({ projectId: f.projectId });
  and.push(f.archived ? { archivedAt: { not: null } } : { archivedAt: null });
  if (f.assigneeIds?.length) {
    const ids = f.assigneeIds.filter((x) => x !== "none");
    and.push({ OR: [...(ids.length ? [{ assigneeId: { in: ids } }] : []), ...(f.assigneeIds.includes("none") ? [{ assigneeId: null }] : [])] });
  }
  if (f.types?.length) and.push({ type: { in: f.types } });
  if (f.priorities?.length) and.push({ priority: { in: f.priorities } });
  if (f.statusIds?.length) and.push({ statusId: { in: f.statusIds } });
  if (f.sprintId) and.push({ sprintId: f.sprintId === "none" ? null : f.sprintId });
  if (f.labelIds?.length) and.push({ labels: { some: { labelId: { in: f.labelIds } } } });
  if (f.epicId) and.push({ OR: [{ parentId: f.epicId }, { parent: { parentId: f.epicId } }] });
  if (f.blocked) and.push({ blocked: true });
  if (f.q) {
    const q = f.q.trim();
    and.push({ OR: [{ key: { equals: q.toUpperCase() } }, { title: { contains: q, mode: "insensitive" } }] });
  }
  return { AND: and };
}

/** Liste paginée par curseur (ordre stable : rang puis id). */
export async function listIssues(ctx: UserCtx, f: IssueFilters) {
  if (f.projectId) await projectAccess(ctx, { id: f.projectId });
  const rows = await db.issue.findMany({
    where: filtersWhere(ctx, f),
    include: { ...cardInclude, project: { select: { key: true } }, sprint: { select: { name: true } } },
    orderBy: [{ rank: "asc" }, { id: "asc" }],
    take: f.limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, f.limit), nextCursor: rows.length > f.limit ? rows[f.limit - 1]!.id : null };
}

export async function myIssues(ctx: UserCtx) {
  return db.issue.findMany({
    where: { assigneeId: ctx.userId, archivedAt: null, project: visibleProjectsWhere(ctx) },
    include: { ...cardInclude, project: { select: { key: true, name: true } }, sprint: { select: { name: true, status: true } } },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
  });
}

export async function recentlyViewed(ctx: UserCtx, take = 8) {
  const rows = await db.recentView.findMany({
    where: { userId: ctx.userId, issue: { archivedAt: null, project: visibleProjectsWhere(ctx) } },
    orderBy: { viewedAt: "desc" },
    take,
    include: { issue: { select: { key: true, title: true, type: true } } },
  });
  return rows.map((r) => r.issue);
}
