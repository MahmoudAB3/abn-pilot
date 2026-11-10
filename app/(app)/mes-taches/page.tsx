import type { Metadata } from "next";
import { requirePageCtx } from "@/server/session";
import { myIssues } from "@/modules/issues/service";
import { db } from "@/server/db";
import { visibleProjectsWhere } from "@/server/authz";
import { cardInclude } from "@/modules/issues/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { IssueList } from "@/components/pilotage/issue-list";
import { toCard } from "@/lib/serialize";

export const metadata: Metadata = { title: "Mes tâches" };

export default async function MyTasks() {
  const ctx = await requirePageCtx();
  const [mine, reported, watching] = await Promise.all([
    myIssues(ctx),
    db.issue.findMany({ where: { reporterId: ctx.userId, archivedAt: null, status: { category: { not: "DONE" } }, project: visibleProjectsWhere(ctx) }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.issue.findMany({ where: { watchers: { some: { userId: ctx.userId } }, assigneeId: { not: ctx.userId }, archivedAt: null, status: { category: { not: "DONE" } }, project: visibleProjectsWhere(ctx) }, include: { ...cardInclude, project: { select: { key: true } } }, orderBy: { updatedAt: "desc" }, take: 50 }),
  ]);
  const cards = mine.map(toCard);
  const groups = [
    { id: "cours", title: "En cours", items: cards.filter((i) => ["IN_PROGRESS", "IN_REVIEW", "IN_TEST"].includes(i.status.category)) },
    { id: "faire", title: "À faire", items: cards.filter((i) => ["TODO", "BACKLOG"].includes(i.status.category)) },
    { id: "fini", title: "Terminés récemment", items: cards.filter((i) => i.status.category === "DONE").slice(0, 10) },
  ];
  return (
    <>
      <PageHeader title="Mes tâches" description={`${groups[0]!.items.length + groups[1]!.items.length} tickets ouverts vous sont assignés`} />
      <PageBody className="flex flex-col gap-4">
        {groups.map((g) => (
          <Card key={g.id} className="overflow-hidden">
            <h2 className="flex items-center gap-2 border-b bg-surface-subtle px-4 py-2 text-overline-caps text-muted-foreground">{g.title}<span>{g.items.length}</span></h2>
            <IssueList issues={g.items} showProject showAssignee={false} empty="Rien ici." />
          </Card>
        ))}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden"><h2 className="border-b bg-surface-subtle px-4 py-2 text-overline-caps text-muted-foreground">Créés par moi (ouverts)</h2><IssueList issues={reported.map(toCard)} showProject empty="Aucun." /></Card>
          <Card className="overflow-hidden"><h2 className="border-b bg-surface-subtle px-4 py-2 text-overline-caps text-muted-foreground">Suivis</h2><IssueList issues={watching.map(toCard)} showProject empty="Aucun ticket suivi." /></Card>
        </div>
      </PageBody>
    </>
  );
}
