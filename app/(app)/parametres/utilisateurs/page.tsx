import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { db } from "@/server/db";
import { listUsers } from "@/modules/admin/service";
import { allowedDomains } from "@/server/env";
import { PageBody } from "@/components/layout/page-header";
import { plain } from "@/lib/serialize";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Utilisateurs et accès" };

export default async function UsersPage() {
  const ctx = await requirePageCtx();
  if (!orgCan(ctx, "users.manage")) notFound();
  const [{ members, requests }, projects] = await Promise.all([listUsers(ctx), db.project.findMany({ where: { orgId: ctx.orgId, status: { not: "ARCHIVED" } }, select: { id: true, key: true, name: true }, orderBy: { name: "asc" } })]);
  return (
    <PageBody>
      <UsersClient members={plain(members)} requests={plain(requests)} projects={projects} me={ctx.userId} domains={allowedDomains()} />
    </PageBody>
  );
}
