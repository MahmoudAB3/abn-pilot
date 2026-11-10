import { NextRequest, NextResponse } from "next/server";
import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { ingestWebhook, verifySignature } from "@/modules/github/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Point d'entrée des webhooks de la GitHub App.
 * 1. Signature HMAC-SHA256 vérifiée sur le corps brut (secret du webhook).
 * 2. Évènement stocké (idempotent par X-GitHub-Delivery), traitement différé par le worker.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(`webhook:${clientIp(req.headers)}`, 600, 60_000).ok) return new NextResponse("Trop de requêtes", { status: 429 });
  const secret = env().GITHUB_WEBHOOK_SECRET;
  if (!secret) return new NextResponse("Intégration GitHub non configurée", { status: 503 });
  const raw = await req.text();
  if (raw.length > 5 * 1024 * 1024) return new NextResponse("Charge trop volumineuse", { status: 413 });
  if (!(await verifySignature(secret, raw, req.headers.get("x-hub-signature-256")))) {
    logger.warn({ ip: clientIp(req.headers), delivery: req.headers.get("x-github-delivery") }, "signature de webhook invalide");
    return new NextResponse("Signature invalide", { status: 401 });
  }
  try {
    const r = await ingestWebhook({ deliveryId: req.headers.get("x-github-delivery"), event: req.headers.get("x-github-event"), rawBody: raw });
    return new NextResponse(r.body, { status: r.status });
  } catch (e) {
    logger.error({ message: (e as Error).message }, "enregistrement du webhook impossible");
    // 500 → GitHub permet de relivrer l'évènement
    return new NextResponse("Erreur interne", { status: 500 });
  }
}
