"use server";
import { revalidatePath } from "next/cache";
import { action } from "@/server/action";
import * as svc from "./service";
import { approveSchema, inviteSchema, requestIdSchema, roleSchema, userIdSchema } from "./schemas";

const refresh = () => revalidatePath("/", "layout");

export const inviteUserAction = action(inviteSchema, async (i, ctx) => {
  await svc.inviteUser(ctx, i);
  refresh();
});
export const approveRequestAction = action(approveSchema, async (i, ctx) => {
  await svc.approveRequest(ctx, i);
  refresh();
});
export const rejectRequestAction = action(requestIdSchema, async (i, ctx) => {
  await svc.rejectRequest(ctx, i.requestId);
  refresh();
});
export const changeRoleAction = action(roleSchema, async (i, ctx) => {
  await svc.changeRole(ctx, i);
  refresh();
});
export const deactivateUserAction = action(userIdSchema, async (i, ctx) => {
  await svc.deactivateUser(ctx, i.userId);
  refresh();
});
export const reactivateUserAction = action(userIdSchema, async (i, ctx) => {
  await svc.reactivateUser(ctx, i.userId);
  refresh();
});
export const revokeSessionsAction = action(userIdSchema, async (i, ctx) => {
  const n = await svc.revokeSessions(ctx, i.userId);
  refresh();
  return n;
});
