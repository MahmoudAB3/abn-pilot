import Link from "next/link";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryClass, colorFor, labelClass, priorityMeta, typeMeta, type CategoryKey, type IssueTypeKey, type LabelColor, type PriorityKey } from "@/lib/domain";
import { Avatar } from "@/components/ui/avatar";
import { displayName, type UserLite } from "@/lib/serialize";

export function IssueTypeIcon({ type, withLabel, className }: { type: IssueTypeKey; withLabel?: boolean; className?: string }) {
  const m = typeMeta[type];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-white", m.className)} title={m.label}>
        <m.icon className="size-3" strokeWidth={2.5} aria-hidden />
      </span>
      {withLabel ? <span className="text-body-sm">{m.label}</span> : <span className="sr-only">{m.label}</span>}
    </span>
  );
}

export function PriorityIcon({ priority, withLabel, className }: { priority: PriorityKey; withLabel?: boolean; className?: string }) {
  const m = priorityMeta[priority];
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={`Priorité ${m.label.toLowerCase()}`}>
      <m.icon className={cn("size-4 shrink-0", m.className)} strokeWidth={2.75} aria-hidden />
      {withLabel ? <span className="text-body-sm">{m.label}</span> : <span className="sr-only">Priorité {m.label.toLowerCase()}</span>}
    </span>
  );
}

export function StatusBadge({ name, category, className }: { name: string; category: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 max-w-40 shrink-0 items-center truncate rounded-sm px-1.5 text-[0.6875rem] font-bold tracking-[0.03em] uppercase", categoryClass[category as CategoryKey] ?? categoryClass.TODO, className)}>
      <span className="truncate">{name}</span>
    </span>
  );
}

export function BlockedBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded-sm bg-destructive-subtle px-1.5 text-[0.6875rem] font-bold tracking-[0.03em] text-destructive-subtle-foreground uppercase", className)}>
      <Ban className="size-3" aria-hidden />
      Bloqué
    </span>
  );
}

export function LabelChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span className={cn("inline-flex h-[18px] max-w-full items-center rounded-xs px-1.5 text-[0.6875rem] leading-[18px] font-bold tracking-[0.03em] uppercase", labelClass[(color as LabelColor) in labelClass ? (color as LabelColor) : "gris"], className)}>
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Étiquette d'épopée : couleur stable dérivée de la clé. */
export function EpicLabel({ epicKey, title, className }: { epicKey: string; title: string; className?: string }) {
  return <LabelChip name={title} color={colorFor(epicKey)} className={className} />;
}

export function IssueKey({ issueKey, done, href, className }: { issueKey: string; done?: boolean; href?: string; className?: string }) {
  const cls = cn("issue-key text-muted-foreground", done && "line-through decoration-1", className);
  return href ? (
    <Link href={href} className={cn(cls, "rounded-xs hover:text-primary-text hover:underline")}>
      {issueKey}
    </Link>
  ) : (
    <span className={cls}>{issueKey}</span>
  );
}

export function StoryPoints({ points, className }: { points: number | null | undefined; className?: string }) {
  if (points == null) return null;
  return (
    <span className={cn("inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-surface-active px-1.5 text-caption font-semibold text-fg-secondary tabular-nums", className)} title={`${points} points`}>
      {points}
      <span className="sr-only"> points</span>
    </span>
  );
}

export function UserAvatar({ user, size = "sm", decorative }: { user: UserLite | null | undefined; size?: "xs" | "sm" | "md" | "lg"; decorative?: boolean }) {
  if (!user)
    return (
      <span className={cn("inline-block shrink-0 rounded-full border border-dashed border-border-strong", size === "xs" ? "size-5" : size === "sm" ? "size-6" : size === "md" ? "size-8" : "size-10")} title="Non assigné">
        <span className="sr-only">Non assigné</span>
      </span>
    );
  return <Avatar name={displayName(user)} src={user.image ?? undefined} size={size} decorative={decorative} />;
}

export function UserName({ user, size = "xs" }: { user: UserLite | null | undefined; size?: "xs" | "sm" }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <UserAvatar user={user} size={size} decorative />
      <span className={cn("truncate", !user && "text-muted-foreground")}>{displayName(user)}</span>
    </span>
  );
}
