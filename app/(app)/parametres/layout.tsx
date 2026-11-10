import { requirePageCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageCtx();
  const admin = orgCan(ctx, "users.manage");
  const items = [
    { href: "/parametres", label: "Profil et notifications" },
    ...(admin ? [{ href: "/parametres/utilisateurs", label: "Utilisateurs et accès" }, { href: "/parametres/github", label: "Intégration GitHub" }, { href: "/parametres/audit", label: "Journal d'audit" }] : []),
  ];
  return (
    <>
      <PageHeader title="Paramètres" description="ABNSoft Pilotage · configuration de votre compte et de l'organisation.">
        <SettingsNav items={items} />
      </PageHeader>
      {children}
    </>
  );
}
