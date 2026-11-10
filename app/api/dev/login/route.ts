import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { devLoginEnabled, env } from "@/server/env";
import { getOrganization } from "@/server/org";
import { clientIp, rateLimit } from "@/server/rate-limit";

/**
 * Connexion de développement (démo locale et tests de bout en bout) — jamais en production :
 * exige NODE_ENV ≠ production ET AUTH_DEV_LOGIN=true. Crée une vraie session en base,
 * soumise aux mêmes contrôles (appartenance ACTIVE) que les sessions Google.
 */
export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse("Introuvable", { status: 404 });
  if (!rateLimit(`dev-login:${clientIp(req.headers)}`, 30, 60_000).ok) return new NextResponse("Trop de tentatives", { status: 429 });
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) return new NextResponse("Origine refusée", { status: 403 });
  const form = await req.formData();
  const email = String(form.get("email") ?? "").toLowerCase().trim();
  const org = await getOrganization();
  const user = await db.user.findFirst({ where: { email, memberships: { some: { orgId: org.id, status: "ACTIVE" } } } });
  if (!user) return NextResponse.redirect(new URL("/connexion?erreur=en-attente", req.url), 303);
  const sessionToken = randomBytes(32).toString("hex");
  const maxAge = env().SESSION_MAX_AGE_HOURS * 3600;
  await db.session.create({ data: { sessionToken, userId: user.id, expires: new Date(Date.now() + maxAge * 1000) } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const secure = req.nextUrl.protocol === "https:";
  const res = NextResponse.redirect(new URL("/tableau-de-bord", req.url), 303);
  res.cookies.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", sessionToken, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge });
  return res;
}
