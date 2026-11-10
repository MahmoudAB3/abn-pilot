import { cookies } from "next/headers";
import { requirePageCtx } from "@/server/session";
import { db } from "@/server/db";
import { orgCan, visibleProjectsWhere } from "@/server/authz";
import { roleLabels } from "@/lib/labels";
import { AppShell } from "@/components/layout/app-shell";
import { I18nProvider } from "@/lib/i18n";
import { IssuePanelProvider } from "@/components/pilotage/issue-panel";
import { CreateIssueProvider } from "@/components/pilotage/create-issue";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageCtx();
  const [user, projects] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, name: true, email: true, image: true, locale: true } }),
    db.project.findMany({ where: { ...visibleProjectsWhere(ctx), status: { not: "ARCHIVED" } }, select: { id: true, key: true, name: true, members: { where: { userId: ctx.userId }, select: { role: true } } }, orderBy: { name: "asc" } }),
  ]);
  const cookieKey = (await cookies()).get("pilotage-project")?.value;
  const current = projects.find((p) => p.key === cookieKey) ?? projects[0] ?? null;
  // Création de tickets : projets où l'utilisateur n'est pas observateur
  const creatable = ctx.role === "VIEWER" ? [] : projects.filter((p) => ctx.role === "ADMIN" || (p.members[0] && p.members[0].role !== "VIEWER"));
  const lite = (p: (typeof projects)[number]) => ({ id: p.id, key: p.key, name: p.name });
  return (
    <I18nProvider locale={user.locale === "en" ? "en" : "fr"}>
      <IssuePanelProvider>
          <CreateIssueProvider projects={creatable.map(lite)} currentProjectId={current?.id}>
            <AppShell
              user={{ id: user.id, name: user.name ?? user.email, email: user.email, image: user.image, role: ctx.role, roleLabel: roleLabels[ctx.role] }}
              projects={projects.map(lite)}
              currentProject={current ? lite(current) : null}
              canManageOrg={orgCan(ctx, "org.manage")}
              canCreate={creatable.length > 0}
            >
              {children}
            </AppShell>
          </CreateIssueProvider>
        </IssuePanelProvider>
    </I18nProvider>
  );
}
