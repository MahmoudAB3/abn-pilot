import { NextRequest } from "next/server";
import { handlers } from "@/server/auth";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const GET = handlers.GET;

/** Limitation de débit sur les points d'entrée d'authentification. */
export async function POST(req: NextRequest) {
  const rl = rateLimit(`auth:${clientIp(req.headers)}`, 20, 60_000);
  if (!rl.ok) return new Response("Trop de tentatives. Réessayez dans un instant.", { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  return handlers.POST(req);
}
