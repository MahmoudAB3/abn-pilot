import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Rocket } from "lucide-react";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { listReleases } from "@/modules/releases/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/pilotage/meta";
import { formatDate } from "@/lib/format";
import { releaseStatusLabels } from "@/lib/labels";
import { NewReleaseButton } from "./new-release";

export const metadata: Metadata = { title: "Versions" };
const cat = { PLANNED: "TODO", IN_PROGRESS: "IN_PROGRESS", RELEASED: "DONE", CANCELLED: "BACKLOG" } as const;

export default async function ReleasesPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const { access, releases } = await listReleases(ctx, key).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader title="Versions" breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: access.project.name, href: `/projets/${key}` }, { label: "Versions" }]} description="Contenu, dates et notes de chaque version. Aucune release GitHub n'est publiée automatiquement." actions={access.can("release.manage") ? <NewReleaseButton projectId={access.project.id} projectKey={key} /> : undefined} />
      <PageBody>
        {releases.length ? (
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {releases.map((r) => (
                <li key={r.id}>
                  <Link href={`/projets/${key}/versions/${r.id}`} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-surface-hover/60">
                    <Rocket className="size-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block truncate text-body font-semibold">{r.name}</span><span className="font-mono text-caption text-muted-foreground">{r.version}</span></span>
                    <span className="w-48"><Progress value={r.total ? (r.done / r.total) * 100 : 0} tone="termine" size="sm" label={`Avancement de ${r.name}`} /><span className="text-caption text-muted-foreground tabular-nums">{r.done} / {r.total} tickets terminés</span></span>
                    <span className="w-36 text-caption text-muted-foreground">{r.releasedAt ? `Publiée le ${formatDate(r.releasedAt)}` : r.plannedDate ? `Prévue le ${formatDate(r.plannedDate)}` : "Non datée"}</span>
                    <StatusBadge name={releaseStatusLabels[r.status]} category={cat[r.status]} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState icon={<Rocket />} title="Aucune version" description="Créez une version pour regrouper les tickets livrés ensemble et générer des notes de version." />
        )}
      </PageBody>
    </>
  );
}
