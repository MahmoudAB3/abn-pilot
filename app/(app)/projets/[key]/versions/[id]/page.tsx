import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { getRelease } from "@/modules/releases/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { renderMarkdown } from "@/lib/markdown";
import { plain } from "@/lib/serialize";
import { ReleaseClient } from "./release-client";

export const metadata: Metadata = { title: "Version" };

export default async function ReleasePage({ params }: { params: Promise<{ key: string; id: string }> }) {
  const ctx = await requirePageCtx();
  const { key, id } = await params;
  const r = await getRelease(ctx, id).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const candidates = r.access.can("release.manage")
    ? await db.issue.findMany({ where: { projectId: r.release.projectId, releaseId: null, archivedAt: null, type: { not: "EPIC" } }, select: { id: true, key: true, title: true, status: { select: { name: true, category: true } } }, orderBy: { number: "desc" }, take: 200 })
    : [];
  return (
    <>
      <PageHeader title={`${r.release.name}`} breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: r.access.project.name, href: `/projets/${key}` }, { label: "Versions", href: `/projets/${key}/versions` }, { label: r.release.version }]} description={<span className="font-mono">{r.release.version}</span>} />
      <PageBody>
        <ReleaseClient release={plain(r.release)} notesHtml={renderMarkdown(r.release.notes)} issues={plain(r.issues)} candidates={plain(candidates)} canManage={r.access.can("release.manage")} />
      </PageBody>
    </>
  );
}
