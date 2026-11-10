import type { z } from "zod";
import { db, type Tx } from "@/server/db";
import { assertProject, projectAccess, type UserCtx } from "@/server/authz";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import type { addToSprintSchema, completeSprintSchema, createSprintSchema, updateSprintSchema } from "./schemas";

const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

async function sprintWithAccess(ctx: UserCtx, sprintId: string, perm: "project.view" | "sprint.manage") {
  const sprint = await db.sprint.findFirst({ where: { id: sprintId, project: { orgId: ctx.orgId } } });
  if (!sprint) throw notFound("Sprint introuvable.");
  const access = await projectAccess(ctx, { id: sprint.projectId }).catch(() => {
    throw notFound("Sprint introuvable.");
  });
  if (!access.can(perm)) throw forbidden();
  return { sprint, access };
}

export async function createSprint(ctx: UserCtx, input: z.infer<typeof createSprintSchema>) {
  await assertProject(ctx, { id: input.projectId }, "sprint.manage");
  const count = await db.sprint.count({ where: { projectId: input.projectId } });
  return db.sprint.create({ data: { projectId: input.projectId, name: input.name || `Sprint ${count + 1}`, goal: input.goal, startDate: input.startDate, endDate: input.endDate } });
}

export async function updateSprint(ctx: UserCtx, input: z.infer<typeof updateSprintSchema>) {
  const { sprint } = await sprintWithAccess(ctx, input.sprintId, "sprint.manage");
  if (sprint.status === "COMPLETED") throw conflict("Un sprint terminé ne peut plus être modifié.");
  const { sprintId, ...data } = input;
  return db.sprint.update({ where: { id: sprintId }, data });
}

export async function deleteSprint(ctx: UserCtx, sprintId: string) {
  const { sprint } = await sprintWithAccess(ctx, sprintId, "sprint.manage");
  if (sprint.status !== "PLANNED") throw conflict("Seul un sprint planifié peut être supprimé.");
  await db.$transaction([db.issue.updateMany({ where: { sprintId }, data: { sprintId: null } }), db.sprint.delete({ where: { id: sprintId } })]);
}

/** Ajoute des tickets au sprint (ou les renvoie au backlog si sprintId est null). */
export async function assignToSprint(ctx: UserCtx, input: z.infer<typeof addToSprintSchema>) {
  const issues = await db.issue.findMany({ where: { id: { in: input.issueIds }, project: { orgId: ctx.orgId }, archivedAt: null }, select: { id: true, projectId: true, sprintId: true } });
  if (issues.length !== input.issueIds.length) throw notFound("Certains tickets sont introuvables.");
  const projectIds = [...new Set(issues.map((i) => i.projectId))];
  if (projectIds.length !== 1) throw invalid("Les tickets doivent appartenir au même projet.");
  await assertProject(ctx, { id: projectIds[0]! }, "sprint.manage");
  if (input.sprintId) {
    const s = await db.sprint.findUnique({ where: { id: input.sprintId } });
    if (!s || s.projectId !== projectIds[0]) throw invalid("Sprint invalide pour ce projet.");
    if (s.status === "COMPLETED") throw conflict("Ce sprint est terminé.");
  }
  await db.$transaction(async (tx) => {
    for (const i of issues.filter((x) => x.sprintId !== input.sprintId)) {
      await tx.issue.update({ where: { id: i.id }, data: { sprintId: input.sprintId } });
      await tx.issueActivity.create({ data: { issueId: i.id, actorId: ctx.userId, type: "SPRINT_CHANGED", data: { from: i.sprintId, to: input.sprintId } } });
    }
  });
}

async function sprintTotals(tx: Tx | typeof db, sprintId: string) {
  const rows = await tx.$queryRaw<{ total_points: bigint; done_points: bigint; total_issues: bigint; done_issues: bigint }[]>`
    SELECT coalesce(sum(i."storyPoints"), 0) AS total_points,
           coalesce(sum(i."storyPoints") FILTER (WHERE s.category = 'DONE'), 0) AS done_points,
           count(*) AS total_issues,
           count(*) FILTER (WHERE s.category = 'DONE') AS done_issues
    FROM "Issue" i JOIN "WorkflowStatus" s ON s.id = i."statusId"
    WHERE i."sprintId" = ${sprintId} AND i."archivedAt" IS NULL AND i.type <> 'EPIC'`;
  const r = rows[0]!;
  return { totalPoints: Number(r.total_points), completedPoints: Number(r.done_points), totalIssues: Number(r.total_issues), completedIssues: Number(r.done_issues) };
}

/** Relevé du jour (idempotent) : appelé au démarrage, à la clôture, par le worker chaque jour et à la consultation. */
export async function captureSnapshot(sprintId: string, tx: Tx | typeof db = db) {
  const t = await sprintTotals(tx, sprintId);
  const date = today();
  await tx.sprintSnapshot.upsert({ where: { sprintId_date: { sprintId, date } }, update: { ...t, capturedAt: new Date() }, create: { sprintId, date, ...t } });
  return t;
}

