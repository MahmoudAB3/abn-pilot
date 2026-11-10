import type { IssueCardRow } from "@/modules/issues/service";
import type { Jsonify } from "./jsonify";

/** Données d'une carte de ticket, sérialisables vers les composants client. */
export interface IssueCardData {
  id: string;
  key: string;
  title: string;
  type: "EPIC" | "STORY" | "TASK" | "BUG" | "SUBTASK";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";
  statusId: string;
  status: { id: string; name: string; category: string };
  storyPoints: number | null;
  rank: number;
  blocked: boolean;
  dueDate: string | null;
  sprintId: string | null;
  parentId: string | null;
  parent: { id: string; key: string; title: string; type: string } | null;
  assignee: UserLite | null;
  labels: { id: string; name: string; color: string }[];
  counts: { children: number; comments: number; github: number };
  projectKey?: string;
}
export interface UserLite {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export function toCard(r: IssueCardRow & { project?: { key: string } }): IssueCardData {
  return {
    id: r.id,
    key: r.key,
    title: r.title,
    type: r.type,
    priority: r.priority,
    statusId: r.statusId,
    status: r.status,
    storyPoints: r.storyPoints,
    rank: r.rank,
    blocked: r.blocked,
    dueDate: r.dueDate?.toISOString() ?? null,
    sprintId: r.sprintId,
    parentId: r.parentId,
    parent: r.parent,
    assignee: r.assignee,
    labels: r.labels.map((l) => l.label),
    counts: { children: r._count.children, comments: r._count.comments, github: r._count.githubLinks },
    projectKey: r.project?.key,
  };
}

export const displayName = (u: { name: string | null; email: string } | null | undefined) => (u ? u.name || u.email.split("@")[0]! : "Non assigné");

/** Sérialise un objet Prisma (dates → ISO, BigInt → string) pour un composant client. */
export function plain<T>(v: T): Jsonify<T> {
  return JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));
}
