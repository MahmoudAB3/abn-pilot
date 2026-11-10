import type { GitHubWebhookEvent, Prisma, PrState, ReviewState, StatusCategory } from "@prisma/client";
import type { z } from "zod";
import { db, type Tx } from "@/server/db";
import { logger } from "@/server/logger";
import { extractIssueKeys } from "@/lib/issue-keys";
import { transition } from "@/modules/issues/service";
import { notify } from "@/modules/notifications/service";
import { getOrganization } from "@/server/org";
import { ownerAllowed } from "./app";
import {
  installationEvent,
  installationRepositoriesEvent,
  pullRequest as prSchema,
  pullRequestEvent,
  pullRequestReviewEvent,
  pushEvent,
  repository as repoSchema,
  repositoryEvent,
} from "./payloads";

/** Erreur non récupérable : l'évènement est marqué IGNORED sans nouvelle tentative. */
export class SkipEvent extends Error {}

type RepoPayload = z.infer<typeof repoSchema>;
type PrPayload = z.infer<typeof prSchema>;

/* ───────────────────────────── Installation et dépôts ───────────────────────────── */

async function installationRow(installationId: number | bigint) {
  return db.gitHubInstallation.findUnique({ where: { installationId: BigInt(installationId) } });
}

export async function upsertInstallation(tx: Tx | typeof db, data: { installationId: number; accountLogin: string; accountType: string; repositorySelection: string }) {
  if (!ownerAllowed(data.accountLogin)) throw new SkipEvent(`Compte GitHub non autorisé : ${data.accountLogin}`);
  const org = await getOrganization();
  return tx.gitHubInstallation.upsert({
    where: { installationId: BigInt(data.installationId) },
    update: { accountLogin: data.accountLogin, accountType: data.accountType, repositorySelection: data.repositorySelection, revokedAt: null, suspendedAt: null },
    create: { orgId: org.id, installationId: BigInt(data.installationId), accountLogin: data.accountLogin, accountType: data.accountType, repositorySelection: data.repositorySelection },
  });
}

export async function upsertRepository(tx: Tx | typeof db, installationRowId: string, r: { id: number; name: string; full_name: string; private: boolean; html_url?: string; default_branch?: string }) {
  const [owner] = r.full_name.split("/");
  return tx.gitHubRepository.upsert({
    where: { githubId: BigInt(r.id) },
    update: { installationId: installationRowId, name: r.name, fullName: r.full_name, owner: owner!, private: r.private, removedAt: null, ...(r.html_url ? { htmlUrl: r.html_url } : {}), ...(r.default_branch ? { defaultBranch: r.default_branch } : {}) },
    create: { installationId: installationRowId, githubId: BigInt(r.id), name: r.name, fullName: r.full_name, owner: owner!, private: r.private, htmlUrl: r.html_url ?? `https://github.com/${r.full_name}`, defaultBranch: r.default_branch ?? "main" },
  });
}

async function handleInstallation(payload: unknown) {
  const p = installationEvent.parse(payload);
  const i = p.installation;
  switch (p.action) {
    case "created":
    case "new_permissions_accepted":
    case "unsuspend": {
      const row = await upsertInstallation(db, { installationId: i.id, accountLogin: i.account.login, accountType: i.account.type, repositorySelection: i.repository_selection });
      for (const r of p.repositories ?? []) await upsertRepository(db, row.id, r);
      return;
    }
    case "suspend":
      await db.gitHubInstallation.updateMany({ where: { installationId: BigInt(i.id) }, data: { suspendedAt: new Date() } });
      return;
    case "deleted": {
      // Installation révoquée : on conserve l'historique (commits, PR liés) mais on coupe les liaisons.
      const row = await installationRow(i.id);
      if (!row) return;
      await db.$transaction([
        db.gitHubInstallation.update({ where: { id: row.id }, data: { revokedAt: new Date() } }),
        db.gitHubRepository.updateMany({ where: { installationId: row.id }, data: { removedAt: new Date() } }),
        db.projectRepository.deleteMany({ where: { repository: { installationId: row.id } } }),
      ]);
      return;
    }
  }
}

