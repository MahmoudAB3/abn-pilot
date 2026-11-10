"use client";
import * as React from "react";
import { CalendarClock, GitPullRequest, ListTree, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, isOverdue } from "@/lib/format";
import type { IssueCardData } from "@/lib/serialize";
import { BlockedBadge, EpicLabel, IssueKey, IssueTypeIcon, LabelChip, PriorityIcon, StoryPoints, UserAvatar } from "./meta";

export interface IssueCardProps extends React.HTMLAttributes<HTMLDivElement> {
  issue: IssueCardData;
  selected?: boolean;
  dragging?: boolean;
  placeholder?: boolean;
  pending?: boolean;
  onOpen?: (issue: IssueCardData) => void;
}

/** Carte Kanban : titre, épopée/étiquettes, puis type · priorité · points · clé · assigné. Les tickets bloqués sont signalés. */
export const IssueCard = React.forwardRef<HTMLDivElement, IssueCardProps>(({ issue, selected, dragging, placeholder, pending, onOpen, className, onKeyDown, ...props }, ref) => {
  const done = issue.status.category === "DONE";
  const overdue = isOverdue(issue.dueDate, issue.status.category);
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label={`${issue.key} : ${issue.title}${issue.blocked ? " (bloqué)" : ""}`}
      data-issue-key={issue.key}
      onClick={() => onOpen?.(issue)}
      onKeyDown={(e) => {
        if (onKeyDown) return onKeyDown(e);
        if (e.key === "Enter") {
          e.preventDefault();
          onOpen?.(issue);
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-2 rounded-md bg-card p-2.5 text-left shadow-card transition-[box-shadow,background-color] outline-none select-none",
        "hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring",
        issue.blocked && "border-l-[3px] border-destructive pl-2",
        selected && "ring-2 ring-selected-border",
        dragging && "rotate-[1.5deg] shadow-overlay",
        placeholder && "opacity-40",
        pending && "opacity-70",
        className,
      )}
      {...props}
    >
      <p className={cn("line-clamp-3 text-body text-foreground", done && "text-fg-secondary")}>{issue.title}</p>
      {(issue.blocked || issue.parent?.type === "EPIC" || issue.labels.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {issue.blocked && <BlockedBadge />}
          {issue.parent?.type === "EPIC" && <EpicLabel epicKey={issue.parent.key} title={issue.parent.title} className="max-w-full" />}
          {issue.labels.slice(0, 2).map((l) => (
            <LabelChip key={l.id} name={l.name} color={l.color} />
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <IssueTypeIcon type={issue.type} />
        <PriorityIcon priority={issue.priority} />
        <StoryPoints points={issue.storyPoints} />
        {issue.dueDate && (
          <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap text-caption", overdue ? "font-semibold text-destructive" : "text-muted-foreground")} title={overdue ? "En retard" : "Échéance"}>
            <CalendarClock className="size-3.5" aria-hidden />
            {formatDate(issue.dueDate, { day: "numeric", month: "short" })}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          {issue.counts.github > 0 && <GitPullRequest className="size-3.5 text-muted-foreground" aria-label="Activité GitHub liée" />}
          {issue.counts.children > 0 && !issue.dueDate && <ListTree className="size-3.5 text-muted-foreground" aria-label={`${issue.counts.children} sous-tâches`} />}
          {issue.counts.comments > 0 && (
            <span className="inline-flex items-center gap-0.5 text-caption text-muted-foreground">
              <MessageSquare className="size-3.5" aria-hidden />
              {issue.counts.comments}
            </span>
          )}
          <IssueKey issueKey={issue.key} done={done} />
          <UserAvatar user={issue.assignee} size="sm" />
        </span>
      </div>
    </div>
  );
});
IssueCard.displayName = "IssueCard";
