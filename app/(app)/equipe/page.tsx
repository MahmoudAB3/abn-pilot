import type { Metadata } from "next";
import Link from "next/link";
import { requirePageCtx } from "@/server/session";
import { teamDirectory } from "@/modules/admin/service";
import { orgCan } from "@/server/authz";
import { db } from "@/server/db";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/pilotage/meta";
import { roleLabels, projectRoleLabels } from "@/lib/labels";
import { plain } from "@/lib/serialize";

export const metadata: Metadata = { title: "Équipe" };

export default async function Team() {
  const ctx = await requirePageCtx();
  const members = await teamDirectory(ctx);
  const load = await db.$queryRaw<{ assigneeId: string; open: bigint; points: bigint }[]>`
    SELECT i."assigneeId", count(*) AS open, coalesce(sum(i."storyPoints"), 0) AS points
    FROM "Issue" i JOIN "WorkflowStatus" s ON s.id = i."statusId" JOIN "Sprint" sp ON sp.id = i."sprintId"
    WHERE i."archivedAt" IS NULL AND s.category <> 'DONE' AND sp.status = 'ACTIVE' AND i."assigneeId" IS NOT NULL
    GROUP BY i."assigneeId"`;
  const byUser = new Map(load.map((l) => [l.assigneeId, l]));
  return (
    <>
      <PageHeader title="Équipe" description={`${members.length} membres actifs · charge calculée sur les sprints actifs`} actions={orgCan(ctx, "users.manage") ? <Button size="sm" variant="secondary" asChild><Link href="/parametres/utilisateurs">Gérer les accès</Link></Button> : undefined} />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => {
            const l = byUser.get(m.userId);
            return (
              <Card key={m.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <UserAvatar user={plain(m.user)} size="lg" decorative />
                  <div className="min-w-0">
                    <p className="truncate text-h3 font-semibold">{m.user.name ?? m.user.email}</p>
                    <p className="truncate text-body-sm text-muted-foreground">{roleLabels[m.role]}</p>
                    <a href={`mailto:${m.user.email}`} className="truncate text-caption text-primary-text hover:underline">{m.user.email}</a>
                  </div>
                </div>
                <p className="text-body-sm text-fg-secondary">{l ? <><strong className="tabular-nums">{Number(l.open)}</strong> ticket(s) ouvert(s) · <strong className="tabular-nums">{Number(l.points)}</strong> pts dans le sprint</> : "Aucun ticket ouvert dans un sprint actif"}</p>
                <div className="flex flex-wrap gap-1">
                  {m.user.projectMembers.map((p) => <Link key={p.project.key} href={`/projets/${p.project.key}`} className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-caption text-fg-secondary hover:underline" title={projectRoleLabels[p.role]}>{p.project.key}{p.role === "LEAD" ? " · resp." : ""}</Link>)}
                </div>
              </Card>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
