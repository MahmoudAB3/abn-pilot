import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { getUserCtx } from "@/server/session";
import { devLoginEnabled, env } from "@/server/env";
import { signInErrorMessages } from "@/server/auth/policy";
import { signInWithGoogle } from "@/app/actions/auth";
import { db } from "@/server/db";
import { PilotageMark } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roleLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string; error?: string; retour?: string }> }) {
  if (await getUserCtx()) redirect("/tableau-de-bord");
  const sp = await searchParams;
  const code = sp.erreur ?? sp.error;
  const message = code ? signInErrorMessages[code] ?? signInErrorMessages.default : null;
  const googleReady = Boolean(env().AUTH_GOOGLE_ID && env().AUTH_GOOGLE_SECRET);
  const dev = devLoginEnabled();
  const devUsers = dev
    ? await db.organizationMembership.findMany({ where: { status: "ACTIVE" }, include: { user: { select: { email: true, name: true } } }, orderBy: { role: "asc" }, take: 12 })
    : [];

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(28rem,36rem)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-rail p-10 text-rail-foreground lg:flex">
        <div className="flex items-center gap-3">
          <PilotageMark className="size-10" />
          <span className="flex flex-col leading-none">
            <span className="text-[0.6875rem] font-semibold tracking-[0.14em] text-rail-muted uppercase">ABNSoft</span>
            <span className="text-h2 font-bold">Pilotage</span>
          </span>
        </div>
        <div className="max-w-md">
          <p className="text-display font-semibold">Pilotez vos projets, de l&apos;idée à la livraison.</p>
          <ul className="mt-6 flex flex-col gap-2 text-body text-rail-muted">
            <li>Backlog, sprints et tableau Kanban partagés par toute l&apos;équipe.</li>
            <li>Commits et pull requests GitHub reliés automatiquement aux tickets.</li>
            <li>Une vision fiable de l&apos;avancement pour le Product Owner et la direction.</li>
          </ul>
        </div>
        <p className="text-caption text-rail-muted">© ABN Software Synergie — application interne</p>
      </section>

      <section className="flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="rounded-lg bg-rail p-1 text-rail-foreground"><PilotageMark className="size-8" /></span>
            <span className="text-h2 font-bold">ABNSoft Pilotage</span>
          </div>
          <h1 className="text-h1 font-semibold">Connexion</h1>
          <p className="mt-1 text-body text-muted-foreground">Utilisez votre compte Google Workspace professionnel.</p>

          {message && (
            <div role="alert" className="mt-5 flex gap-2.5 rounded-md border border-destructive/30 bg-destructive-subtle p-3 text-body-sm text-destructive-subtle-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{message}</p>
            </div>
          )}

          <form action={signInWithGoogle} className="mt-6">
            <input type="hidden" name="retour" value={sp.retour ?? "/tableau-de-bord"} />
            <Button type="submit" variant="outline" size="lg" className="w-full" disabled={!googleReady}>
              <GoogleIcon />
              Continuer avec Google
            </Button>
          </form>
          {!googleReady && <p className="mt-2 text-caption text-muted-foreground">La connexion Google n&apos;est pas encore configurée (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).</p>}

          <p className="mt-6 flex items-start gap-2 text-caption text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            L&apos;accès est réservé aux personnes invitées par un administrateur. Une première connexion sans invitation crée une demande d&apos;accès.
          </p>

          {dev && (
            <details className="mt-8 rounded-md border border-dashed p-3" open={!googleReady}>
              <summary className="cursor-pointer text-body-sm font-semibold text-warning-subtle-foreground">Connexion de développement</summary>
              <p className="mt-2 text-caption text-muted-foreground">Active uniquement hors production (AUTH_DEV_LOGIN=true).</p>
              <form action="/api/dev/login" method="post" className="mt-3 flex flex-col gap-2">
                <label htmlFor="dev-email" className="text-body-sm font-medium text-fg-secondary">Compte de démonstration</label>
                <select id="dev-email" name="email" className="h-8 rounded-md border border-input bg-card px-2 text-body">
                  {devUsers.map((m) => (
                    <option key={m.user.email} value={m.user.email}>{m.user.name ?? m.user.email} — {roleLabels[m.role]}</option>
                  ))}
                </select>
                {!devUsers.length && <Input name="email" type="email" placeholder="email@abnsoft.ma" aria-label="E-mail" />}
                <Button type="submit" variant="secondary">Se connecter</Button>
              </form>
            </details>
          )}
        </div>
      </section>
    </main>
  );
}
