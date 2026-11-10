import type { Metadata } from "next";
import Link from "next/link";
import { GitCommitHorizontal, GitMerge, GitPullRequest, Settings } from "lucide-react";
import { requirePageCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { githubDashboard } from "@/modules/github/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Kpi } from "@/components/pilotage/kpi";
import { IssueKey, StatusBadge, UserName } from "@/components/pilotage/meta";
import { reviewStateLabels } from "@/lib/labels";
import { timeAgo } from "@/lib/format";
import { plain } from "@/lib/serialize";

export const metadata: Metadata = { title: "Activité GitHub" };

type PR = Awaited<ReturnType<typeof githubDashboard>>["open"][number];

function PrRow({ pr, icon: Icon = GitPullRequest, when }: { pr: PR; icon?: typeof GitPullRequest; when: string }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className={pr.state === "MERGED" ? "size-4 shrink-0 text-type-epic" : "size-4 shrink-0 text-success"} aria-hidden />
        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-body font-medium hover:text-primary-text hover:underline">{pr.title}</a>
        <span className="shrink-0 font-mono text-caption text-muted-foreground">#{pr.number}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-caption text-muted-foreground">
        <span>{pr.repository.fullName}</span>
        <span>{pr.authorLogin}</span>
        {pr.state === "OPEN" && <span>{pr.draft ? "Brouillon" : reviewStateLabels[pr.reviewState]}</span>}
        <span>{when}</span>
        {pr.issueLinks.map((l) => <IssueKey key={l.issueId} issueKey={l.issue.key} href={`/tickets/${l.issue.key}`} className="text-primary-text" />)}
      </div>
    </li>
  );
}

export default async function GitHubPage() {
  const ctx = await requirePageCtx();
  const d = await githubDashboard(ctx);
  return (
    <>
      <PageHeader
        title="Activité GitHub"
        description="Commits et pull requests liés aux tickets par leur clé (ex. ERP-14), sur les dépôts rattachés à vos projets."
        actions={orgCan(ctx, "github.manage") ? <Button variant="outline" size="sm" asChild><Link href="/parametres/github"><Settings aria-hidden />Configurer</Link></Button> : undefined}
      />
      <PageBody className="flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="PR ouvertes" value={d.open.length} />
          <Kpi label="En attente de revue" value={d.awaiting.length} tone={d.awaiting.length > 3 ? "warning" : undefined} hint="Hors brouillons" />
          <Kpi label="Fusionnées (14 j)" value={d.merged.length} />
          <Kpi label="Prêts pour le test ?" value={d.readyForTest.length} hint="PR fusionnée, ticket pas encore en test" tone={d.readyForTest.length ? "warning" : undefined} />
        </section>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader><div><CardTitle>En attente de revue</CardTitle><CardDescription>Les plus anciennes d&apos;abord</CardDescription></div></CardHeader>
            <ul className="divide-y">{d.awaiting.map((pr) => <PrRow key={pr.id} pr={pr} when={`ouverte ${timeAgo(pr.openedAt)}`} />)}{!d.awaiting.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Aucune PR n&apos;attend de revue.</li>}</ul>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader><div><CardTitle>Tickets potentiellement prêts pour le test</CardTitle><CardDescription>Une PR liée est fusionnée, mais le ticket est encore en cours ou en revue</CardDescription></div></CardHeader>
            <ul className="divide-y">
              {d.readyForTest.map((i) => (
                <li key={i.id} className="flex items-center gap-2.5 px-4 py-2">
                  <IssueKey issueKey={i.key} href={`/tickets/${i.key}`} className="w-20 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-body">{i.title}</span>
                  <StatusBadge name={i.status.name} category={i.status.category} />
                  <span className="hidden text-body-sm sm:inline"><UserName user={plain(i.assignee)} /></span>
                </li>
              ))}
              {!d.readyForTest.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Rien à signaler.</li>}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Pull requests ouvertes</CardTitle></CardHeader>
            <ul className="divide-y">{d.open.map((pr) => <PrRow key={pr.id} pr={pr} when={`mise à jour ${timeAgo(pr.githubUpdatedAt)}`} />)}{!d.open.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Aucune PR ouverte.</li>}</ul>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader><CardTitle>Fusionnées récemment</CardTitle></CardHeader>
            <ul className="divide-y">{d.merged.map((pr) => <PrRow key={pr.id} pr={pr} icon={GitMerge} when={`fusionnée ${timeAgo(pr.mergedAt!)}`} />)}{!d.merged.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Aucune fusion ces 14 derniers jours.</li>}</ul>
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="overflow-hidden xl:col-span-2">
            <CardHeader><CardTitle>Derniers commits référencés</CardTitle></CardHeader>
            <ul className="divide-y">
              {d.commits.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5 px-4 py-2">
                  <GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-caption font-medium text-primary-text hover:underline">{c.sha.slice(0, 7)}</a>
                  <span className="min-w-0 flex-1 truncate text-body">{c.message.split("\n")[0]}</span>
                  <span className="hidden shrink-0 text-caption text-muted-foreground md:inline">{c.authorLogin ?? c.authorName} · {timeAgo(c.committedAt)}</span>
                </li>
              ))}
              {!d.commits.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Aucun commit référencé.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader><div><CardTitle>Activité par dépôt</CardTitle><CardDescription>14 derniers jours</CardDescription></div></CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {d.repos.map((r) => <li key={`${r.projectKey}-${r.fullName}`} className="flex items-center justify-between gap-2 text-body-sm"><span className="min-w-0 truncate"><span className="font-mono text-caption text-muted-foreground">{r.projectKey}</span> {r.fullName}</span><span className="shrink-0 text-caption text-muted-foreground tabular-nums">{r.commits} commits · {r.prs} PR</span></li>)}
                {!d.repos.length && <li className="text-body-sm text-muted-foreground">Aucun dépôt lié.</li>}
              </ul>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}
