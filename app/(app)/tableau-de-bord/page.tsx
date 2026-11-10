import type { Metadata } from "next";
import Link from "next/link";
import { GitPullRequest, Timer } from "lucide-react";
import { requirePageCtx } from "@/server/session";
import { managementView, overview, productOwnerView } from "@/modules/reporting/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IssueList } from "@/components/pilotage/issue-list";
import { Kpi } from "@/components/pilotage/kpi";
import { HealthBadge, ProjectAvatar } from "@/components/pilotage/project-bits";
import { ThroughputChart } from "@/components/pilotage/charts";
import { formatDate, timeAgo } from "@/lib/format";
import { releaseStatusLabels, reviewStateLabels } from "@/lib/labels";
import { plain, toCard } from "@/lib/serialize";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tableau de bord" };

const views = [
  { id: "general", label: "Vue d'ensemble" },
  { id: "po", label: "Product Owner" },
  { id: "direction", label: "Direction" },
] as const;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const ctx = await requirePageCtx();
  const defaultView = ctx.role === "VIEWER" ? "direction" : ctx.role === "PRODUCT_OWNER" ? "po" : "general";
  const vue = ((await searchParams).vue as (typeof views)[number]["id"]) ?? defaultView;
  const firstName = ctx.name.split(" ")[0];
  return (
    <>
      <PageHeader title={`Bonjour ${firstName}`} description="Données en temps réel, calculées à partir de l'activité des projets.">
        <nav aria-label="Vues du tableau de bord" className="flex gap-4 border-b">
          {views.map((v) => (
            <Link key={v.id} href={`/tableau-de-bord?vue=${v.id}`} aria-current={vue === v.id ? "page" : undefined} className={cn("-mb-px h-9 border-b-2 border-transparent text-body font-medium text-muted-foreground hover:text-foreground", vue === v.id && "border-primary text-primary-text")}>
              {v.label}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <PageBody>{vue === "po" ? <PoView ctx={ctx} /> : vue === "direction" ? <DirectionView ctx={ctx} /> : <GeneralView ctx={ctx} />}</PageBody>
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requirePageCtx>>;

async function GeneralView({ ctx }: { ctx: Ctx }) {
  const d = await overview(ctx);
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Projets actifs" value={d.projects.length} />
        <Kpi label="Mes tickets ouverts" value={d.mine.length} />
        <Kpi label="Tickets en retard" value={d.overdue.length} tone={d.overdue.length ? "danger" : undefined} hint="Échéance dépassée, non terminés" />
        <Kpi label="Tickets bloqués" value={d.blocked.length} tone={d.blocked.length ? "warning" : undefined} />
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader><div><CardTitle>Assignés à moi</CardTitle><CardDescription>Triés par priorité</CardDescription></div><Link href="/mes-taches" className="text-body-sm text-primary-text hover:underline">Tout voir</Link></CardHeader>
            <IssueList issues={d.mine.map(toCard)} showProject showAssignee={false} empty="Rien ne vous est assigné." />
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden"><CardHeader><CardTitle>En retard</CardTitle></CardHeader><IssueList issues={d.overdue.map(toCard)} showProject empty="Aucun ticket en retard." /></Card>
            <Card className="overflow-hidden"><CardHeader><CardTitle>Bloqués</CardTitle></CardHeader><IssueList issues={d.blocked.map(toCard)} showProject empty="Aucun blocage signalé." /></Card>
          </div>
          <Card className="overflow-hidden"><CardHeader><CardTitle>Mis à jour récemment</CardTitle></CardHeader><IssueList issues={d.recent.map(toCard)} showProject /></Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Sprints actifs</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-4">
              {d.sprints.map((s) => (
                <Link key={s.id} href={`/projets/${s.project.key}/sprint`} className="group flex flex-col gap-1.5 rounded-md">
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-body font-medium group-hover:underline"><Timer className="size-4 text-muted-foreground" aria-hidden />{s.project.key} · {s.name}</span><span className="text-caption font-semibold tabular-nums">{s.completion} %</span></div>
                  <Progress value={s.completion} label={`Progression de ${s.name}`} />
                  <p className="text-caption text-muted-foreground tabular-nums">{s.completedPoints} / {s.totalPoints} points · {s.completedIssues} / {s.totalIssues} tickets · fin le {formatDate(s.endDate)}</p>
                </Link>
              ))}
              {!d.sprints.length && <p className="text-body-sm text-muted-foreground">Aucun sprint en cours.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Pull requests en attente de revue</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {d.prsAwaiting.map((pr) => (
                <a key={pr.id} href={pr.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 rounded-md border px-3 py-2 hover:bg-surface-hover/60">
                  <span className="flex items-center gap-2 text-body-sm font-medium"><GitPullRequest className="size-4 shrink-0 text-success" aria-hidden /><span className="truncate">{pr.title}</span></span>
                  <span className="text-caption text-muted-foreground">{pr.repository.fullName} #{pr.number} · {pr.authorLogin} · {reviewStateLabels[pr.reviewState]} · ouverte {timeAgo(pr.openedAt)}</span>
                </a>
              ))}
              {!d.prsAwaiting.length && <p className="text-body-sm text-muted-foreground">Aucune PR en attente.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Projets</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {d.projects.map((p) => (
                <Link key={p.id} href={`/projets/${p.key}`} className="flex items-center gap-2.5 hover:underline">
                  <ProjectAvatar projectKey={p.key} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{p.name}</span>
                  <span className="text-caption tabular-nums text-muted-foreground">{p.stats.progress} %</span>
                  <HealthBadge health={p.health} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function PoView({ ctx }: { ctx: Ctx }) {
  const [o, po] = await Promise.all([overview(ctx), productOwnerView(ctx)]);
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Non assignés (planifiés)" value={po.unassigned.length} tone={po.unassigned.length ? "warning" : undefined} />
        <Kpi label="Bloqués" value={o.blocked.length} tone={o.blocked.length ? "danger" : undefined} />
        <Kpi label="En retard" value={o.overdue.length} tone={o.overdue.length ? "danger" : undefined} />
        <Kpi label="Versions à venir" value={po.releases.length} />
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Progression par projet</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            {o.projects.map((p) => (
              <div key={p.id} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2.5"><ProjectAvatar projectKey={p.key} size="sm" /><Link href={`/projets/${p.key}`} className="min-w-0 flex-1 truncate text-body font-medium hover:underline">{p.name}</Link><HealthBadge health={p.health} /><span className="w-12 text-right text-body-sm font-semibold tabular-nums">{p.stats.progress} %</span></div>
                <Progress value={p.stats.progress} size="sm" label={`Avancement de ${p.name}`} />
                <p className="text-caption text-muted-foreground">{p.stats.open} ouverts · {p.stats.blocked} bloqués · {p.stats.overdue} en retard{p.targetDate ? ` · cible ${formatDate(p.targetDate)}` : ""}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Sprints</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {o.sprints.map((s) => (
                <div key={s.id} className="flex flex-col gap-1"><span className="text-body-sm font-medium">{s.project.key} · {s.name}</span><Progress value={s.completion} size="sm" label={s.name} /><span className="text-caption text-muted-foreground tabular-nums">{s.completedPoints}/{s.totalPoints} pts · fin {formatDate(s.endDate)}</span></div>
              ))}
              {!o.sprints.length && <p className="text-body-sm text-muted-foreground">Aucun sprint actif.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Jalons de livraison</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {po.milestones.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 text-body-sm"><Link href={`/projets/${m.project.key}/feuille-de-route`} className="truncate hover:underline">{m.project.key} · {m.name}</Link><span className="shrink-0 text-caption text-muted-foreground">{formatDate(m.targetDate)}</span></li>)}
                {!po.milestones.length && <li className="text-body-sm text-muted-foreground">Aucun jalon à venir.</li>}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Versions à venir</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {po.releases.map((r) => (
                <Link key={r.id} href={`/projets/${r.project.key}/versions/${r.id}`} className="flex flex-col gap-1 hover:underline">
                  <span className="flex justify-between text-body-sm font-medium"><span>{r.project.key} · {r.name} ({r.version})</span><span className="text-caption text-muted-foreground">{releaseStatusLabels[r.status]}</span></span>
                  <Progress value={r.total ? (r.done / r.total) * 100 : 0} size="sm" tone="termine" label={r.name} />
                  <span className="text-caption text-muted-foreground">{r.done}/{r.total} tickets · prévue {formatDate(r.plannedDate)}</span>
                </Link>
              ))}
              {!po.releases.length && <p className="text-body-sm text-muted-foreground">Aucune version planifiée.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden"><CardHeader><CardTitle>Non assignés</CardTitle></CardHeader><IssueList issues={po.unassigned.map(toCard)} showProject showAssignee={false} empty="Tout est assigné." /></Card>
        <Card className="overflow-hidden"><CardHeader><CardTitle>Bloqués</CardTitle></CardHeader><IssueList issues={o.blocked.map(toCard)} showProject empty="Aucun blocage." /></Card>
        <Card className="overflow-hidden"><CardHeader><CardTitle>En retard</CardTitle></CardHeader><IssueList issues={o.overdue.map(toCard)} showProject empty="Aucun retard." /></Card>
      </div>
    </div>
  );
}

async function DirectionView({ ctx }: { ctx: Ctx }) {
  const [o, m] = await Promise.all([overview(ctx), managementView(ctx)]);
  const done = o.projects.reduce((s, p) => s + p.stats.done, 0);
  const total = o.projects.reduce((s, p) => s + p.stats.total, 0);
  const delivered4w = m.throughput.slice(-4).reduce((s, w) => s + w.issues, 0);
  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Avancement global" value={total ? Math.round((done / total) * 100) : 0} unit="%" hint={`${done} / ${total} tickets terminés`} />
        <Kpi label="Livrés (4 semaines)" value={delivered4w} unit="tickets" />
        <Kpi label="Blocages ouverts" value={o.blocked.length} tone={o.blocked.length ? "danger" : undefined} />
        <Kpi label="Projets à risque ou en retard" value={o.projects.filter((p) => p.health !== "en-bonne-voie").length} tone={o.projects.some((p) => p.health === "en-retard") ? "danger" : undefined} />
      </section>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><div><CardTitle>Travail livré par semaine</CardTitle><CardDescription>Tickets terminés (hors épopées), 12 dernières semaines</CardDescription></div></CardHeader>
          <CardContent>{m.throughput.length ? <ThroughputChart data={m.throughput} /> : <p className="text-body-sm text-muted-foreground">Aucun ticket terminé sur la période.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Échéances (45 jours)</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {m.deadlines.map((d) => <li key={`${d.kind}-${d.id}`} className="flex items-center justify-between gap-2 text-body-sm"><span className="min-w-0 truncate"><span className="text-caption text-muted-foreground">{d.kind} · {d.projectKey}</span> {d.name}</span><span className="shrink-0 text-caption font-medium">{formatDate(d.date)}</span></li>)}
              {!m.deadlines.length && <li className="text-body-sm text-muted-foreground">Aucune échéance proche.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Santé des projets</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {o.projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5"><ProjectAvatar projectKey={p.key} size="sm" /><span className="min-w-0 flex-1 truncate text-body-sm font-medium">{p.name}</span><span className="text-caption text-muted-foreground tabular-nums">{p.stats.progress} %</span><HealthBadge health={p.health} /></div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Initiatives en cours</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            {m.initiatives.map((i) => (
              <div key={i.id} className="flex flex-col gap-1"><span className="flex justify-between text-body-sm"><span className="truncate font-medium">{i.key} · {i.title}</span><span className="tabular-nums">{Math.round((i.done / i.total) * 100)} %</span></span><Progress value={(i.done / i.total) * 100} size="sm" tone="termine" label={i.title} /></div>
            ))}
            {!m.initiatives.length && <p className="text-body-sm text-muted-foreground">Aucune épopée en cours.</p>}
          </CardContent>
        </Card>
      </div>
      <Card className="overflow-hidden"><CardHeader><CardTitle>Blocages ouverts</CardTitle></CardHeader><IssueList issues={o.blocked.map(toCard)} showProject empty="Aucun blocage." /></Card>
      {void plain}
    </div>
  );
}
