import type { Metadata } from "next";
import Link from "next/link";
import { requirePageCtx } from "@/server/session";
import { db } from "@/server/db";
import { visibleProjectsWhere } from "@/server/authz";
import { globalSearch } from "@/modules/search/service";
import { cardInclude, filtersWhere } from "@/modules/issues/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { IssueList } from "@/components/pilotage/issue-list";
import { toCard } from "@/lib/serialize";
import { SearchFilters } from "./search-filters";

export const metadata: Metadata = { title: "Recherche" };

/** Recherche plein texte + filtres serveur (projet, assigné, statut, priorité, type) et filtres enregistrés. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageCtx();
  const sp = await searchParams;
  const list = (k: string) => sp[k]?.split(",").filter(Boolean);
  const projects = await db.project.findMany({ where: visibleProjectsWhere(ctx), select: { id: true, key: true, name: true }, orderBy: { name: "asc" } });
  const project = projects.find((p) => p.key === sp.projet);
  const q = sp.q?.trim() ?? "";
  const ftIds = q ? (await globalSearch(ctx, q, { projectId: project?.id, limit: 50 })).issues.map((i) => i.id) : null;
  const where = filtersWhere(ctx, { projectId: project?.id, assigneeIds: list("assignee") as never, priorities: list("priority") as never, types: list("type") as never, statusIds: undefined });
  const categories = list("categorie");
  const issues = await db.issue.findMany({
    where: { AND: [where, ...(ftIds ? [{ id: { in: ftIds } }] : []), ...(categories?.length ? [{ status: { category: { in: categories as never } } }] : [])] },
    include: { ...cardInclude, project: { select: { key: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const ordered = ftIds ? [...issues].sort((a, b) => ftIds.indexOf(a.id) - ftIds.indexOf(b.id)) : issues;
  const [members, saved] = await Promise.all([
    db.user.findMany({ where: { memberships: { some: { orgId: ctx.orgId, status: "ACTIVE", role: { not: "VIEWER" } } } }, select: { id: true, name: true, email: true, image: true }, orderBy: { name: "asc" } }),
    db.savedFilter.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Recherche" description={q ? `Résultats pour « ${q} »` : "Recherchez par clé, titre, description, ou filtrez."}>
        <SearchFilters projects={projects} members={members} saved={saved.map((s) => ({ id: s.id, name: s.name, query: (s.filters as { url?: string }).url ?? "" }))} />
      </PageHeader>
      <PageBody>
        <Card className="overflow-hidden">
          <p className="border-b bg-surface-subtle px-4 py-2 text-caption text-muted-foreground">{ordered.length}{ordered.length === 100 ? "+" : ""} ticket(s)</p>
          <IssueList issues={ordered.map(toCard)} showProject empty="Aucun ticket ne correspond." />
        </Card>
        {!projects.length && <p className="mt-4 text-body-sm text-muted-foreground">Vous n&apos;avez accès à aucun projet. <Link href="/projets" className="text-primary-text hover:underline">Voir les projets</Link></p>}
      </PageBody>
    </>
  );
}
