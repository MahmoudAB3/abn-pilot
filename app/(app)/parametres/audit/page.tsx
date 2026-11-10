import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageCtx } from "@/server/session";
import { orgCan } from "@/server/authz";
import { listAudit } from "@/modules/admin/service";
import { PageBody } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Journal d'audit" };

const labels: Record<string, string> = {
  "auth.login": "Connexion", "user.invite": "Invitation", "user.role.change": "Changement de rôle", "user.deactivate": "Désactivation", "user.reactivate": "Réactivation",
  "user.sessions.revoke": "Révocation des sessions", "user.request.reject": "Demande refusée", "project.create": "Création de projet", "project.update": "Modification de projet",
  "project.member.upsert": "Membre ajouté / modifié", "project.member.remove": "Membre retiré", "project.workflow.update": "Workflow modifié", "project.automations.update": "Automatisations modifiées",
  "github.repo.link": "Dépôt lié", "github.repo.unlink": "Dépôt délié", "github.sync.manual": "Synchronisation manuelle", "github.installation.connect": "Installation GitHub connectée",
  "github.installation.disconnect": "Installation GitHub déconnectée", "admin.bootstrap": "Administrateur initial créé",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ apres?: string }> }) {
  const ctx = await requirePageCtx();
  if (!orgCan(ctx, "audit.view")) notFound();
  const { items, nextCursor } = await listAudit(ctx, (await searchParams).apres);
  return (
    <PageBody>
      <Card className="overflow-hidden">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="w-44">Date</TableHead><TableHead className="w-56">Auteur</TableHead><TableHead>Action</TableHead><TableHead className="hidden lg:table-cell">Détails</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-caption text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
                <TableCell className="text-body-sm">{a.actor?.name ?? a.actor?.email ?? "Système"}</TableCell>
                <TableCell className="text-body-sm font-medium">{labels[a.action] ?? a.action}</TableCell>
                <TableCell className="hidden max-w-md truncate font-mono text-caption text-muted-foreground lg:table-cell">{JSON.stringify(a.data)}</TableCell>
              </TableRow>
            ))}
            {!items.length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Aucun évènement.</TableCell></TableRow>}
          </TableBody>
        </Table>
        {nextCursor && <div className="border-t px-4 py-2 text-right"><Link href={`/parametres/audit?apres=${nextCursor}`} className="text-body-sm text-primary-text hover:underline">Plus ancien →</Link></div>}
      </Card>
    </PageBody>
  );
}
