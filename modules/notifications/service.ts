import type { NotificationType } from "@prisma/client";
import { db, type Tx } from "@/server/db";
import type { UserCtx } from "@/server/authz";

/** Préférences par défaut : tout activé sauf les changements de statut (souvent bruyants). */
export const defaultPrefs: Record<NotificationType, boolean> = {
  ASSIGNED: true,
  MENTIONED: true,
  STATUS_CHANGED: false,
  COMMENTED: true,
  PR_ACTIVITY: true,
};

export function prefsOf(raw: unknown): Record<NotificationType, boolean> {
  const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<NotificationType, boolean>>;
  return { ...defaultPrefs, ...p };
}

/**
 * Crée des notifications pour les destinataires qui :
 *  - ne sont pas l'auteur de l'action ;
 *  - ont accès au projet (admin actif ou membre du projet) ;
 *  - n'ont pas désactivé ce type de notification.
 */
export async function notify(
  tx: Tx,
  input: { recipientIds: (string | null | undefined)[]; type: NotificationType; actorId: string | null; issueId: string; projectId: string; title: string; body?: string },
) {
  const ids = [...new Set(input.recipientIds.filter((x): x is string => !!x && x !== input.actorId))];
  if (!ids.length) return 0;
  const users = await tx.user.findMany({
    where: {
      id: { in: ids },
      memberships: { some: { status: "ACTIVE" } },
      OR: [{ projectMembers: { some: { projectId: input.projectId } } }, { memberships: { some: { role: "ADMIN", status: "ACTIVE" } } }],
    },
    select: { id: true, notificationPrefs: true },
  });
  const targets = users.filter((u) => prefsOf(u.notificationPrefs)[input.type]);
  if (!targets.length) return 0;
  await tx.notification.createMany({
    data: targets.map((u) => ({ userId: u.id, actorId: input.actorId, type: input.type, issueId: input.issueId, title: input.title, body: input.body ?? "" })),
  });
  return targets.length;
}

export async function listNotifications(ctx: UserCtx, opts: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}) {
  const limit = opts.limit ?? 30;
  const rows = await db.notification.findMany({
    where: { userId: ctx.userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { actor: { select: { name: true, email: true, image: true } }, issue: { select: { key: true } } },
  });
  const unread = await db.notification.count({ where: { userId: ctx.userId, readAt: null } });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1]!.id : null, unread };
}

export async function markRead(ctx: UserCtx, ids: string[] | "all") {
  await db.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
}

export async function updatePrefs(ctx: UserCtx, prefs: Partial<Record<NotificationType, boolean>>) {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { notificationPrefs: true } });
  await db.user.update({ where: { id: ctx.userId }, data: { notificationPrefs: { ...prefsOf(user.notificationPrefs), ...prefs } } });
}

/** Mentions au format @[Nom](userId) insérées par l'éditeur. */
export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(/@\[[^\]]{1,80}\]\(([a-z0-9]{20,40})\)/g)].map((m) => m[1]!))];
}
