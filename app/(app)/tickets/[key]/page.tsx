import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { issueAccess } from "@/server/authz";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { PageBody } from "@/components/layout/page-header";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { IssueDetailView } from "@/components/pilotage/issue-detail";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  return { title: (await params).key.toUpperCase() };
}

/** Page dédiée d'un ticket (lien partageable /tickets/ERP-14). */
export default async function IssuePage({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const { issue } = await issueAccess(ctx, { key }).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const p = await db.project.findUniqueOrThrow({ where: { id: issue.projectId }, select: { key: true, name: true } });
  return (
    <PageBody className="mx-auto max-w-4xl pt-4">
      <Breadcrumb items={[{ label: "Projets", href: "/projets" }, { label: p.name, href: `/projets/${p.key}` }, { label: issue.key }]} />
      <div className="mt-2 rounded-lg border bg-card">
        <IssueDetailView issueKey={issue.key} variant="page" />
      </div>
    </PageBody>
  );
}
