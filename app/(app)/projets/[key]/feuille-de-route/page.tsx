import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { roadmap } from "@/modules/releases/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { plain } from "@/lib/serialize";
import { RoadmapClient } from "./roadmap-client";

export const metadata: Metadata = { title: "Feuille de route" };

export default async function RoadmapPage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const r = await roadmap(ctx, key).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  return (
    <>
      <PageHeader title="Feuille de route" breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: r.access.project.name, href: `/projets/${key}` }, { label: "Feuille de route" }]} description="Jalons et épopées ; la progression est calculée à partir des tickets enfants terminés." />
      <PageBody>
        <RoadmapClient projectId={r.access.project.id} milestones={plain(r.milestones)} epics={plain(r.epics).map((e) => ({ id: e.id, key: e.key, title: e.title, milestoneId: e.milestoneId, status: e.status, createdAt: e.createdAt, dueDate: e.dueDate, progress: e.progress }))} canManage={r.access.can("release.manage")} />
      </PageBody>
    </>
  );
}
