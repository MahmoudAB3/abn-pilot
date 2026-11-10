"use client";
import * as React from "react";
import { SquareKanban } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, useUrlFilters } from "@/components/pilotage/filter-bar";
import { KanbanBoard, type BoardStatus, type Swimlane } from "@/components/pilotage/kanban-board";
import type { IssueCardData, UserLite } from "@/lib/serialize";

export function BoardClient(p: { projectId: string; projectKey: string; issues: IssueCardData[]; statuses: BoardStatus[]; members: UserLite[]; labels: { id: string; name: string; color: string }[]; sprints: { id: string; name: string; status: string }[]; scope: string; hasActive: boolean; sprintId: string | null; canMove: boolean; canCreate: boolean }) {
  const f = useUrlFilters();
  const swimlane = (f.sp.get("couloirs") as Swimlane) || "none";
  const blocked = p.issues.filter((i) => i.blocked).length;
  return (
    <>
      <div className="px-page-x pb-3">
        <FilterBar
          members={p.members}
          labels={p.labels}
          showBlocked
          trailing={
            <>
              {blocked > 0 && <span className="rounded-sm bg-destructive-subtle px-2 py-1 text-caption font-semibold text-destructive-subtle-foreground">{blocked} bloqué{blocked > 1 ? "s" : ""}</span>}
              <Select value={p.scope} onValueChange={(v) => f.set("portee", v)}>
                <SelectTrigger size="sm" className="w-48" aria-label="Périmètre"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Sprint actif{p.hasActive ? "" : " (aucun)"}</SelectItem>
                  <SelectItem value="all">Tous les tickets (Kanban)</SelectItem>
                  {p.sprints.filter((s) => s.status === "PLANNED").length > 0 && <SelectSeparator />}
                  {p.sprints.filter((s) => s.status === "PLANNED").map((s) => <SelectItem key={s.id} value={s.id}>{s.name} (planifié)</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={swimlane} onValueChange={(v) => f.set("couloirs", v === "none" ? null : v)}>
                <SelectTrigger size="sm" className="w-44" aria-label="Couloirs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sans couloirs</SelectItem>
                  <SelectItem value="assignee">Couloirs par assigné</SelectItem>
                  <SelectItem value="epic">Couloirs par épopée</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
      </div>
      <div className="flex min-h-0 flex-1 px-page-x">
        {p.scope === "active" && !p.hasActive ? (
          <EmptyState className="w-full self-start" icon={<SquareKanban />} title="Aucun sprint actif" description="Démarrez un sprint depuis le backlog, ou passez en mode « Tous les tickets » pour un flux Kanban continu." />
        ) : (
          <KanbanBoard issues={p.issues} statuses={p.statuses} projectId={p.projectId} sprintId={p.sprintId} canMove={p.canMove} canCreate={p.canCreate} swimlane={swimlane} />
        )}
      </div>
    </>
  );
}
