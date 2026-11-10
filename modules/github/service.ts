import { db } from "@/server/db";
import { assertOrg, assertProject, visibleProjectsWhere, type UserCtx } from "@/server/authz";
import { githubConfigured } from "@/server/env";
import { conflict, invalid, notFound } from "@/server/errors";
import { audit } from "@/server/audit";
import { enqueueJob } from "@/server/jobs";

export async function integrationStatus(ctx: UserCtx) {
  assertOrg(ctx, "github.manage");
  const [installations, failed, pending, lastEvent] = await Promise.all([
    db.gitHubInstallation.findMany({
      where: { orgId: ctx.orgId },
      include: {
        repositories: {
          orderBy: { fullName: "asc" },
          include: { syncState: true, projects: { include: { project: { select: { id: true, key: true, name: true } } } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.gitHubWebhookEvent.findMany({ where: { status: "FAILED" }, orderBy: { receivedAt: "desc" }, take: 10, select: { id: true, event: true, action: true, deliveryId: true, lastError: true, attempts: true, receivedAt: true } }),
    db.gitHubWebhookEvent.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }),
    db.gitHubWebhookEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true, event: true } }),
  ]);
  const projects = await db.project.findMany({ where: { orgId: ctx.orgId, status: { not: "ARCHIVED" } }, select: { id: true, key: true, name: true }, orderBy: { name: "asc" } });
  return { configured: githubConfigured(), installations, failed, pending, lastEvent, projects };
}

export async function linkRepository(ctx: UserCtx, input: { projectId: string; repositoryId: string }) {
  await assertProject(ctx, { id: input.projectId }, "repo.link");
  const repo = await db.gitHubRepository.findFirst({ where: { id: input.repositoryId, installation: { orgId: ctx.orgId, revokedAt: null } } });
  if (!repo) throw notFound("Dépôt introuvable.");
  if (repo.removedAt) throw invalid("Ce dépôt n'est plus accessible par l'application GitHub.");
  await db.projectRepository.upsert({
    where: { projectId_repositoryId: input },
    update: {},
    create: { ...input, linkedById: ctx.userId },
  });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "github.repo.link", targetType: "project", targetId: input.projectId, data: { repo: repo.fullName } });
  // Première synchronisation (30 derniers jours) en tâche de fond
  await enqueueJob("github.sync_repository", { repositoryId: repo.id }, `sync:${repo.id}`);
}

export async function unlinkRepository(ctx: UserCtx, input: { projectId: string; repositoryId: string }) {
  await assertProject(ctx, { id: input.projectId }, "repo.link");
  const link = await db.projectRepository.findUnique({ where: { projectId_repositoryId: input }, include: { repository: { select: { fullName: true } } } });
  if (!link) throw notFound("Liaison introuvable.");
  await db.projectRepository.delete({ where: { projectId_repositoryId: input } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "github.repo.unlink", targetType: "project", targetId: input.projectId, data: { repo: link.repository.fullName } });
}

export async function triggerSync(ctx: UserCtx, repositoryId: string) {
  assertOrg(ctx, "github.manage");
  const repo = await db.gitHubRepository.findFirst({ where: { id: repositoryId, installation: { orgId: ctx.orgId } } });
  if (!repo) throw notFound("Dépôt introuvable.");
  if (!githubConfigured()) throw conflict("L'intégration GitHub n'est pas configurée.");
  await enqueueJob("github.sync_repository", { repositoryId }, `sync:${repositoryId}`);
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "github.sync.manual", targetType: "repository", targetId: repositoryId });
}

export async function retryFailedEvent(ctx: UserCtx, eventId: string) {
  assertOrg(ctx, "github.manage");
  await db.gitHubWebhookEvent.update({ where: { id: eventId }, data: { status: "PENDING", nextAttemptAt: new Date(), attempts: 0 } });
}

