"use client";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue } from "@/lib/format";
import type { IssueCardData } from "@/lib/serialize";
import { BlockedBadge, IssueKey, IssueTypeIcon, PriorityIcon, StatusBadge, StoryPoints, UserAvatar } from "./meta";
import { useIssuePanel } from "./issue-panel";

/** Liste compacte de tickets (tableaux de bord, Mes tâches) : un clic ouvre le panneau de détail. */
export function IssueList({ issues, empty = "Aucun ticket.", showProject, showAssignee = true, className }: { issues: IssueCardData[]; empty?: string; showProject?: boolean; showAssignee?: boolean; className?: string }) {
  const panel = useIssuePanel();
  if (!issues.length) return <p className="px-4 py-6 text-center text-body-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className={cn("divide-y", className)}>
      {issues.map((i) => {
        const overdue = isOverdue(i.dueDate, i.status.category);
        return (
          <li key={i.id}>
            <button type="button" onClick={() => panel.open(i.key)} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-surface-hover/60 focus-visible:bg-surface-hover">
              <IssueTypeIcon type={i.type} />
              <IssueKey issueKey={i.key} done={i.status.category === "DONE"} className="w-20 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-body">{i.title}</span>
              {i.blocked && <BlockedBadge className="hidden sm:inline-flex" />}
              {i.dueDate && <span className={cn("hidden shrink-0 text-caption md:inline", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>{overdue ? "En retard · " : ""}{formatDate(i.dueDate, { day: "numeric", month: "short" })}</span>}
              <StatusBadge name={i.status.name} category={i.status.category} className="hidden sm:inline-flex" />
              <PriorityIcon priority={i.priority} />
              <StoryPoints points={i.storyPoints} className="hidden md:inline-flex" />
              {showProject && i.projectKey && <span className="hidden w-10 shrink-0 font-mono text-caption text-muted-foreground lg:inline">{i.projectKey}</span>}
              {showAssignee && <UserAvatar user={i.assignee} size="xs" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
