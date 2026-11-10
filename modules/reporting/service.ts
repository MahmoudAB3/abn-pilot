import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { assertOrg, visibleProjectsWhere, type UserCtx } from "@/server/authz";
import { cardInclude } from "@/modules/issues/service";
import { listProjects } from "@/modules/projects/service";

/**
 * Tableaux de bord : uniquement des données réelles, calculées à la lecture.
 * Aucun indicateur ne nécessite de saisie manuelle.
 */

const todayUtc = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

function visibleSql(ctx: UserCtx) {
  return ctx.role === "ADMIN"
    ? Prisma.sql`p."orgId" = ${ctx.orgId}`
    : Prisma.sql`p."orgId" = ${ctx.orgId} AND EXISTS (SELECT 1 FROM "ProjectMembership" pm WHERE pm."projectId" = p.id AND pm."userId" = ${ctx.userId})`;
}

export async function overview(ctx: UserCtx) {
  const visible = visibleProjectsWhere(ctx);
  const open = { archivedAt: null, status: { category: { not: "DONE" as const } } };
  const [projects, mine, overdue, blocked, recent, activeSprints, prsAwaiting] = await Promise.all([
    listProjects(ctx),
    db.issue.findMany({ where: { ...open, assigneeId: ctx.userId, project: visible }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: [{ priority: "asc" }, { updatedAt: "desc" }], take: 10 }),
    db.issue.findMany({ where: { ...open, dueDate: { lt: todayUtc() }, project: visible, type: { not: "EPIC" } }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: { dueDate: "asc" }, take: 10 }),
    db.issue.findMany({ where: { ...open, blocked: true, project: visible }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.issue.findMany({ where: { archivedAt: null, project: visible }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: { updatedAt: "desc" }, take: 8 }),
    db.sprint.findMany({ where: { status: "ACTIVE", project: visible }, include: { project: { select: { key: true, name: true } } } }),
    db.gitHubPullRequest.findMany({
      where: { state: "OPEN", draft: false, reviewState: { in: ["NONE", "REVIEW_REQUESTED", "COMMENTED"] }, issueLinks: { some: { issue: { project: visible } } } },
      include: { repository: { select: { fullName: true } }, issueLinks: { include: { issue: { select: { key: true } } }, take: 3 } },
      orderBy: { githubUpdatedAt: "desc" },
      take: 8,
    }),
  ]);
  const sprintProgress = await Promise.all(activeSprints.map(async (s) => ({ ...s, ...(await sprintNumbers(s.id)) })));
  return { projects, mine, overdue, blocked, recent, sprints: sprintProgress, prsAwaiting };
}

async function sprintNumbers(sprintId: string) {
  const [r] = await db.$queryRaw<{ tp: bigint; dp: bigint; ti: bigint; di: bigint }[]>`
    SELECT coalesce(sum(i."storyPoints"),0) tp, coalesce(sum(i."storyPoints") FILTER (WHERE s.category='DONE'),0) dp,
           count(*) ti, count(*) FILTER (WHERE s.category='DONE') di
    FROM "Issue" i JOIN "WorkflowStatus" s ON s.id = i."statusId" WHERE i."sprintId" = ${sprintId} AND i."archivedAt" IS NULL AND i.type <> 'EPIC'`;
  const totalPoints = Number(r!.tp), completedPoints = Number(r!.dp), totalIssues = Number(r!.ti), completedIssues = Number(r!.di);
  return { totalPoints, completedPoints, totalIssues, completedIssues, completion: totalPoints ? Math.round((completedPoints / totalPoints) * 100) : totalIssues ? Math.round((completedIssues / totalIssues) * 100) : 0 };
}

/** Vue Product Owner : progression, jalons, non-assignés, blocages, retards, versions à venir. */
export async function productOwnerView(ctx: UserCtx) {
  const visible = visibleProjectsWhere(ctx);
  const open = { archivedAt: null, status: { category: { not: "DONE" as const } } };
  const [unassigned, milestones, releases] = await Promise.all([
    db.issue.findMany({ where: { ...open, assigneeId: null, type: { not: "EPIC" }, sprint: { status: { not: "COMPLETED" } }, project: visible }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: [{ priority: "asc" }, { rank: "asc" }], take: 10 }),
    db.milestone.findMany({ where: { status: { not: "DONE" }, project: visible }, include: { project: { select: { key: true } } }, orderBy: { targetDate: "asc" }, take: 8 }),
    db.release.findMany({ where: { status: { in: ["PLANNED", "IN_PROGRESS"] }, project: visible }, include: { project: { select: { key: true } }, issues: { where: { archivedAt: null }, select: { status: { select: { category: true } } } } }, orderBy: { plannedDate: "asc" }, take: 8 }),
  ]);
  return { unassigned, milestones, releases: releases.map((r) => ({ ...r, total: r.issues.length, done: r.issues.filter((i) => i.status.category === "DONE").length })) };
}

/** Vue direction : santé des projets, travail livré par semaine (12 semaines), échéances. */
export async function managementView(ctx: UserCtx) {
  assertOrg(ctx, "reports.view");
  const visible = visibleSql(ctx);
  const [throughput, deadlines, initiatives] = await Promise.all([
    db.$queryRaw<{ week: Date; issues: bigint; points: bigint }[]>`
      SELECT date_trunc('week', i."completedAt") AS week, count(*) AS issues, coalesce(sum(i."storyPoints"),0) AS points
      FROM "Issue" i JOIN "Project" p ON p.id = i."projectId"
      WHERE ${visible} AND i."completedAt" >= now() - interval '12 weeks' AND i."archivedAt" IS NULL AND i.type <> 'EPIC'
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<{ kind: string; id: string; name: string; date: Date; projectKey: string }[]>`
      SELECT 'jalon' AS kind, m.id, m.name, m."targetDate" AS date, p.key AS "projectKey" FROM "Milestone" m JOIN "Project" p ON p.id = m."projectId"
        WHERE ${visible} AND m.status <> 'DONE' AND m."targetDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + 45
      UNION ALL
      SELECT 'version', r.id, r.name || ' (' || r.version || ')', r."plannedDate", p.key FROM "Release" r JOIN "Project" p ON p.id = r."projectId"
        WHERE ${visible} AND r.status IN ('PLANNED','IN_PROGRESS') AND r."plannedDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + 45
      UNION ALL
      SELECT 'projet', p.id, p.name, p."targetDate", p.key FROM "Project" p
        WHERE ${visible} AND p.status = 'ACTIVE' AND p."targetDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + 45
      ORDER BY date LIMIT 12`,
    db.$queryRaw<{ id: string; key: string; title: string; projectKey: string; total: bigint; done: bigint }[]>`
      SELECT e.id, e.key, e.title, p.key AS "projectKey", count(c.id) AS total, count(c.id) FILTER (WHERE s.category = 'DONE') AS done
      FROM "Issue" e JOIN "Project" p ON p.id = e."projectId"
      JOIN "WorkflowStatus" es ON es.id = e."statusId"
      LEFT JOIN "Issue" c ON c."parentId" = e.id AND c."archivedAt" IS NULL
      LEFT JOIN "WorkflowStatus" s ON s.id = c."statusId"
      WHERE ${visible} AND e.type = 'EPIC' AND e."archivedAt" IS NULL AND es.category <> 'DONE'
      GROUP BY e.id, p.key HAVING count(c.id) > 0
      ORDER BY count(c.id) FILTER (WHERE s.category IN ('IN_PROGRESS','IN_REVIEW','IN_TEST')) DESC LIMIT 8`,
  ]);
  return {
    throughput: throughput.map((t) => ({ week: t.week.toISOString().slice(0, 10), issues: Number(t.issues), points: Number(t.points) })),
    deadlines,
    initiatives: initiatives.map((i) => ({ ...i, total: Number(i.total), done: Number(i.done) })),
  };
}

/** Rapports projet : vélocité, temps de cycle médian par type (30 j), répartition par statut. */
export async function projectReport(ctx: UserCtx, projectId: string) {
  const [cycle, distribution] = await Promise.all([
    db.$queryRaw<{ type: string; median_days: number | null; n: bigint }[]>`
      WITH starts AS (
        SELECT h."issueId", min(h."changedAt") AS started
        FROM "IssueStatusHistory" h JOIN "WorkflowStatus" s ON s.id = h."toStatusId"
        WHERE s.category IN ('IN_PROGRESS','IN_REVIEW','IN_TEST') GROUP BY h."issueId")
      SELECT i.type::text, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM i."completedAt" - st.started) / 86400) AS median_days, count(*) AS n
      FROM "Issue" i JOIN starts st ON st."issueId" = i.id
      WHERE i."projectId" = ${projectId} AND i."completedAt" >= now() - interval '30 days' AND i."completedAt" > st.started
      GROUP BY i.type`,
    db.$queryRaw<{ name: string; category: string; n: bigint }[]>`
      SELECT s.name, s.category::text, count(i.id) AS n FROM "WorkflowStatus" s
      LEFT JOIN "Issue" i ON i."statusId" = s.id AND i."archivedAt" IS NULL AND i.type <> 'EPIC'
      WHERE s."projectId" = ${projectId} GROUP BY s.id ORDER BY s.position`,
  ]);
  return {
    cycleTime: cycle.map((c) => ({ type: c.type, medianDays: c.median_days == null ? null : Math.round(c.median_days * 10) / 10, n: Number(c.n) })),
    distribution: distribution.map((d) => ({ ...d, n: Number(d.n) })),
  };
}
