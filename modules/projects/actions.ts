"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { action } from "@/server/action";
import { projectAccess } from "@/server/authz";
import * as svc from "./service";
import { automationsSchema, createProjectSchema, labelSchema, memberSchema, removeMemberSchema, updateProjectSchema, workflowSchema } from "./schemas";

const refresh = () => revalidatePath("/", "layout");

export const createProjectAction = action(createProjectSchema, async (i, ctx) => {
  const p = await svc.createProject(ctx, i);
  (await cookies()).set("pilotage-project", p.key, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31536000 });
  refresh();
  return { key: p.key };
});
export const updateProjectAction = action(updateProjectSchema, async (i, ctx) => {
  await svc.updateProject(ctx, i);
  refresh();
});
export const upsertMemberAction = action(memberSchema, async (i, ctx) => {
  await svc.upsertMember(ctx, i);
  refresh();
});
export const removeMemberAction = action(removeMemberSchema, async (i, ctx) => {
  await svc.removeMember(ctx, i);
  refresh();
});
export const saveWorkflowAction = action(workflowSchema, async (i, ctx) => {
  await svc.saveWorkflow(ctx, i);
  refresh();
});
export const saveAutomationsAction = action(automationsSchema, async (i, ctx) => {
  await svc.saveAutomations(ctx, i);
  refresh();
});
export const createLabelAction = action(labelSchema, async (i, ctx) => {
  const l = await svc.createLabel(ctx, i);
  refresh();
  return l;
});
/** Projet courant (sélecteur) : vérifié côté serveur avant d'être mémorisé. */
export const switchProjectAction = action(z.object({ key: z.string().max(10) }), async (i, ctx) => {
  const a = await projectAccess(ctx, { key: i.key });
  (await cookies()).set("pilotage-project", a.project.key, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 31536000 });
  return a.project.key;
});

/** Données des formulaires de ticket pour un projet (membres, sprints, épopées, étiquettes, statuts). */
export const projectFormDataAction = action(z.object({ projectId: z.string().cuid() }), async (i, ctx) => {
  const access = await projectAccess(ctx, { id: i.projectId });
  const { db } = await import("@/server/db");
  const [members, sprints, epics, parents, labels, statuses] = await Promise.all([
    svc.projectMembers(ctx, i.projectId),
    db.sprint.findMany({ where: { projectId: i.projectId, status: { not: "COMPLETED" } }, select: { id: true, name: true, status: true }, orderBy: { startDate: "asc" } }),
    db.issue.findMany({ where: { projectId: i.projectId, type: "EPIC", archivedAt: null }, select: { id: true, key: true, title: true }, orderBy: { rank: "asc" } }),
    db.issue.findMany({ where: { projectId: i.projectId, type: { in: ["STORY", "TASK", "BUG"] }, archivedAt: null, status: { category: { not: "DONE" } } }, select: { id: true, key: true, title: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.label.findMany({ where: { projectId: i.projectId }, orderBy: { name: "asc" } }),
    db.workflowStatus.findMany({ where: { projectId: i.projectId }, orderBy: { position: "asc" }, select: { id: true, name: true, category: true } }),
  ]);
  return { permissions: access.permissions, members, sprints, epics, parents, labels, statuses };
});
