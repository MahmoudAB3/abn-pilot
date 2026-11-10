import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { requirePageCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { db } from "@/server/db";
import { listProjects } from "@/modules/projects/service";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectCard } from "@/components/pilotage/project-bits";
import { plain } from "@/lib/serialize";
import { NewProjectDialog } from "./new-project-dialog";

export const metadata: Metadata = { title: "Projets" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ archives?: string }> }) {
  const ctx = await requirePageCtx();
  const sp = await searchParams;
  const projects = await listProjects(ctx, { includeArchived: sp.archives === "1" });
  const canCreate = orgCan(ctx, "projects.create");
  const users = canCreate
    ? await db.user.findMany({ where: { id: { not: ctx.userId }, memberships: { some: { orgId: ctx.orgId, status: { not: "DEACTIVATED" } } } }, select: { id: true, name: true, email: true, image: true }, orderBy: { name: "asc" } })
    : [];
  return (
    <>
      <PageHeader
        title="Projets"
        description={`${projects.length} projet${projects.length > 1 ? "s" : ""}${sp.archives === "1" ? " (archives incluses)" : " actifs"}`}
        actions={
          <>
            <a href={sp.archives === "1" ? "/projets" : "/projets?archives=1"} className="text-body-sm text-primary-text hover:underline">{sp.archives === "1" ? "Masquer les archives" : "Afficher les archives"}</a>
            {canCreate && <NewProjectDialog users={users} />}
          </>
        }
      />
      <PageBody>
        {projects.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((p) => <ProjectCard key={p.id} p={plain(p)} />)}
          </div>
        ) : (
          <EmptyState icon={<FolderKanban />} title="Aucun projet" description={canCreate ? "Créez votre premier projet pour commencer à planifier." : "Un Product Owner ou un administrateur doit vous ajouter à un projet."} action={canCreate ? <NewProjectDialog users={users} /> : undefined} />
        )}
      </PageBody>
    </>
  );
}
