import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GitBranch, ListOrdered, Map, Rocket, Settings, SquareKanban, Timer } from "lucide-react";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { getProject, listProjects } from "@/modules/projects/service";
import { db } from "@/server/db";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { HealthBadge, ProjectAvatar } from "@/components/pilotage/project-bits";
import { StatusBadge, UserName } from "@/components/pilotage/meta";
import { formatDate } from "@/lib/format";
import { projectRoleLabels, projectStatusLabels } from "@/lib/labels";
import { plain } from "@/lib/serialize";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  return { title: (await params).key };
}

export default async function ProjectOverview({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const data = await getProject(ctx, key).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const { project, can } = data;
  const summary = (await listProjects(ctx, { includeArchived: true })).find((p) => p.id === project.id)!;
  const [active, distribution] = await Promise.all([
    db.sprint.findFirst({ where: { projectId: project.id, status: "ACTIVE" } }),
    db.$queryRaw<{ name: string; category: string; n: bigint }[]>`SELECT s.name, s.category::text, count(i.id) n FROM "WorkflowStatus" s LEFT JOIN "Issue" i ON i."statusId" = s.id AND i."archivedAt" IS NULL AND i.type <> 'EPIC' WHERE s."projectId" = ${project.id} GROUP BY s.id ORDER BY s.position`,
  ]);
  const shortcuts = [
    { href: "backlog", label: "Backlog", icon: ListOrdered },
    { href: "sprint", label: active ? active.name : "Sprints", icon: Timer },
    { href: "tableau", label: "Tableau", icon: SquareKanban },
    { href: "feuille-de-route", label: "Feuille de route", icon: Map },
    { href: "versions", label: "Versions", icon: Rocket },
  ];
  return (
    <>
      <PageHeader
        title={project.name}
        breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: project.name }]}
        description={<span className="flex flex-wrap items-center gap-2"><span className="issue-key">{project.key}</span>· {projectStatusLabels[project.status]}{project.targetDate && <> · cible {formatDate(project.targetDate)}</>}</span>}
        actions={
          <>
            {shortcuts.map((s) => (
              <Button key={s.href} variant="outline" size="sm" asChild><Link href={`/projets/${project.key}/${s.href}`}><s.icon aria-hidden />{s.label}</Link></Button>
            ))}
            {can("project.manage") && <Button variant="ghost" size="sm" asChild><Link href={`/projets/${project.key}/parametres`}><Settings aria-hidden />Paramètres</Link></Button>}
          </>
        }
      />
      <PageBody className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-3"><ProjectAvatar projectKey={project.key} size="lg" /><CardTitle>Avancement</CardTitle></div>
            <HealthBadge health={summary.health} />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {project.description && <p className="text-body text-fg-secondary">{project.description}</p>}
            <div>
              <div className="mb-1.5 flex justify-between text-body-sm"><span className="text-muted-foreground">{summary.stats.done} / {summary.stats.total} tickets terminés</span><span className="font-semibold tabular-nums">{summary.stats.progress} %</span></div>
              <Progress value={summary.stats.progress} label="Avancement du projet" />
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Ouverts", summary.stats.open], ["Bloqués", summary.stats.blocked], ["En retard", summary.stats.overdue], ["Membres", project.members.length]].map(([l, v]) => (
                <div key={l as string} className="rounded-md border px-3 py-2"><dt className="text-caption text-muted-foreground">{l}</dt><dd className="text-h2 font-semibold tabular-nums">{v}</dd></div>
              ))}
            </dl>
            <div>
              <h3 className="mb-2 text-overline-caps text-muted-foreground">Répartition par statut</h3>
              <ul className="flex flex-wrap gap-2">
                {distribution.map((d) => <li key={d.name} className="flex items-center gap-1.5"><StatusBadge name={d.name} category={d.category} /><span className="text-body-sm font-semibold tabular-nums">{Number(d.n)}</span></li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Équipe</CardTitle></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {project.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-2 text-body-sm"><UserName user={plain(m.user)} /><span className="text-caption text-muted-foreground">{project.leadId === m.userId ? "Responsable" : projectRoleLabels[m.role]}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Dépôts GitHub</CardTitle></CardHeader>
            <CardContent>
              {project.repositories.length ? (
                <ul className="flex flex-col gap-1.5">
                  {project.repositories.map((r) => (
                    <li key={r.repositoryId} className="flex items-center gap-2 text-body-sm"><GitBranch className="size-4 text-muted-foreground" aria-hidden /><a href={r.repository.htmlUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">{r.repository.fullName}</a></li>
                  ))}
                </ul>
              ) : (
                <p className="text-body-sm text-muted-foreground">Aucun dépôt lié.{can("repo.link") && <> <Link href="/parametres/github" className="text-primary-text hover:underline">Lier un dépôt</Link></>}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
