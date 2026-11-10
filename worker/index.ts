/**
 * Worker de fond — `npm run worker` (service séparé dans Docker Compose).
 * Traite les webhooks GitHub et les tâches, et planifie les tâches périodiques.
 * L'application web reste utilisable si le worker ou GitHub est indisponible.
 */
import "../server/load-env";
import { db } from "../server/db";
import { logger } from "../server/logger";
import { enqueueJob, processJobBatch, processWebhookBatch, releaseStaleLocks } from "../server/jobs";
import { githubConfigured } from "../server/env";

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const schedules: { type: string; everyMs: number; when?: () => boolean }[] = [
  { type: "sprints.snapshot", everyMs: 60 * 60_000 },
  { type: "github.sync_all", everyMs: 6 * 3600_000, when: githubConfigured },
  { type: "maintenance.prune", everyMs: 24 * 3600_000 },
];

async function scheduler() {
  const last = new Map<string, number>();
  while (!stopping) {
    for (const s of schedules) {
      if (s.when && !s.when()) continue;
      if (Date.now() - (last.get(s.type) ?? 0) >= s.everyMs) {
        await enqueueJob(s.type, {}, `cron:${s.type}`).catch((e) => logger.error({ e: e.message }, "planification"));
        last.set(s.type, Date.now());
      }
    }
    await sleep(60_000);
  }
}

async function loop() {
  let idle = 0;
  while (!stopping) {
    try {
      if (idle % 30 === 0) await releaseStaleLocks();
      const n = (await processWebhookBatch()) + (await processJobBatch());
      idle = n ? 0 : idle + 1;
      await sleep(n ? 50 : 2000);
    } catch (e) {
      logger.error({ message: (e as Error).message }, "boucle du worker");
      await sleep(5000);
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    logger.info({ sig }, "arrêt du worker demandé");
    stopping = true;
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}

logger.info("worker démarré");
Promise.all([loop(), scheduler()])
  .then(() => db.$disconnect())
  .catch((e) => {
    logger.fatal({ message: (e as Error).message }, "worker arrêté");
    process.exit(1);
  });
