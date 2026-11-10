import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { getBacklog } from "@/modules/issues/board";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { plain, toCard } from "@/lib/serialize";
import { BacklogClient } from "./backlog-client";

export const metadata: Metadata = { title: "Backlog" };

export default async function BacklogPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const sp = await searchParams;
  const list = (k: string) => sp[k]?.split(",").filter(Boolean);
  const b = await getBacklog(ctx, key, { q: sp.q, assigneeIds: list("assignee"), priorities: list("priority"), types: list("type") }).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const cards = b.issues.map(toCard);
  const backlogPts = cards.filter((c) => !c.sprintId).reduce((s, c) => s + (c.storyPoints ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Backlog"
        breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: b.access.project.name, href: `/projets/${key}` }, { label: "Backlog" }]}
        description={`${cards.filter((c) => !c.sprintId).length} tickets non planifiés · ${backlogPts} points estimés. Glissez pour prioriser ou planifier.`}
      />
      <PageBody>
        <BacklogClient
          projectId={b.access.project.id}
          projectKey={key}
          sprints={plain(b.sprints).map((s) => ({ id: s.id, name: s.name, goal: s.goal, status: s.status, startDate: s.startDate as unknown as string, endDate: s.endDate as unknown as string }))}
          issues={cards}
          members={plain(b.members)}
          epics={b.epics.map((e) => ({ id: e.id, key: e.key, title: e.title }))}
          perms={{ prioritize: b.access.can("backlog.prioritize"), sprint: b.access.can("sprint.manage"), edit: b.access.can("issue.edit"), create: b.access.can("issue.create"), archive: b.access.can("issue.delete") }}
        />
      </PageBody>
    </>
  );
}
