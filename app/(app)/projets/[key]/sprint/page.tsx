import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, Target, Timer } from "lucide-react";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { projectAccess } from "@/server/authz";
import { db } from "@/server/db";
import { listSprints, sprintReport, velocity } from "@/modules/sprints/service";
import { cardInclude } from "@/modules/issues/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { BurndownChart, VelocityChart } from "@/components/pilotage/charts";
import { IssueList } from "@/components/pilotage/issue-list";
import { Kpi } from "@/components/pilotage/kpi";
import { StatusBadge } from "@/components/pilotage/meta";
import { CompleteSprintButton } from "@/components/pilotage/sprint-dialogs";
import { formatDate } from "@/lib/format";
import { sprintStatusLabels } from "@/lib/labels";
import { toCard } from "@/lib/serialize";

export const metadata: Metadata = { title: "Sprint actif" };

export default async function SprintPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ id?: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const access = await projectAccess(ctx, { key }).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const projectId = access.project.id;
  const sprints = await listSprints(ctx, projectId);
  const wanted = (await searchParams).id;
  const sprint = sprints.find((s) => s.id === wanted) ?? sprints.find((s) => s.status === "ACTIVE");
  const vel = await velocity(ctx, projectId);
  const crumbs = [{ label: "Projets", href: "/projets" }, { label: access.project.name, href: `/projets/${key}` }, { label: "Sprints" }];

  const others = (
    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Tous les sprints</CardTitle></CardHeader>
      <ul className="divide-y">
        {sprints.map((s) => (
          <li key={s.id}>
            <Link href={`/projets/${key}/sprint?id=${s.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover/60" aria-current={s.id === sprint?.id ? "page" : undefined}>
              <Timer className="size-4 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-body font-medium">{s.name}</span>
              <span className="hidden text-caption text-muted-foreground sm:inline">{formatDate(s.startDate, { day: "numeric", month: "short" })} – {formatDate(s.endDate, { day: "numeric", month: "short" })}</span>
              {s.status === "COMPLETED" && <span className="text-caption text-muted-foreground tabular-nums">{s.completedPoints}/{s.committedPoints} pts</span>}
              <StatusBadge name={sprintStatusLabels[s.status]} category={s.status === "ACTIVE" ? "IN_PROGRESS" : s.status === "COMPLETED" ? "DONE" : "TODO"} />
            </Link>
          </li>
        ))}
        {!sprints.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Aucun sprint. Créez-en un depuis le backlog.</li>}
      </ul>
    </Card>
  );

  if (!sprint) {
    return (
      <>
        <PageHeader title="Sprint actif" breadcrumbs={crumbs} />
        <PageBody className="flex flex-col gap-4">
          <EmptyState icon={<Timer />} title="Aucun sprint actif" description="Planifiez des tickets dans un sprint depuis le backlog, puis démarrez-le." action={<Button variant="primary" size="sm" asChild><Link href={`/projets/${key}/backlog`}>Ouvrir le backlog</Link></Button>} />
          <div className="grid gap-4 lg:grid-cols-2">
            {others}
            <Card><CardHeader><div><CardTitle>Vélocité</CardTitle><CardDescription>Sprints terminés</CardDescription></div></CardHeader><CardContent>{vel.length ? <VelocityChart data={vel} /> : <p className="text-body-sm text-muted-foreground">Aucun sprint terminé.</p>}</CardContent></Card>
          </div>
        </PageBody>
      </>
    );
  }

  const report = await sprintReport(ctx, sprint.id);
  const issues = await db.issue.findMany({ where: { sprintId: sprint.id, archivedAt: null, type: { not: "EPIC" } }, include: cardInclude, orderBy: [{ rank: "asc" }] });
  const cards = issues.map(toCard);
  const daysLeft = Math.max(0, Math.ceil((sprint.endDate.getTime() + 86_400_000 - Date.now()) / 86_400_000));
  const planned = sprints.filter((s) => s.status === "PLANNED").map((s) => ({ id: s.id, name: s.name }));
  const byCat = (cats: string[]) => cards.filter((c) => cats.includes(c.status.category));
  return (
    <>
      <PageHeader
        title={sprint.name}
        breadcrumbs={crumbs}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" aria-hidden />{formatDate(sprint.startDate)} – {formatDate(sprint.endDate)}{sprint.status === "ACTIVE" && ` · ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`}</span>
            {sprint.goal && <span className="inline-flex items-center gap-1"><Target className="size-4" aria-hidden />{sprint.goal}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link href={`/projets/${key}/tableau`}>Voir le tableau</Link></Button>
            {sprint.status === "ACTIVE" && access.can("sprint.manage") && <CompleteSprintButton sprint={sprint} done={byCat(["DONE"]).length} unfinished={cards.length - byCat(["DONE"]).length} planned={planned} />}
          </>
        }
      />
      <PageBody className="flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Achèvement" value={report.completion} unit="%" hint={sprint.status === "COMPLETED" ? "Sprint terminé" : "Points terminés / points du sprint"} />
          <Kpi label="Points livrés / prévus" value={`${report.totals.completedPoints} / ${report.totals.totalPoints}`} hint={`Engagement au démarrage : ${report.committed} pts`} />
          <Kpi label="Tickets terminés" value={report.totals.completedIssues} hint={`sur ${report.totals.totalIssues}`} />
          <Kpi label="Tickets restants" value={report.totals.totalIssues - report.totals.completedIssues} tone={cards.some((c) => c.blocked) ? "warning" : undefined} hint={`${cards.filter((c) => c.blocked).length} bloqué(s)`} />
        </section>
        <Progress value={report.completion} tone={sprint.status === "COMPLETED" ? "termine" : "actif"} label={`Progression de ${sprint.name}`} />
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><div><CardTitle>Burndown</CardTitle><CardDescription>Relevés quotidiens réels (jours ouvrés) ; aucune valeur n&apos;est reconstituée.</CardDescription></div></CardHeader>
            <CardContent><BurndownChart data={report.burndown} /></CardContent>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Vélocité de l&apos;équipe</CardTitle><CardDescription>Points engagés au démarrage et livrés à la clôture</CardDescription></div></CardHeader>
            <CardContent>{vel.length ? <VelocityChart data={vel} /> : <p className="text-body-sm text-muted-foreground">La vélocité apparaîtra après le premier sprint terminé.</p>}</CardContent>
          </Card>
        </div>
        <div className="grid gap-4">
          {[["À faire", ["BACKLOG", "TODO"]], ["En cours", ["IN_PROGRESS", "IN_REVIEW", "IN_TEST"]], ["Terminés", ["DONE"]]].map(([t, cats]) => (
            <Card key={t as string} className="overflow-hidden">
              <h2 className="flex items-center gap-2 border-b bg-surface-subtle px-4 py-2 text-overline-caps text-muted-foreground">{t as string}<span>{byCat(cats as string[]).length}</span></h2>
              <IssueList issues={byCat(cats as string[])} empty="Aucun." />
            </Card>
          ))}
        </div>
        {others}
      </PageBody>
    </>
  );
}
