"use server";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import * as svc from "./service";
import { milestoneSchema, releaseIdSchema, releaseIssuesSchema, releaseSchema, updateMilestoneSchema, updateReleaseSchema } from "./schemas";

const refresh = () => revalidatePath("/", "layout");

export const createMilestoneAction = action(milestoneSchema, async (i, ctx) => {
  await svc.createMilestone(ctx, i);
  refresh();
});
export const updateMilestoneAction = action(updateMilestoneSchema, async (i, ctx) => {
  await svc.updateMilestone(ctx, i);
  refresh();
});
export const createReleaseAction = action(releaseSchema, async (i, ctx) => {
  const r = await svc.createRelease(ctx, i);
  refresh();
  return r.id;
});
export const updateReleaseAction = action(updateReleaseSchema, async (i, ctx) => {
  await svc.updateRelease(ctx, i);
  refresh();
});
export const setReleaseIssuesAction = action(releaseIssuesSchema, async (i, ctx) => {
  await svc.setReleaseIssues(ctx, i);
  refresh();
});
export const draftReleaseNotesAction = action(releaseIdSchema, async (i, ctx) => svc.draftReleaseNotes(ctx, i.releaseId));
