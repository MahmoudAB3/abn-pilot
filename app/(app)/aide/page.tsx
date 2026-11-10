import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";

export const metadata: Metadata = { title: "Aide" };

const shortcuts = [
  [["C"], "Créer un ticket"], [["⌘", "K"], "Recherche globale (Ctrl + K sous Windows)"], [["/"], "Recherche globale"],
  [["Entrée"], "Ouvrir le ticket sélectionné (tableau, listes)"], [["Maj", "←/→"], "Déplacer la carte vers la colonne voisine"],
  [["Espace"], "Saisir / déposer une carte au clavier"], [["Échap"], "Fermer le panneau ou annuler le déplacement"],
] as const;

export default function Help() {
  return (
    <>
      <PageHeader title="Aide" description="ABNSoft Pilotage — l'essentiel pour bien démarrer." />
      <PageBody className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Raccourcis clavier</CardTitle></CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-2">
              {shortcuts.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-body-sm"><dt className="text-fg-secondary">{label}</dt><dd className="flex shrink-0 gap-1">{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</dd></div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Relier GitHub à un ticket</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-body-sm text-fg-secondary">
            <p>Mentionnez la clé du ticket (ex. <code className="font-mono">ERP-14</code>) :</p>
            <ul className="list-disc pl-5">
              <li>dans le message de commit : <code className="font-mono">ERP-14 Ajouter le middleware</code> ;</li>
              <li>dans le titre ou la description de la PR : <code className="font-mono">ERP-14: …</code> ;</li>
              <li>dans le nom de branche : <code className="font-mono">feature/ERP-14-auth</code> (copiable depuis le ticket).</li>
            </ul>
            <p>Les commits et PR apparaissent dans le ticket en quelques secondes, si le dépôt est lié au projet.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Rôles</CardTitle></CardHeader>
          <CardContent className="text-body-sm text-fg-secondary">
            <ul className="flex flex-col gap-1.5">
              <li><strong>Administrateur</strong> : utilisateurs, projets, intégrations, workflows.</li>
              <li><strong>Product Owner / Chef de projet</strong> : projets, backlog, sprints, priorités, versions.</li>
              <li><strong>Développeur</strong> : crée et met à jour les tickets, les déplace, commente, saisit du temps.</li>
              <li><strong>Observateur / Direction</strong> : lecture seule, rapports et avancement.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Cycle d&apos;un sprint</CardTitle></CardHeader>
          <CardContent className="text-body-sm text-fg-secondary">
            <ol className="list-decimal pl-5">
              <li>Prioriser le backlog (glisser-déposer) et estimer en story points.</li>
              <li>Créer un sprint, y glisser les tickets, le démarrer (l&apos;engagement est figé).</li>
              <li>Suivre le tableau et le burndown (relevés quotidiens réels).</li>
              <li>Terminer le sprint : le travail non terminé est reporté au sprint suivant ou au backlog.</li>
            </ol>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}
