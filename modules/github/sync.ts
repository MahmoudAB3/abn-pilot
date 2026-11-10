import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { installationOctokit } from "./app";
import { applyCommits, applyPullRequest, upsertRepository } from "./processor";
import { pullRequest as prSchema } from "./payloads";

/**
 * Réconciliation après évènements manqués (panne, webhook désactivé…) :
 * relit les PR et commits récents via l'API (pagination, limites de débit gérées par octokit).
 * Les liens et états sont mis à jour ; les automatisations de statut ne sont PAS rejouées,
 * pour ne jamais déplacer un ticket sur la base d'un évènement ancien.
 */
export async function syncRepository(repositoryId: string, opts: { sinceDays?: number } = {}) {
  const repo = await db.gitHubRepository.findUnique({
    where: { id: repositoryId },
    include: { installation: true, syncState: true, projects: { include: { project: { select: { id: true } } } } },
  });
  if (!repo || repo.removedAt || repo.installation.revokedAt || repo.installation.suspendedAt) return { skipped: true };
  await db.gitHubSyncState.upsert({ where: { repositoryId }, update: { lastRunAt: new Date() }, create: { repositoryId, lastRunAt: new Date() } });
  if (!repo.projects.length) return { skipped: true };

  const since = repo.syncState?.lastSuccessAt
    ? new Date(repo.syncState.lastSuccessAt.getTime() - 3600_000) // recouvrement d'une heure
    : new Date(Date.now() - (opts.sinceDays ?? 30) * 86_400_000);
  const octokit = await installationOctokit(repo.installation.installationId);
  const [owner, name] = [repo.owner, repo.name];

  try {
    let prs = 0;
    // PR triées par mise à jour décroissante : on s'arrête dès qu'on dépasse la fenêtre.
    for await (const { data } of octokit.paginate.iterator(octokit.rest.pulls.list, { owner, repo: name, state: "all", sort: "updated", direction: "desc", per_page: 50 })) {
      let reachedEnd = false;
      for (const raw of data) {
        if (new Date(raw.updated_at) < since) {
          reachedEnd = true;
          break;
        }
        const pr = prSchema.parse({ ...raw, merged: Boolean(raw.merged_at) });
        await applyPullRequest(repo, pr, { automations: false });
        prs++;
      }
      if (reachedEnd) break;
    }
    let commits = 0;
    for await (const { data } of octokit.paginate.iterator(octokit.rest.repos.listCommits, { owner, repo: name, since: since.toISOString(), per_page: 100 })) {
      commits += await applyCommits(
        repo,
        data.map((c) => ({ sha: c.sha, message: c.commit.message, url: c.html_url, timestamp: c.commit.author?.date ?? c.commit.committer?.date ?? new Date().toISOString(), authorName: c.commit.author?.name ?? c.author?.login ?? "inconnu", authorLogin: c.author?.login ?? null })),
      );
    }
    await db.gitHubSyncState.update({ where: { repositoryId }, data: { lastSuccessAt: new Date(), lastError: null } });
    logger.info({ repo: repo.fullName, prs, commits }, "synchronisation GitHub terminée");
    return { prs, commits };
  } catch (e) {
    const message = (e as Error).message?.slice(0, 500) ?? "erreur";
    await db.gitHubSyncState.update({ where: { repositoryId }, data: { lastError: message } });
    throw e;
  }
}

/** Rafraîchit la liste des dépôts accessibles par une installation. */
export async function refreshInstallationRepositories(installationRowId: string) {
  const inst = await db.gitHubInstallation.findUniqueOrThrow({ where: { id: installationRowId } });
  const octokit = await installationOctokit(inst.installationId);
  const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, { per_page: 100 });
  const seen = new Set<bigint>();
  for (const r of repos) {
    await upsertRepository(db, inst.id, r);
    seen.add(BigInt(r.id));
  }
  const gone = await db.gitHubRepository.findMany({ where: { installationId: inst.id, removedAt: null }, select: { id: true, githubId: true } });
  const removed = gone.filter((g) => !seen.has(g.githubId)).map((g) => g.id);
  if (removed.length) {
    await db.$transaction([
      db.gitHubRepository.updateMany({ where: { id: { in: removed } }, data: { removedAt: new Date() } }),
      db.projectRepository.deleteMany({ where: { repositoryId: { in: removed } } }),
    ]);
  }
  return repos.length;
}
