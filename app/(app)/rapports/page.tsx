import type { Metadata } from "next";
import Link from "next/link";
import { requirePageCtx } from "@/server/session";
import { managementView, overview } from "@/modules/reporting/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ThroughputChart } from "@/components/pilotage/charts";
import { HealthBadge, ProjectAvatar } from "@/components/pilotage/project-bits";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Rapports" };

export default async function Reports() {
  const ctx = await requirePageCtx();
  const [o, m] = await Promise.all([overview(ctx), managementView(ctx)]);
  return (
    <>
      <PageHeader title="Rapports" description="Vue consolidée de la livraison ; détails par projet (vélocité, temps de cycle) via chaque projet." />
      <PageBody className="flex flex-col gap-4">
        <Card>
          <CardHeader><div><CardTitle>Tickets terminés par semaine</CardTitle><CardDescription>Tous projets visibles, 12 dernières semaines</CardDescription></div></CardHeader>
          <CardContent>{m.throughput.length ? <ThroughputChart data={m.throughput} /> : <p className="text-body-sm text-muted-foreground">Aucun ticket terminé sur la période.</p>}</CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Projets</CardTitle></CardHeader>
          <table className="w-full text-body-sm">
            <thead className="bg-surface-subtle"><tr className="text-left text-overline-caps text-muted-foreground"><th className="px-4 py-2" scope="col">Projet</th><th className="px-2 py-2" scope="col">Avancement</th><th className="hidden px-2 py-2 text-right md:table-cell" scope="col">Ouverts</th><th className="hidden px-2 py-2 text-right md:table-cell" scope="col">Bloqués</th><th className="hidden px-2 py-2 text-right md:table-cell" scope="col">En retard</th><th className="hidden px-2 py-2 lg:table-cell" scope="col">Cible</th><th className="px-4 py-2" scope="col">Santé</th></tr></thead>
            <tbody className="divide-y">
              {o.projects.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2"><Link href={`/projets/${p.key}/rapports`} className="flex items-center gap-2 font-medium hover:underline"><ProjectAvatar projectKey={p.key} size="sm" />{p.name}</Link></td>
                  <td className="px-2 py-2"><div className="flex items-center gap-2"><Progress value={p.stats.progress} size="sm" label={`Avancement ${p.name}`} className="w-32" /><span className="tabular-nums">{p.stats.progress} %</span></div></td>
                  <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">{p.stats.open}</td>
                  <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">{p.stats.blocked}</td>
                  <td className="hidden px-2 py-2 text-right tabular-nums md:table-cell">{p.stats.overdue}</td>
                  <td className="hidden px-2 py-2 lg:table-cell">{formatDate(p.targetDate)}</td>
                  <td className="px-4 py-2"><HealthBadge health={p.health} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-caption text-muted-foreground">Santé calculée automatiquement : « en retard » si la date cible est dépassée ou si plus de 20 % des tickets ouverts sont en retard ; « à risque » en cas de blocage ou de retard ponctuel.</p>
        </Card>
      </PageBody>
    </>
  );
}
