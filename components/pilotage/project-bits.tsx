import Link from "next/link";
import { cn } from "@/lib/utils";
import { colorFor, labelClass } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { Progress } from "@/components/ui/progress";
import { AvatarGroup } from "@/components/ui/avatar";
import { displayName, type UserLite } from "@/lib/serialize";

export type Health = "en-bonne-voie" | "a-risque" | "en-retard";
const healthMeta: Record<Health, { label: string; cls: string; tone: "termine" | "actif" | "retard" }> = {
  "en-bonne-voie": { label: "En bonne voie", cls: "bg-success-subtle text-success-subtle-foreground", tone: "termine" },
  "a-risque": { label: "À risque", cls: "bg-warning-subtle text-warning-subtle-foreground", tone: "actif" },
  "en-retard": { label: "En retard", cls: "bg-destructive-subtle text-destructive-subtle-foreground", tone: "retard" },
};

export function ProjectAvatar({ projectKey, size = "md" }: { projectKey: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-md font-mono font-bold", labelClass[colorFor(projectKey)], size === "sm" && "size-6 text-[0.625rem]", size === "md" && "size-8 text-caption", size === "lg" && "size-10 text-body-sm")}>
      {projectKey.slice(0, 2)}
    </span>
  );
}

export function HealthBadge({ health }: { health: Health }) {
  const m = healthMeta[health];
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-sm px-1.5 text-caption font-semibold", m.cls)}>{m.label}</span>;
}

export function ProjectCard({ p }: { p: { key: string; name: string; description: string; targetDate: string | Date | null; health: Health; stats: { open: number; total: number; done: number; progress: number; overdue: number; blocked: number }; members: { user: UserLite }[]; _count: { members: number } } }) {
  const m = healthMeta[p.health];
  return (
    <article className="group relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-raised focus-within:shadow-raised">
      <div className="flex items-start gap-3">
        <ProjectAvatar projectKey={p.key} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 font-semibold">
            <Link href={`/projets/${p.key}`} className="rounded-xs after:absolute after:inset-0 after:rounded-lg hover:underline focus-visible:outline-none">{p.name}</Link>
          </h2>
          <p className="issue-key text-muted-foreground">{p.key}</p>
        </div>
        <HealthBadge health={p.health} />
      </div>
      <p className="line-clamp-2 min-h-9 text-body-sm text-fg-secondary">{p.description || "Aucune description."}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-caption">
          <span className="text-muted-foreground">{p.stats.done} / {p.stats.total} tickets terminés</span>
          <span className="font-semibold tabular-nums">{p.stats.progress} %</span>
        </div>
        <Progress value={p.stats.progress} tone={m.tone} size="sm" label={`Avancement de ${p.name}`} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-caption text-muted-foreground">
        <AvatarGroup names={p.members.map((x) => displayName(x.user))} max={4} size="xs" />
        <span className="text-right">
          {p.stats.blocked > 0 && <span className="font-semibold text-destructive">{p.stats.blocked} bloqué{p.stats.blocked > 1 ? "s" : ""} · </span>}
          {p.stats.overdue > 0 && <span className="font-semibold text-warning-subtle-foreground">{p.stats.overdue} en retard · </span>}
          {p.targetDate ? `cible ${formatDate(p.targetDate)}` : `${p.stats.open} ouverts`}
        </span>
      </div>
    </article>
  );
}
