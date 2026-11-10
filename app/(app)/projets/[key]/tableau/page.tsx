import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { getBoard } from "@/modules/issues/board";
import { toCard, plain } from "@/lib/serialize";
import { PageHeader } from "@/components/layout/page-header";
import { BoardClient } from "./board-client";

export const metadata: Metadata = { title: "Tableau Kanban" };

export default async function BoardPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const sp = await searchParams;
  const list = (k: string) => sp[k]?.split(",").filter(Boolean);
  const board = await getBoard(ctx, key, { q: sp.q, assigneeIds: list("assignee"), priorities: list("priority"), types: list("type"), labelIds: list("label"), blocked: sp.bloques === "1", scope: sp.portee }).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  const sprintId = board.scope === "active" ? board.activeSprint?.id ?? null : board.scope === "all" ? null : board.scope;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Tableau"
        breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: board.access.project.name, href: `/projets/${key}` }, { label: "Tableau Kanban" }]}
        description={board.scope === "active" ? (board.activeSprint ? `${board.activeSprint.name}${board.activeSprint.goal ? ` · ${board.activeSprint.goal}` : ""}` : "Aucun sprint actif — affichez « Tous les tickets » ou démarrez un sprint depuis le backlog.") : board.scope === "all" ? "Flux continu : tous les tickets hors backlog" : board.sprints.find((s) => s.id === board.scope)?.name}
      />
      <BoardClient
        projectId={board.access.project.id}
        projectKey={key}
        issues={board.issues.map(toCard)}
        statuses={board.statuses.map((s) => ({ id: s.id, name: s.name, category: s.category, wipLimit: s.wipLimit }))}
        members={plain(board.members)}
        labels={board.labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))}
        sprints={board.sprints}
        scope={board.scope}
        hasActive={!!board.activeSprint}
        sprintId={sprintId}
        canMove={board.access.can("board.move")}
        canCreate={board.access.can("issue.create")}
      />
    </div>
  );
}
