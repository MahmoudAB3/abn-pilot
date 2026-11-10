import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { projectAccess } from "@/server/authz";
import { projectReport } from "@/modules/reporting/service";
import { listSprints, velocity } from "@/modules/sprints/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HorizontalBars, VelocityChart } from "@/components/pilotage/charts";
import { Kpi } from "@/components/pilotage/kpi";
import { StatusBadge } from "@/components/pilotage/meta";
import { typeLabels } from "@/lib/labels";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Rapports du projet" };

export default async function ProjectReports({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const access = await projectAccess(ctx, { key }).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const [report, vel, sprints] = await Promise.all([projectReport(ctx, access.project.id), velocity(ctx, access.project.id, 10), listSprints(ctx, access.project.id)]);
  const completed = sprints.filter((s) => s.status === "COMPLETED");
  const avg = vel.length ? vel.reduce((s, v) => s + v.completed, 0) / vel.length : 0;
  const predictability = vel.length ? Math.round((vel.reduce((s, v) => s + v.completed, 0) / Math.max(1, vel.reduce((s, v) => s + v.committed, 0))) * 100) : null;
  return (
    <>
      <PageHeader title="Rapports" breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: access.project.name, href: `/projets/${key}` }, { label: "Rapports" }]} description="Indicateurs calculés automatiquement à partir des sprints et de l'historique des statuts." />
      <PageBody className="flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Vélocité moyenne" value={vel.length ? formatNumber(avg, 1) : "—"} unit={vel.length ? "pts" : undefined} hint={`${vel.length} sprint(s) terminé(s)`} />
          <Kpi label="Prévisibilité" value={predictability ?? "—"} unit={predictability != null ? "%" : undefined} hint="Points livrés / engagés" />
          <Kpi label="Sprints terminés" value={completed.length} />
          <Kpi label="Tickets ouverts" value={report.distribution.filter((d) => d.category !== "DONE").reduce((s, d) => s + d.n, 0)} />
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Vélocité</CardTitle><CardDescription>Points engagés et livrés par sprint terminé</CardDescription></div></CardHeader>
            <CardContent>{vel.length ? <VelocityChart data={vel} /> : <p className="text-body-sm text-muted-foreground">Aucun sprint terminé.</p>}</CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Temps de cycle médian</CardTitle><CardDescription>En jours, de la première entrée « en cours » à « terminé », 30 derniers jours</CardDescription></div></CardHeader>
            <CardContent>{report.cycleTime.length ? <HorizontalBars label="Temps de cycle par type" unit=" j" data={report.cycleTime.filter((c) => c.medianDays != null).map((c) => ({ label: typeLabels[c.type as keyof typeof typeLabels], value: c.medianDays!, hint: `${c.n} ticket(s)` }))} /> : <p className="text-body-sm text-muted-foreground">Pas encore assez de tickets terminés sur la période.</p>}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Répartition par statut</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {report.distribution.map((d) => (
                <div key={d.name} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3">
                  <StatusBadge name={d.name} category={d.category} />
                  <span className="h-2.5 rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(2, (d.n / Math.max(1, ...report.distribution.map((x) => x.n))) * 100)}%` }} />
                  <span className="text-right text-body-sm font-semibold tabular-nums">{d.n}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Historique des sprints</CardTitle></CardHeader>
            <table className="w-full text-body-sm">
              <thead className="bg-surface-subtle"><tr className="text-left text-overline-caps text-muted-foreground"><th className="px-4 py-2" scope="col">Sprint</th><th className="px-2 py-2 text-right" scope="col">Engagés</th><th className="px-2 py-2 text-right" scope="col">Livrés</th><th className="px-4 py-2 text-right" scope="col">Tickets</th></tr></thead>
              <tbody className="divide-y">
                {completed.map((s) => <tr key={s.id}><td className="px-4 py-2 font-medium">{s.name}</td><td className="px-2 py-2 text-right tabular-nums">{s.committedPoints ?? "—"}</td><td className="px-2 py-2 text-right tabular-nums">{s.completedPoints ?? "—"}</td><td className="px-4 py-2 text-right tabular-nums">{s.completedIssues ?? "—"}</td></tr>)}
                {!completed.length && <tr><td colSpan={4} className="px-4 py-4 text-center text-muted-foreground">Aucun sprint terminé.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
