import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

/** Journal d'audit des actions administratives et sensibles. */
export async function audit(
  entry: { orgId: string; actorId?: string | null; action: string; targetType: string; targetId?: string | null; data?: Prisma.InputJsonValue; ip?: string | null },
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({
    data: { orgId: entry.orgId, actorId: entry.actorId ?? null, action: entry.action, targetType: entry.targetType, targetId: entry.targetId ?? null, data: entry.data ?? {}, ip: entry.ip ?? null },
  });
}
