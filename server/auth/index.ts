import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "../db";
import { allowedDomains, env, isSuperAdminEmail } from "../env";
import { logger } from "../logger";
import { getOrganization } from "../org";
import { evaluateSignIn, type GoogleClaims } from "./policy";
import { audit } from "../audit";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  const domains = allowedDomains();
  // Derrière un proxy (Render, Docker), l'URL de requête vue par Next.js est l'adresse d'écoute interne
  // (ex. https://0.0.0.0:10000) : l'URI de redirection OAuth doit être construite sur l'URL publique.
  if (!process.env.AUTH_URL && process.env.APP_URL) process.env.AUTH_URL = process.env.APP_URL;
  return {
    adapter: PrismaAdapter(db),
    secret: e.AUTH_SECRET,
    trustHost: true,
    // Sessions stockées en base : expiration glissante, révocation immédiate par suppression.
    session: { strategy: "database", maxAge: e.SESSION_MAX_AGE_HOURS * 3600, updateAge: 3600 },
    pages: { signIn: "/connexion", error: "/connexion" },
    providers:
      e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET
        ? [
            Google({
              clientId: e.AUTH_GOOGLE_ID,
              clientSecret: e.AUTH_GOOGLE_SECRET,
              // Les comptes invités sont créés avant leur première connexion : on lie le compte Google
              // à l'utilisateur existant de même e-mail. Sûr ici car l'e-mail est vérifié et le domaine contrôlé.
              allowDangerousEmailAccountLinking: true,
              authorization: {
                params: {
                  prompt: "select_account",
                  // Indice d'interface uniquement : la vérification réelle porte sur le claim `hd`.
                  hd: domains.length === 1 ? domains[0] : "*",
                },
              },
            }),
          ]
        : [],
    callbacks: {
      async signIn({ account, profile }) {
        const claims = profile as GoogleClaims | undefined;
        const email = claims?.email?.toLowerCase();
        const org = await getOrganization();
        const user = email ? await db.user.findUnique({ where: { email }, select: { id: true } }) : null;
        const membership = user
          ? await db.organizationMembership.findUnique({ where: { orgId_userId: { orgId: org.id, userId: user.id } }, select: { status: true, id: true } })
          : null;
        const decision = evaluateSignIn({ provider: account?.provider ?? "", claims, allowedDomains: domains, membership, superAdmin: isSuperAdminEmail(email) });

        if (!decision.allow) {
          logger.warn({ email, reason: decision.reason }, "connexion refusée");
          if (decision.reason === "en-attente" && email && claims?.hd) {
            await db.accessRequest.upsert({
              where: { email },
              update: { requestedAt: new Date(), name: (profile?.name as string) ?? null },
              create: { email, name: (profile?.name as string) ?? null, image: (profile?.picture as string) ?? null, hostedDomain: claims.hd },
            });
          }
          return `/connexion?erreur=${decision.reason}`;
        }
        if (decision.ensureAdmin && email) {
          // Super-admin : compte créé si besoin (l'adaptateur y liera le compte Google), appartenance ADMIN active.
          const u = await db.user.upsert({
            where: { email },
            update: {},
            create: { email, name: (profile?.name as string) ?? null, image: (profile?.picture as string) ?? null },
          });
          await db.organizationMembership.upsert({
            where: { orgId_userId: { orgId: org.id, userId: u.id } },
            update: { role: "ADMIN", status: "ACTIVE", deactivatedAt: null, ...(decision.activate ? { activatedAt: new Date() } : {}) },
            create: { orgId: org.id, userId: u.id, role: "ADMIN", status: "ACTIVE", activatedAt: new Date() },
          });
          await db.accessRequest.updateMany({ where: { email, status: "PENDING" }, data: { status: "APPROVED", reviewedAt: new Date() } });
          return true;
        }
        if (decision.activate && membership) {
          await db.organizationMembership.update({ where: { id: membership.id }, data: { status: "ACTIVE", activatedAt: new Date() } });
        }
        return true;
      },
      async session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    events: {
      async signIn({ user }) {
        if (!user.id) return;
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        const org = await getOrganization();
        await audit({ orgId: org.id, actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id });
      },
    },
    logger: {
      error: (err) => logger.error({ err: { name: err.name, message: err.message } }, "auth.js"),
      warn: (code) => logger.warn({ code }, "auth.js"),
    },
  };
});