async function handleInstallationRepositories(payload: unknown) {
  const p = installationRepositoriesEvent.parse(payload);
  const row = await installationRow(p.installation.id);
  if (!row) throw new SkipEvent("Installation inconnue.");
  for (const r of p.repositories_added) await upsertRepository(db, row.id, r);
  const removedIds = p.repositories_removed.map((r) => BigInt(r.id));
  if (removedIds.length) {
    await db.$transaction([
      db.gitHubRepository.updateMany({ where: { githubId: { in: removedIds } }, data: { removedAt: new Date() } }),
      db.projectRepository.deleteMany({ where: { repository: { githubId: { in: removedIds } } } }),
    ]);
  }
  if (p.repository_selection) await db.gitHubInstallation.update({ where: { id: row.id }, data: { repositorySelection: p.repository_selection } });
}

async function handleRepository(payload: unknown) {
  const p = repositoryEvent.parse(payload);
  if (p.action === "deleted" || p.action === "archived") {
    await db.gitHubRepository.updateMany({ where: { githubId: BigInt(p.repository.id) }, data: { removedAt: p.action === "deleted" ? new Date() : undefined } });
    if (p.action === "deleted") await db.projectRepository.deleteMany({ where: { repository: { githubId: BigInt(p.repository.id) } } });
  } else if (p.action === "renamed" || p.action === "edited" || p.action === "transferred") {
    await db.gitHubRepository.updateMany({
      where: { githubId: BigInt(p.repository.id) },
      data: { name: p.repository.name, fullName: p.repository.full_name, owner: p.repository.owner.login, htmlUrl: p.repository.html_url, defaultBranch: p.repository.default_branch },
    });
  }
}

/* ───────────────────────────── Résolution des tickets ───────────────────────────── */

/**
 * Dépôt connu ET lié à au moins un projet : sinon rien n'est enregistré
 * (on ne conserve pas d'activité GitHub sans rapport avec Pilotage).
 */
async function linkedRepository(r: RepoPayload | { id: number }, installationId?: number) {
  const repo = await db.gitHubRepository.findUnique({
    where: { githubId: BigInt(r.id) },
    include: { installation: true, projects: { include: { project: { select: { id: true, key: true } } } } },
  });
  if (!repo || repo.removedAt || repo.installation.revokedAt || repo.installation.suspendedAt) return null;
  if (installationId && repo.installation.installationId !== BigInt(installationId)) {
    throw new SkipEvent("L'installation ne correspond pas au dépôt.");
  }
  if (!repo.projects.length) return null;
  return repo;
}

async function issuesForKeys(projectIds: string[], keys: string[]) {
  if (!keys.length) return [];
  return db.issue.findMany({
    where: { key: { in: keys }, projectId: { in: projectIds }, archivedAt: null },
    select: { id: true, key: true, title: true, projectId: true, statusId: true, assigneeId: true },
  });
}

/* ──────────────────────────────────── Commits ──────────────────────────────────── */

export async function applyCommits(
  repo: { id: string; projects: { project: { id: string } }[] },
  commits: { sha: string; message: string; url: string; timestamp: string; authorName: string; authorLogin?: string | null }[],
) {
  const projectIds = repo.projects.map((p) => p.project.id);
  let linked = 0;
  for (const c of commits) {
    const keys = extractIssueKeys([c.message]);
    const issues = await issuesForKeys(projectIds, keys);
    if (!issues.length) continue; // clés inconnues : ignorées
    await db.$transaction(async (tx) => {
      const commit = await tx.gitHubCommit.upsert({
        where: { repositoryId_sha: { repositoryId: repo.id, sha: c.sha } },
        update: {},
        create: { repositoryId: repo.id, sha: c.sha, message: c.message.slice(0, 5000), url: c.url, committedAt: new Date(c.timestamp), authorName: c.authorName, authorLogin: c.authorLogin ?? null },
      });
      for (const issue of issues) {
        const created = await tx.gitHubIssueLink.createMany({ data: [{ issueId: issue.id, commitId: commit.id }], skipDuplicates: true });
        if (created.count) {
          linked++;
          await tx.issueActivity.create({ data: { issueId: issue.id, type: "COMMIT_LINKED", data: { sha: c.sha.slice(0, 7), message: c.message.split("\n")[0]!.slice(0, 200), author: c.authorLogin ?? c.authorName, url: c.url } } });
        }
      }
    });
  }
  return linked;
}

