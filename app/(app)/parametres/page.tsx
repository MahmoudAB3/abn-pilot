import type { Metadata } from "next";
import { requirePageCtx } from "@/server/session";
import { db } from "@/server/db";
import { prefsOf } from "@/modules/notifications/service";
import { PageBody } from "@/components/layout/page-header";
import { roleLabels } from "@/lib/labels";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ProfileSettings() {
  const ctx = await requirePageCtx();
  const u = await db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, email: true, image: true, locale: true, notificationPrefs: true, lastLoginAt: true, _count: { select: { sessions: true } } } });
  return (
    <PageBody className="max-w-prose">
      <ProfileClient user={{ name: u.name ?? u.email, email: u.email, image: u.image, role: roleLabels[ctx.role], locale: u.locale === "en" ? "en" : "fr", sessions: u._count.sessions }} prefs={prefsOf(u.notificationPrefs)} />
    </PageBody>
  );
}
