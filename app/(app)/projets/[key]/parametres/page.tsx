import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { AppError } from "@/server/errors";
import { db } from "@/server/db";
import { getProject } from "@/modules/projects/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { plain } from "@/lib/serialize";
import { ProjectSettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Paramètres du projet" };

export default async function ProjectSettings({ params }: { params: Promise<{ key: string }> }) {
  const ctx = await requirePageCtx();
  const { key } = await params;
  const d = await getProject(ctx, key).catch((e) => {
    if (e instanceof AppError) notFound();
    throw e;
  });
  if (!d.can("project.manage") && !d.can("workflow.manage")) notFound();
  const orgUsers = await db.user.findMany({ where: { memberships: { some: { orgId: ctx.orgId, status: { not: "DEACTIVATED" } } } }, select: { id: true, name: true, email: true, image: true, memberships: { where: { orgId: ctx.orgId }, select: { role: true } } }, orderBy: { name: "asc" } });
  const counts = await db.issue.groupBy({ by: ["statusId"], where: { projectId: d.project.id }, _count: true });
  return (
    <>
      <PageHeader title="Paramètres du projet" breadcrumbs={[{ label: "Projets", href: "/projets" }, { label: d.project.name, href: `/projets/${key}` }, { label: "Paramètres" }]} />
      <PageBody className="max-w-4xl">
        <ProjectSettingsClient
          project={plain(d.project)}
          orgUsers={orgUsers.map((u) => ({ id: u.id, name: u.name, email: u.email, image: u.image, orgRole: u.memberships[0]?.role ?? "DEVELOPER" }))}
          statusCounts={Object.fromEntries(counts.map((c) => [c.statusId, c._count]))}
          perms={{ manage: d.can("project.manage"), members: d.can("members.manage"), workflow: d.can("workflow.manage") }}
        />
      </PageBody>
    </>
  );
}