async function handlePush(payload: unknown) {
  const p = pushEvent.parse(payload);
  const repo = await linkedRepository(p.repository, p.installation?.id);
  if (!repo) return;
  await applyCommits(
    repo,
    p.commits.filter((c) => c.distinct).map((c) => ({ sha: c.id, message: c.message, url: c.url, timestamp: c.timestamp, authorName: c.author.name, authorLogin: c.author.username })),
  );
}

/* ───────────────────────────────── Pull requests ───────────────────────────────── */

const prState = (pr: PrPayload): PrState => (pr.merged || pr.merged_at ? "MERGED" : pr.state === "closed" ? "CLOSED" : "OPEN");

/** Premier statut (par position) d'une catégorie dans le workflow du projet. */
async function firstStatus(tx: Tx, projectId: string, category: StatusCategory) {
  return tx.workflowStatus.findFirst({ where: { projectId, category }, orderBy: { position: "asc" } });
}

const ORDER: StatusCategory[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "IN_TEST", "DONE"];

/**
 * Automatisations — désactivées par défaut, activées projet par projet.
 * Elles ne font jamais reculer un ticket déjà plus avancé, sauf « modifications demandées »
 * qui ramène explicitement de « En revue » / « En test » vers « En cours ».
 */
async function runAutomation(
  tx: Tx,
  issue: { id: string; key: string; title: string; projectId: string; statusId: string; assigneeId: string | null },
  trigger: "pr_opened" | "changes_requested" | "pr_merged",
  pr: { number: number; repo: string },
) {
  const project = await tx.project.findUniqueOrThrow({ where: { id: issue.projectId }, select: { autoReviewOnPrOpen: true, autoInProgressOnChangesAsked: true, autoOnMergeCategory: true } });
  const current = await tx.workflowStatus.findUniqueOrThrow({ where: { id: issue.statusId } });
  const idx = ORDER.indexOf(current.category);
  let target: StatusCategory | null = null;
  if (trigger === "pr_opened" && project.autoReviewOnPrOpen && idx < ORDER.indexOf("IN_REVIEW")) target = "IN_REVIEW";
  if (trigger === "changes_requested" && project.autoInProgressOnChangesAsked && (current.category === "IN_REVIEW" || current.category === "IN_TEST")) target = "IN_PROGRESS";
  if (trigger === "pr_merged" && project.autoOnMergeCategory && idx < ORDER.indexOf(project.autoOnMergeCategory)) target = project.autoOnMergeCategory;
  if (!target) return false;
  const to = await firstStatus(tx, issue.projectId, target);
  if (!to) return false;
  const label = { pr_opened: "ouverture de PR", changes_requested: "modifications demandées", pr_merged: "fusion de PR" }[trigger];
  return transition(tx, issue, to, { id: null, name: "GitHub" }, "AUTOMATION", { rule: trigger, reason: label, pr: `#${pr.number}`, repo: pr.repo });
}