/** Déconnexion locale : les liaisons sont supprimées ; la désinstallation se fait sur GitHub. */
export async function disconnectInstallation(ctx: UserCtx, installationRowId: string) {
  assertOrg(ctx, "github.manage");
  const inst = await db.gitHubInstallation.findFirst({ where: { id: installationRowId, orgId: ctx.orgId } });
  if (!inst) throw notFound();
  await db.$transaction([
    db.projectRepository.deleteMany({ where: { repository: { installationId: inst.id } } }),
    db.gitHubInstallation.update({ where: { id: inst.id }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "github.installation.disconnect", targetType: "github_installation", targetId: inst.id, data: { account: inst.accountLogin } });
}

/** Tableau de bord GitHub : signaux utiles au développement (pas de métriques de vanité). */
export async function githubDashboard(ctx: UserCtx, projectId?: string) {
  const visible = visibleProjectsWhere(ctx);
  const issueScope = { issue: { project: visible, ...(projectId ? { projectId } : {}), archivedAt: null } };
  const prInclude = {
    repository: { select: { fullName: true } },
    issueLinks: { where: issueScope, include: { issue: { select: { key: true, title: true, status: { select: { name: true, category: true } } } } } },
  } as const;
  const [open, awaiting, merged, commits, readyForTest, repos] = await Promise.all([
    db.gitHubPullRequest.findMany({ where: { state: "OPEN", issueLinks: { some: issueScope } }, include: prInclude, orderBy: { githubUpdatedAt: "desc" }, take: 30 }),
    db.gitHubPullRequest.findMany({ where: { state: "OPEN", draft: false, reviewState: { in: ["NONE", "REVIEW_REQUESTED", "COMMENTED"] }, issueLinks: { some: issueScope } }, include: prInclude, orderBy: { openedAt: "asc" }, take: 20 }),
    db.gitHubPullRequest.findMany({ where: { state: "MERGED", mergedAt: { gte: new Date(Date.now() - 14 * 86_400_000) }, issueLinks: { some: issueScope } }, include: prInclude, orderBy: { mergedAt: "desc" }, take: 20 }),
    db.gitHubCommit.findMany({ where: { issueLinks: { some: issueScope } }, include: { repository: { select: { fullName: true } }, issueLinks: { where: issueScope, include: { issue: { select: { key: true } } } } }, orderBy: { committedAt: "desc" }, take: 25 }),
    // Tickets dont une PR est fusionnée mais qui ne sont ni en test ni terminés
    db.issue.findMany({
      where: { project: visible, ...(projectId ? { projectId } : {}), archivedAt: null, status: { category: { in: ["IN_PROGRESS", "IN_REVIEW"] } }, githubLinks: { some: { pullRequest: { state: "MERGED" } } } },
      include: { status: { select: { name: true, category: true } }, assignee: { select: { id: true, name: true, email: true, image: true } }, project: { select: { key: true } } },
      take: 20,
    }),
    db.$queryRaw<{ fullName: string; projectKey: string; commits: bigint; prs: bigint }[]>`
      SELECT r."fullName", p.key AS "projectKey",
        (SELECT count(*) FROM "GitHubCommit" c WHERE c."repositoryId" = r.id AND c."committedAt" > now() - interval '14 days') AS commits,
        (SELECT count(*) FROM "GitHubPullRequest" pr WHERE pr."repositoryId" = r.id AND pr."githubUpdatedAt" > now() - interval '14 days') AS prs
      FROM "GitHubRepository" r JOIN "ProjectRepository" prj ON prj."repositoryId" = r.id JOIN "Project" p ON p.id = prj."projectId"
      WHERE r."removedAt" IS NULL AND p."orgId" = ${ctx.orgId}
      ORDER BY p.key, r."fullName"`,
  ]);
  const visibleKeys = new Set((await db.project.findMany({ where: visible, select: { key: true } })).map((p) => p.key));
  return {
    open,
    awaiting,
    merged,
    commits,
    readyForTest,
    repos: repos.filter((r) => visibleKeys.has(r.projectKey)).map((r) => ({ ...r, commits: Number(r.commits), prs: Number(r.prs) })),
  };
}
