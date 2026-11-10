"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/server/action";
import * as svc from "./service";
import { deleteAttachment } from "./attachments";
import { assignToSprint } from "@/modules/sprints/service";
import { db } from "@/server/db";
import {
  bulkUpdateSchema, commentIdSchema, commentSchema, createIssueSchema, editCommentSchema, issueIdSchema, linkSchema,
  moveIssueSchema, removeLinkSchema, reorderSchema, savedFilterSchema, updateIssueSchema, workLogSchema,
} from "./schemas";

const refresh = () => revalidatePath("/", "layout");
const done = <T>(v: T) => {
  refresh();
  return v;
};

export const createIssueAction = action(createIssueSchema, async (i, ctx) => {
  const issue = await svc.createIssue(ctx, i);
  return done({ id: issue.id, key: issue.key });
});
export const updateIssueAction = action(updateIssueSchema, async (i, ctx) => done(await svc.updateIssue(ctx, i)));
/** Déplacement sur le tableau : pas de revalidation globale (mise à jour optimiste côté client). */
export const moveIssueAction = action(moveIssueSchema, async (i, ctx) => svc.moveIssue(ctx, i));
export const reorderIssueAction = action(reorderSchema, async (i, ctx) => svc.reorderIssue(ctx, i));
export const bulkUpdateAction = action(bulkUpdateSchema, async (i, ctx) => done(await svc.bulkUpdate(ctx, i)));
export const archiveIssueAction = action(issueIdSchema, async (i, ctx) => done(await svc.archiveIssue(ctx, i.issueId)));
export const restoreIssueAction = action(issueIdSchema, async (i, ctx) => done(await svc.restoreIssue(ctx, i.issueId)));
export const deleteIssueAction = action(issueIdSchema, async (i, ctx) => done(await svc.deleteIssue(ctx, i.issueId)));
export const duplicateIssueAction = action(issueIdSchema, async (i, ctx) => {
  const c = await svc.duplicateIssue(ctx, i.issueId);
  return done({ key: c.key });
});
export const addCommentAction = action(commentSchema, async (i, ctx) => done((await svc.addComment(ctx, i)).id));
export const editCommentAction = action(editCommentSchema, async (i, ctx) => done((await svc.editComment(ctx, i)).id));
export const deleteCommentAction = action(commentIdSchema, async (i, ctx) => done(await svc.deleteComment(ctx, i.commentId)));
export const addLinkAction = action(linkSchema, async (i, ctx) => done((await svc.addLink(ctx, i)).id));
export const removeLinkAction = action(removeLinkSchema, async (i, ctx) => done(await svc.removeLink(ctx, i.linkId)));
export const toggleWatchAction = action(issueIdSchema, async (i, ctx) => svc.toggleWatch(ctx, i.issueId));
export const logWorkAction = action(workLogSchema, async (i, ctx) => done((await svc.logWork(ctx, i)).id));
export const deleteAttachmentAction = action(z.object({ attachmentId: z.string().cuid() }), async (i, ctx) => done(await deleteAttachment(ctx, i.attachmentId)));
export const assignToSprintAction = action(z.object({ sprintId: z.string().cuid().nullable(), issueIds: z.array(z.string().cuid()).min(1).max(200) }), async (i, ctx) => done(await assignToSprint(ctx, i)));

export const saveFilterAction = action(savedFilterSchema, async (i, ctx) => {
  const f = await db.savedFilter.create({ data: { userId: ctx.userId, name: i.name, projectId: i.projectId ?? null, filters: i.filters } });
  return done(f.id);
});
export const deleteFilterAction = action(z.object({ id: z.string().cuid() }), async (i, ctx) => {
  await db.savedFilter.deleteMany({ where: { id: i.id, userId: ctx.userId } });
  return done(true);
});