export async function applyPullRequest(
  repo: { id: string; fullName: string; projects: { project: { id: string } }[] },
  pr: PrPayload,
  opts: { action?: string; review?: { state: string; user: string }; automations: boolean },
) {
  const keys = extractIssueKeys([pr.title, pr.body], [pr.head.ref]);
  const issues = await issuesForKeys(repo.projects.map((p) => p.project.id), keys);
  const existing = await db.gitHubPullRequest.findUnique({ where: { githubId: BigInt(pr.id) }, include: { issueLinks: { select: { issueId: true } } } });
  if (!issues.length && !existing) return; // PR sans rapport avec Pilotage : non enregistrée

  const state = prState(pr);
  let reviewState: ReviewState = existing?.reviewState ?? "NONE";
  if (opts.review) {
    const s = opts.review.state.toLowerCase();
    reviewState = s === "approved" ? "APPROVED" : s === "changes_requested" ? "CHANGES_REQUESTED" : s === "commented" && reviewState === "NONE" ? "COMMENTED" : reviewState;
  } else if (opts.action === "review_requested" || (pr.requested_reviewers.length && reviewState === "NONE")) {
    reviewState = "REVIEW_REQUESTED";
  }
  // Les évènements peuvent arriver dans le désordre : on n'écrase pas un état plus récent.
  const githubUpdatedAt = new Date(pr.updated_at);
  const stale = existing && existing.githubUpdatedAt > githubUpdatedAt && !opts.review;

  await db.$transaction(async (tx) => {
    const data = {
      number: pr.number,
      title: pr.title.slice(0, 500),
      body: (pr.body ?? "").slice(0, 20_000),
      authorLogin: pr.user.login,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      state,
      draft: pr.draft,
      reviewState,
      url: pr.html_url,
      openedAt: new Date(pr.created_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
      githubUpdatedAt,
    } satisfies Partial<Prisma.GitHubPullRequestUncheckedCreateInput>;
    const row = stale
      ? existing
      : await tx.gitHubPullRequest.upsert({ where: { githubId: BigInt(pr.id) }, update: data, create: { ...data, repositoryId: repo.id, githubId: BigInt(pr.id) } });

    const already = new Set(existing?.issueLinks.map((l) => l.issueId));
    for (const issue of issues) {
      if (!already.has(issue.id)) {
        await tx.gitHubIssueLink.createMany({ data: [{ issueId: issue.id, pullRequestId: row.id }], skipDuplicates: true });
        await tx.issueActivity.create({ data: { issueId: issue.id, type: "PR_LINKED", data: { number: pr.number, title: pr.title.slice(0, 200), url: pr.html_url, repo: repo.fullName, author: pr.user.login } } });
      }
    }
    // Tous les tickets liés (y compris ceux liés précédemment) reçoivent les changements d'état
    const linkedIssues = await tx.issue.findMany({
      where: { githubLinks: { some: { pullRequestId: row.id } }, archivedAt: null },
      select: { id: true, key: true, title: true, projectId: true, statusId: true, assigneeId: true, watchers: { select: { userId: true } } },
    });
    const stateChanged = !existing || existing.state !== state;
    const reviewChanged = opts.review && existing?.reviewState !== reviewState;
    for (const issue of linkedIssues) {
      if (existing && (stateChanged || reviewChanged)) {
        await tx.issueActivity.create({ data: { issueId: issue.id, type: "PR_UPDATED", data: { number: pr.number, state, reviewState, url: pr.html_url, repo: repo.fullName } } });
      }
      if (stateChanged || reviewChanged) {
        const what = state === "MERGED" ? "a été fusionnée" : state === "CLOSED" ? "a été fermée" : reviewState === "CHANGES_REQUESTED" ? "nécessite des modifications" : reviewState === "APPROVED" ? "a été approuvée" : "a été ouverte";
        await notify(tx, { recipientIds: [...issue.watchers.map((w) => w.userId), issue.assigneeId], type: "PR_ACTIVITY", actorId: null, issueId: issue.id, projectId: issue.projectId, title: `PR #${pr.number} ${what} (${issue.key})`, body: pr.title.slice(0, 200) });
      }
      if (!opts.automations) continue;
      const info = { number: pr.number, repo: repo.fullName };
      if (state === "OPEN" && !pr.draft && (opts.action === "opened" || opts.action === "ready_for_review" || opts.action === "reopened")) await runAutomation(tx, issue, "pr_opened", info);
      if (opts.review && reviewState === "CHANGES_REQUESTED" && reviewChanged) await runAutomation(tx, issue, "changes_requested", info);
      if (state === "MERGED" && opts.action === "closed") await runAutomation(tx, issue, "pr_merged", info);
    }
  });
}

async function handlePullRequest(payload: unknown) {
  const p = pullRequestEvent.parse(payload);
  const repo = await linkedRepository(p.repository, p.installation?.id);
  if (!repo) return;
  await applyPullRequest(repo, p.pull_request, { action: p.action, automations: true });
}

async function handleReview(payload: unknown) {
  const p = pullRequestReviewEvent.parse(payload);
  if (p.action !== "submitted") return;
  const repo = await linkedRepository(p.repository, p.installation?.id);
  if (!repo) return;
  await applyPullRequest(repo, p.pull_request, { action: "review", review: { state: p.review.state, user: p.review.user.login }, automations: true });
}

/* ──────────────────────────────────── Aiguillage ──────────────────────────────────── */

export async function processWebhookEvent(e: Pick<GitHubWebhookEvent, "event" | "payload" | "deliveryId">) {
  switch (e.event) {
    case "installation":
      return handleInstallation(e.payload);
    case "installation_repositories":
      return handleInstallationRepositories(e.payload);
    case "repository":
      return handleRepository(e.payload);
    case "push":
      return handlePush(e.payload);
    case "pull_request":
      return handlePullRequest(e.payload);
    case "pull_request_review":
      return handleReview(e.payload);
    default:
      logger.debug({ event: e.event }, "évènement non traité");
  }
}
