import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";
import { processWebhookEvent, SkipEvent } from "@/modules/github/processor";
import { syncRepository } from "@/modules/github/sync";
import { snapshotActiveSprints } from "@/modules/sprints/service";

/**
 * File de traitement en PostgreSQL (pas de Redis) :
 * SELECT … FOR UPDATE SKIP LOCKED permet plusieurs workers sans double traitement.
 * Reprise avec délai exponentiel (30 s, 2 min, 8 min… jusqu'à 8 tentatives).
 */
const MAX_ATTEMPTS = 8;
const backoffMs = (attempt: number) => Math.min(30_000 * 4 ** (attempt - 1), 6 * 3600_000);

export async function enqueueJob(type: string, payload: Prisma.InputJsonValue = {}, dedupeKey?: string) {
  if (dedupeKey) {
    const existing = await db.job.findUnique({ where: { dedupeKey } });
    if (existing && (existing.status === "PENDING" || existing.status === "RUNNING")) return existing;
    if (existing) await db.job.update({ where: { id: existing.id }, data: { dedupeKey: null } });
  }
  return db.job.create({ data: { type, payload, dedupeKey: dedupeKey ?? null } });
}

/** Libère les verrous des traitements interrompus (worker arrêté brutalement). */
export async function releaseStaleLocks() {
  const cutoff = new Date(Date.now() - 10 * 60_000);
  await db.gitHubWebhookEvent.updateMany({ where: { status: "RUNNING", lockedAt: { lt: cutoff } }, data: { status: "PENDING", lockedAt: null } });
  await db.job.updateMany({ where: { status: "RUNNING", lockedAt: { lt: cutoff } }, data: { status: "PENDING", lockedAt: null } });
}

export async function processWebhookBatch(limit = 10) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "GitHubWebhookEvent" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "GitHubWebhookEvent" WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "receivedAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  for (const { id } of rows) {
    const e = await db.gitHubWebhookEvent.findUniqueOrThrow({ where: { id } });
    try {
      await processWebhookEvent(e);
      await db.gitHubWebhookEvent.update({ where: { id }, data: { status: "DONE", processedAt: new Date(), lockedAt: null, lastError: null } });
    } catch (err) {
      const message = (err as Error).message?.slice(0, 1000) ?? "erreur";
      if (err instanceof SkipEvent || (err as { name?: string }).name === "ZodError") {
        logger.warn({ deliveryId: e.deliveryId, event: e.event, message }, "webhook ignoré");
        await db.gitHubWebhookEvent.update({ where: { id }, data: { status: "IGNORED", processedAt: new Date(), lockedAt: null, lastError: message } });
        continue;
      }
      const failed = e.attempts >= MAX_ATTEMPTS;
      logger.error({ deliveryId: e.deliveryId, event: e.event, attempt: e.attempts, message }, failed ? "webhook en échec définitif" : "webhook en échec, nouvelle tentative prévue");
      await db.gitHubWebhookEvent.update({
        where: { id },
        data: { status: failed ? "FAILED" : "PENDING", lockedAt: null, lastError: message, nextAttemptAt: new Date(Date.now() + backoffMs(e.attempts)) },
      });
    }
  }
  return rows.length;
}

const handlers: Record<string, (payload: Prisma.JsonValue) => Promise<unknown>> = {
  "github.sync_repository": (p) => syncRepository((p as { repositoryId: string }).repositoryId),
  "github.sync_all": async () => {
    const repos = await db.gitHubRepository.findMany({ where: { removedAt: null, projects: { some: {} }, installation: { revokedAt: null, suspendedAt: null } }, select: { id: true } });
    for (const r of repos) await enqueueJob("github.sync_repository", { repositoryId: r.id }, `sync:${r.id}`);
  },
  "sprints.snapshot": () => snapshotActiveSprints(),
  "maintenance.prune": async () => {
    // Les payloads ne sont gardés que 14 jours (aucune donnée GitHub inutile conservée)
    const old = new Date(Date.now() - 14 * 86_400_000);
    await db.gitHubWebhookEvent.deleteMany({ where: { status: { in: ["DONE", "IGNORED"] }, processedAt: { lt: old } } });
    await db.job.deleteMany({ where: { status: { in: ["DONE", "IGNORED"] }, createdAt: { lt: old } } });
    await db.session.deleteMany({ where: { expires: { lt: new Date() } } });
  },
};

export async function processJobBatch(limit = 5) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (SELECT id FROM "Job" WHERE status = 'PENDING' AND "runAt" <= now() ORDER BY "runAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id`;
  for (const { id } of rows) {
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`Type de tâche inconnu : ${job.type}`);
      await handler(job.payload);
      await db.job.update({ where: { id }, data: { status: "DONE", lockedAt: null, lastError: null, dedupeKey: null } });
    } catch (err) {
      const message = (err as Error).message?.slice(0, 1000) ?? "erreur";
      // Limite de débit GitHub : respecter le délai annoncé
      const retryAfter = Number((err as { response?: { headers?: Record<string, string> } }).response?.headers?.["retry-after"] ?? 0) * 1000;
      const failed = job.attempts >= MAX_ATTEMPTS || !handler;
      logger.error({ job: job.type, attempt: job.attempts, message }, "tâche en échec");
      await db.job.update({
        where: { id },
        data: { status: failed ? "FAILED" : "PENDING", lockedAt: null, lastError: message, runAt: new Date(Date.now() + Math.max(retryAfter, backoffMs(job.attempts))), ...(failed ? { dedupeKey: null } : {}) },
      });
    }
  }
  return rows.length;
}
