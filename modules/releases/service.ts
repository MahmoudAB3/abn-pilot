import type { z } from "zod";
import { db } from "@/server/db";
import { assertProject, projectAccess, type UserCtx } from "@/server/authz";
import { invalid, notFound } from "@/server/errors";
import { typeLabel } from "@/lib/labels";
import type { milestoneSchema, releaseIssuesSchema, releaseSchema, updateMilestoneSchema, updateReleaseSchema } from "./schemas";

async function releaseAccess(ctx: UserCtx, releaseId: string, perm: "project.view" | "release.manage") {
  const r = await db.release.findFirst({ where: { id: releaseId, project: { orgId: ctx.orgId } } });
  if (!r) throw notFound("Version introuvable.");
  await assertProject(ctx, { id: r.projectId }, perm).catch((e) => {
    throw e.code === "FORBIDDEN" ? e : notFound("Version introuvable.");
  });
  return r;
}

/* Jalons */
export async function createMilestone(ctx: UserCtx, input: z.infer<typeof milestoneSchema>) {
  await assertProject(ctx, { id: input.projectId }, "release.manage");
  return db.milestone.create({ data: input });
}
export async function updateMilestone(ctx: UserCtx, input: z.infer<typeof updateMilestoneSchema>) {
  const m = await db.milestone.findFirst({ where: { id: input.milestoneId, project: { orgId: ctx.orgId } } });
  if (!m) throw notFound("Jalon introuvable.");
  await assertProject(ctx, { id: m.projectId }, "release.manage");
  const { milestoneId, ...data } = input;
  return db.milestone.update({ where: { id: milestoneId }, data });
}

/** Feuille de route : jalons et épopées avec progression réelle (tickets enfants terminés). */
export async function roadmap(ctx: UserCtx, projectKey: string) {
  const access = await projectAccess(ctx, { key: projectKey });
  const projectId = access.project.id;
  const [milestones, epics, progress] = await Promise.all([
    db.milestone.findMany({ where: { projectId }, orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }] }),
    db.issue.findMany({ where: { projectId, type: "EPIC", archivedAt: null }, include: { status: { select: { name: true, category: true } }, labels: { select: { label: { select: { color: true } } } } }, orderBy: { rank: "asc" } }),
    db.$queryRaw<{ epicId: string; total: bigint; done: bigint; inProgress: bigint; start: Date | null; end: Date | null }[]>`
      SELECT i."parentId" AS "epicId", count(*) AS total,
        count(*) FILTER (WHERE s.category = 'DONE') AS done,
        count(*) FILTER (WHERE s.category IN ('IN_PROGRESS','IN_REVIEW','IN_TEST')) AS "inProgress",
        min(i."createdAt") AS start, max(i."dueDate") AS end
      FROM "Issue" i JOIN "WorkflowStatus" s ON s.id = i."statusId"
      JOIN "Issue" e ON e.id = i."parentId" AND e.type = 'EPIC'
      WHERE i."projectId" = ${projectId} AND i."archivedAt" IS NULL
      GROUP BY i."parentId"`,
  ]);
  const p = new Map(progress.map((r) => [r.epicId, { total: Number(r.total), done: Number(r.done), inProgress: Number(r.inProgress), start: r.start, end: r.end }]));
  const epicRows = epics.map((e) => ({ ...e, progress: p.get(e.id) ?? { total: 0, done: 0, inProgress: 0, start: null, end: null } }));
  const ms = milestones.map((m) => {
    const es = epicRows.filter((e) => e.milestoneId === m.id);
    const total = es.reduce((s, e) => s + e.progress.total, 0);
    const done = es.reduce((s, e) => s + e.progress.done, 0);
    return { ...m, epics: es.length, completion: total ? Math.round((done / total) * 100) : m.status === "DONE" ? 100 : 0 };
  });
  return { access, milestones: ms, epics: epicRows };
}

/* Versions */
export async function listReleases(ctx: UserCtx, projectKey: string) {
  const access = await projectAccess(ctx, { key: projectKey });
  const releases = await db.release.findMany({
    where: { projectId: access.project.id },
    orderBy: [{ status: "asc" }, { plannedDate: "asc" }],
    include: { issues: { where: { archivedAt: null }, select: { id: true, status: { select: { category: true } } } } },
  });
  return { access, releases: releases.map((r) => ({ ...r, total: r.issues.length, done: r.issues.filter((i) => i.status.category === "DONE").length })) };
}

export async function getRelease(ctx: UserCtx, releaseId: string) {
  const r = await releaseAccess(ctx, releaseId, "project.view");
  const access = await projectAccess(ctx, { id: r.projectId });
  const issues = await db.issue.findMany({
    where: { releaseId, archivedAt: null },
    include: {
      status: { select: { name: true, category: true } },
      assignee: { select: { id: true, name: true, email: true, image: true } },
      githubLinks: { where: { pullRequestId: { not: null } }, include: { pullRequest: { select: { number: true, title: true, state: true, url: true, repository: { select: { fullName: true } } } } } },
    },
    orderBy: [{ type: "asc" }, { number: "asc" }],
  });
  return { release: r, issues, access };
}

export async function createRelease(ctx: UserCtx, input: z.infer<typeof releaseSchema>) {
  await assertProject(ctx, { id: input.projectId }, "release.manage");
  return db.release.create({ data: input });
}

export async function updateRelease(ctx: UserCtx, input: z.infer<typeof updateReleaseSchema>) {
  const r = await releaseAccess(ctx, input.releaseId, "release.manage");
  const { releaseId, ...data } = input;
  // « Publiée » enregistre la date réelle ; aucune release GitHub n'est créée automatiquement.
  return db.release.update({ where: { id: releaseId }, data: { ...data, ...(data.status === "RELEASED" && !r.releasedAt ? { releasedAt: new Date() } : {}) } });
}

export async function setReleaseIssues(ctx: UserCtx, input: z.infer<typeof releaseIssuesSchema>) {
  const r = await releaseAccess(ctx, input.releaseId, "release.manage");
  const count = await db.issue.count({ where: { id: { in: input.issueIds }, projectId: r.projectId } });
  if (count !== input.issueIds.length) throw invalid("Tous les tickets doivent appartenir au projet de la version.");
  await db.issue.updateMany({ where: { id: { in: input.issueIds } }, data: { releaseId: input.attach ? r.id : null } });
}

/** Brouillon de notes de version à partir des tickets terminés, groupés par type (modifiable ensuite). */
export async function draftReleaseNotes(ctx: UserCtx, releaseId: string) {
  const { release, issues } = await getRelease(ctx, releaseId);
  const done = issues.filter((i) => i.status.category === "DONE");
  const groups: [string, string[]][] = [
    ["Nouveautés", ["STORY", "EPIC"]],
    ["Améliorations", ["TASK", "SUBTASK"]],
    ["Corrections", ["BUG"]],
  ];
  const lines = [`# ${release.name} (${release.version})`, ""];
  for (const [title, types] of groups) {
    const items = done.filter((i) => types.includes(i.type));
    if (!items.length) continue;
    lines.push(`## ${title}`, "");
    for (const i of items) {
      const prs = i.githubLinks.map((l) => l.pullRequest).filter(Boolean).map((pr) => `[#${pr!.number}](${pr!.url})`);
      lines.push(`- ${i.title} (${i.key})${prs.length ? ` — ${prs.join(", ")}` : ""}`);
    }
    lines.push("");
  }
  if (!done.length) lines.push("_Aucun ticket terminé dans cette version pour le moment._");
  void typeLabel;
  return lines.join("\n");
}
