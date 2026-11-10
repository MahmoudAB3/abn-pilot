"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/server/action";
import * as svc from "./service";

const id = z.string().cuid();
const refresh = () => revalidatePath("/", "layout");

export const linkRepositoryAction = action(z.object({ projectId: id, repositoryId: id }), async (i, ctx) => {
  await svc.linkRepository(ctx, i);
  refresh();
});
export const unlinkRepositoryAction = action(z.object({ projectId: id, repositoryId: id }), async (i, ctx) => {
  await svc.unlinkRepository(ctx, i);
  refresh();
});
export const triggerSyncAction = action(z.object({ repositoryId: id }), async (i, ctx) => {
  await svc.triggerSync(ctx, i.repositoryId);
  refresh();
});
export const retryEventAction = action(z.object({ eventId: id }), async (i, ctx) => {
  await svc.retryFailedEvent(ctx, i.eventId);
  refresh();
});
export const disconnectInstallationAction = action(z.object({ installationId: id }), async (i, ctx) => {
  await svc.disconnectInstallation(ctx, i.installationId);
  refresh();
});
