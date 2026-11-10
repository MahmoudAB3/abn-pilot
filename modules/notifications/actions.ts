"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action } from "@/server/action";
import { listNotifications, markRead, updatePrefs } from "./service";
import { revokeSessions } from "@/modules/admin/service";

export const listNotificationsAction = action(z.object({ unreadOnly: z.boolean().optional(), cursor: z.string().optional() }), async (i, ctx) => listNotifications(ctx, i));
export const markReadAction = action(z.object({ ids: z.union([z.array(z.string().cuid()).max(100), z.literal("all")]) }), async (i, ctx) => {
  await markRead(ctx, i.ids);
  revalidatePath("/", "layout");
});
const bool = z.boolean().optional();
export const updatePrefsAction = action(
  z.object({ ASSIGNED: bool, MENTIONED: bool, STATUS_CHANGED: bool, COMMENTED: bool, PR_ACTIVITY: bool, locale: z.enum(["fr", "en"]).optional() }),
  async ({ locale, ...prefs }, ctx) => {
    await updatePrefs(ctx, prefs);
    if (locale) {
      const { db } = await import("@/server/db");
      await db.user.update({ where: { id: ctx.userId }, data: { locale } });
    }
    revalidatePath("/", "layout");
  },
);
export const revokeMySessionsAction = action(z.object({}), async (_i, ctx) => revokeSessions(ctx, ctx.userId));
