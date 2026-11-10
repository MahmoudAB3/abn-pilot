import { verify } from "@octokit/webhooks-methods";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { SUPPORTED_EVENTS } from "./payloads";

/** Vérifie la signature HMAC-SHA256 (X-Hub-Signature-256) en temps constant. */
export async function verifySignature(secret: string, rawBody: string, signature: string | null) {
  if (!signature || !signature.startsWith("sha256=")) return false;
  try {
    return await verify(secret, rawBody, signature);
  } catch {
    return false;
  }
}

export type IngestResult = { status: 202 | 200 | 400; body: string };

/**
 * Enregistre l'évènement (idempotence : l'identifiant de livraison est unique) puis rend la main.
 * Le traitement est asynchrone (worker), avec reprises.
 */
export async function ingestWebhook(input: { deliveryId: string | null; event: string | null; rawBody: string }): Promise<IngestResult> {
  const { deliveryId, event } = input;
  if (!deliveryId || !/^[0-9a-f-]{8,64}$/i.test(deliveryId) || !event) return { status: 400, body: "En-têtes GitHub manquants." };
  if (!SUPPORTED_EVENTS.has(event)) return { status: 200, body: "Évènement ignoré." };
  let payload: { action?: string; installation?: { id?: number } };
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: "Corps JSON invalide." };
  }
  if (event === "ping") return { status: 200, body: "pong" };
  const installationId = payload.installation?.id;
  if (!installationId) return { status: 400, body: "Installation manquante." };
  try {
    await db.gitHubWebhookEvent.create({
      data: { deliveryId, event, action: payload.action ?? null, installationId: BigInt(installationId), payload: payload as Prisma.InputJsonValue },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      logger.info({ deliveryId, event }, "webhook en double ignoré");
      return { status: 200, body: "Déjà reçu." };
    }
    throw e;
  }
  return { status: 202, body: "Accepté." };
}