export async function startSprint(ctx: UserCtx, sprintId: string) {
  const { sprint } = await sprintWithAccess(ctx, sprintId, "sprint.manage");
  if (sprint.status !== "PLANNED") throw conflict("Ce sprint a déjà été démarré.");
  const active = await db.sprint.findFirst({ where: { projectId: sprint.projectId, status: "ACTIVE" } });
  if (active) throw conflict(`« ${active.name} » est déjà actif : terminez-le avant d'en démarrer un autre.`);
  const issueCount = await db.issue.count({ where: { sprintId, archivedAt: null } });
  if (!issueCount) throw invalid("Ajoutez au moins un ticket avant de démarrer le sprint.");
  return db.$transaction(async (tx) => {
    const t = await sprintTotals(tx, sprintId);
    const s = await tx.sprint.update({ where: { id: sprintId }, data: { status: "ACTIVE", startedAt: new Date(), committedPoints: t.totalPoints } });
    // Les tickets encore en « Backlog » passent dans le premier statut « À faire »
    const todo = await tx.workflowStatus.findFirst({ where: { projectId: sprint.projectId, category: "TODO" }, orderBy: { position: "asc" } });
    if (todo) {
      const backlogItems = await tx.issue.findMany({ where: { sprintId, archivedAt: null, status: { category: "BACKLOG" } }, select: { id: true, statusId: true } });
      for (const i of backlogItems) {
        await tx.issue.update({ where: { id: i.id }, data: { statusId: todo.id } });
        await tx.issueStatusHistory.create({ data: { issueId: i.id, fromStatusId: i.statusId, toStatusId: todo.id, changedById: ctx.userId, source: "SPRINT" } });
      }
    }
    await captureSnapshot(sprintId, tx);
    return s;
  });
}

export async function completeSprint(ctx: UserCtx, input: z.infer<typeof completeSprintSchema>) {
  const { sprint } = await sprintWithAccess(ctx, input.sprintId, "sprint.manage");
  if (sprint.status !== "ACTIVE") throw conflict("Seul le sprint actif peut être terminé.");
  let target: string | null = null;
  if (input.carryOverTo !== "backlog") {
    const t = await db.sprint.findUnique({ where: { id: input.carryOverTo } });
    if (!t || t.projectId !== sprint.projectId || t.status !== "PLANNED") throw invalid("Le sprint de destination doit être un sprint planifié du même projet.");
    target = t.id;
  }
  return db.$transaction(async (tx) => {
    const totals = await captureSnapshot(sprint.id, tx);
    const unfinished = await tx.issue.findMany({ where: { sprintId: sprint.id, archivedAt: null, status: { category: { not: "DONE" } } }, select: { id: true } });
    for (const i of unfinished) {
      await tx.issue.update({ where: { id: i.id }, data: { sprintId: target } });
      await tx.issueActivity.create({ data: { issueId: i.id, actorId: ctx.userId, type: "SPRINT_CHANGED", data: { from: sprint.id, to: target, carryOver: true } } });
    }
    const done = await tx.sprint.update({
      where: { id: sprint.id },
      data: { status: "COMPLETED", completedAt: new Date(), completedPoints: totals.completedPoints, completedIssues: totals.completedIssues },
    });
    return { sprint: done, carriedOver: unfinished.length };
  });
}

/** Rapport de sprint : totaux en direct + burndown issu des relevés réels. */
export async function sprintReport(ctx: UserCtx, sprintId: string) {
  const { sprint } = await sprintWithAccess(ctx, sprintId, "project.view");
  if (sprint.status === "ACTIVE") await captureSnapshot(sprintId);
  const [totals, snapshots] = await Promise.all([sprintTotals(db, sprintId), db.sprintSnapshot.findMany({ where: { sprintId }, orderBy: { date: "asc" } })]);
  const committed = sprint.committedPoints ?? totals.totalPoints;
  // Jours ouvrés du sprint (référence « idéale » : droite entre l'engagement et zéro)
  const days: Date[] = [];
  for (let d = new Date(sprint.startDate); d <= sprint.endDate; d = new Date(d.getTime() + 86_400_000)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(d));
  }
  const byDay = new Map(snapshots.map((s) => [s.date.toISOString().slice(0, 10), s]));
  const burndown = days.map((d, i) => {
    const k = d.toISOString().slice(0, 10);
    const snap = byDay.get(k);
    return {
      date: k,
      ideal: Math.round((committed - (committed * i) / Math.max(1, days.length - 1)) * 10) / 10,
      remaining: snap ? snap.totalPoints - snap.completedPoints : null,
    };
  });
  return { sprint, totals, committed, burndown, completion: totals.totalPoints ? Math.round((totals.completedPoints / totals.totalPoints) * 100) : 0 };
}

/** Vélocité : uniquement les sprints terminés, valeurs figées à la clôture. */
export async function velocity(ctx: UserCtx, projectId: string, take = 6) {
  await projectAccess(ctx, { id: projectId });
  const sprints = await db.sprint.findMany({ where: { projectId, status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take });
  return sprints.reverse().map((s) => ({ name: s.name, committed: s.committedPoints ?? 0, completed: s.completedPoints ?? 0 }));
}

export async function listSprints(ctx: UserCtx, projectId: string) {
  await projectAccess(ctx, { id: projectId });
  return db.sprint.findMany({ where: { projectId }, orderBy: [{ status: "asc" }, { startDate: "desc" }] });
}

/** Tâche de fond quotidienne. */
export async function snapshotActiveSprints() {
  const active = await db.sprint.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  for (const s of active) await captureSnapshot(s.id);
  return active.length;
}
