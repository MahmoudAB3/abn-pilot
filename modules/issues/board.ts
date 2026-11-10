import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { projectAccess, type UserCtx } from "@/server/authz";
import { cardInclude } from "./service";

export interface BoardFilters {
  assigneeIds?: string[];
  priorities?: string[];
  types?: string[];
  labelIds?: string[];
  q?: string;
  blocked?: boolean;
  /** "active" (sprint actif), "all" (Kanban continu) ou un id de sprint. */
  scope?: string;
}

/**
 * Tableau : colonnes = statuts du workflow (hors Backlog en mode Scrum).
 * Filtrage côté serveur ; les épopées ne sont pas des cartes.
 */
export async function getBoard(ctx: UserCtx, projectKey: string, f: BoardFilters) {
  const access = await projectAccess(ctx, { key: projectKey });
  const projectId = access.project.id;
  const [statuses, activeSprint, sprints, labels, members] = await Promise.all([
    db.workflowStatus.findMany({ where: { projectId }, orderBy: { position: "asc" } }),
    db.sprint.findFirst({ where: { projectId, status: "ACTIVE" } }),
    db.sprint.findMany({ where: { projectId, status: { not: "COMPLETED" } }, orderBy: { startDate: "asc" }, select: { id: true, name: true, status: true } }),
    db.label.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
    db.projectMembership.findMany({ where: { projectId, role: { not: "VIEWER" } }, include: { user: { select: { id: true, name: true, email: true, image: true } } } }),
  ]);
  const scope = f.scope ?? (activeSprint ? "active" : "all");
  const where: Prisma.IssueWhereInput = { projectId, archivedAt: null, type: { not: "EPIC" } };
  if (scope === "active") where.sprintId = activeSprint?.id ?? "__aucun__";
  else if (scope !== "all") where.sprintId = scope;
  else where.status = { category: { not: "BACKLOG" } };
  if (f.assigneeIds?.length) where.OR = [{ assigneeId: { in: f.assigneeIds.filter((a) => a !== "none") } }, ...(f.assigneeIds.includes("none") ? [{ assigneeId: null }] : [])];
  if (f.priorities?.length) where.priority = { in: f.priorities as Prisma.EnumPriorityFilter["in"] };
  if (f.types?.length) where.type = { in: f.types as ("STORY" | "TASK" | "BUG" | "SUBTASK")[] };
  if (f.labelIds?.length) where.labels = { some: { labelId: { in: f.labelIds } } };
  if (f.q) where.AND = [{ OR: [{ key: { equals: f.q.toUpperCase() } }, { title: { contains: f.q, mode: "insensitive" } }] }];
  if (f.blocked) where.blocked = true;

  const issues = await db.issue.findMany({ where, include: cardInclude, orderBy: [{ rank: "asc" }, { id: "asc" }], take: 1000 });
  const columns = statuses.filter((s) => scope === "all" || s.category !== "BACKLOG");
  return { access, statuses: columns, issues, activeSprint, sprints, labels, members: members.map((m) => m.user), scope };
}

/** Backlog : sprints actif/planifiés puis backlog non planifié, triés par rang. */
export async function getBacklog(ctx: UserCtx, projectKey: string, f: Pick<BoardFilters, "assigneeIds" | "priorities" | "types" | "q">) {
  const access = await projectAccess(ctx, { key: projectKey });
  const projectId = access.project.id;
  const where: Prisma.IssueWhereInput = { projectId, archivedAt: null, type: { not: "EPIC" }, OR: [{ sprintId: null, status: { category: { not: "DONE" } } }, { sprint: { status: { not: "COMPLETED" } } }] };
  const and: Prisma.IssueWhereInput[] = [];
  if (f.assigneeIds?.length) and.push({ OR: [{ assigneeId: { in: f.assigneeIds.filter((a) => a !== "none") } }, ...(f.assigneeIds.includes("none") ? [{ assigneeId: null }] : [])] });
  if (f.priorities?.length) and.push({ priority: { in: f.priorities as Prisma.EnumPriorityFilter["in"] } });
  if (f.types?.length) and.push({ type: { in: f.types as ("STORY" | "TASK" | "BUG" | "SUBTASK")[] } });
  if (f.q) and.push({ OR: [{ key: { equals: f.q.toUpperCase() } }, { title: { contains: f.q, mode: "insensitive" } }] });
  if (and.length) where.AND = and;

  const [sprints, issues, epics, members, statuses] = await Promise.all([
    db.sprint.findMany({ where: { projectId, status: { not: "COMPLETED" } }, orderBy: [{ status: "asc" }, { startDate: "asc" }] }),
    db.issue.findMany({ where, include: cardInclude, orderBy: [{ rank: "asc" }, { id: "asc" }], take: 2000 }),
    db.issue.findMany({ where: { projectId, type: "EPIC", archivedAt: null }, select: { id: true, key: true, title: true, labels: { select: { label: { select: { color: true } } } } }, orderBy: { rank: "asc" } }),
    db.projectMembership.findMany({ where: { projectId }, include: { user: { select: { id: true, name: true, email: true, image: true } } } }),
    db.workflowStatus.findMany({ where: { projectId }, orderBy: { position: "asc" } }),
  ]);
  return { access, sprints, issues, epics, members: members.map((m) => m.user), statuses };
}
