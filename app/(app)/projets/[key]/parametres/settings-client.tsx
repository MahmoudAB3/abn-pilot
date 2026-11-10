"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { categoryLabels, projectRoleLabels, projectStatusLabels } from "@/lib/labels";
import { labelColors } from "@/lib/domain";
import { toDateInput } from "@/lib/format";
import { displayName } from "@/lib/serialize";
import { createLabelAction, removeMemberAction, saveAutomationsAction, saveWorkflowAction, updateProjectAction, upsertMemberAction } from "@/modules/projects/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { LabelChip, StatusBadge, UserName } from "@/components/pilotage/meta";

type Cat = keyof typeof categoryLabels;
interface P {
  project: {
    id: string; key: string; name: string; description: string; leadId: string | null; status: "ACTIVE" | "ON_HOLD" | "ARCHIVED"; targetDate: string | null;
    autoReviewOnPrOpen: boolean; autoInProgressOnChangesAsked: boolean; autoOnMergeCategory: Cat | null;
    statuses: { id: string; name: string; category: Cat; wipLimit: number | null }[];
    labels: { id: string; name: string; color: string }[];
    members: { userId: string; role: "LEAD" | "MEMBER" | "VIEWER"; user: { id: string; name: string | null; email: string; image: string | null } }[];
  };
  orgUsers: { id: string; name: string | null; email: string; image: string | null; orgRole: string }[];
  statusCounts: Record<string, number>;
  perms: { manage: boolean; members: boolean; workflow: boolean };
}

export function ProjectSettingsClient({ project, orgUsers, statusCounts, perms }: P) {
  const router = useRouter();
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) => {
    const r = await fn();
    if (!r.ok) toast.error(r.error ?? "Erreur");
    else {
      toast.success(msg);
      router.refresh();
    }
    return r.ok;
  };
  const [statuses, setStatuses] = React.useState(project.statuses.map((s) => ({ ...s })));
  React.useEffect(() => setStatuses(project.statuses.map((s) => ({ ...s }))), [project.statuses]);
  const [auto, setAuto] = React.useState({ autoReviewOnPrOpen: project.autoReviewOnPrOpen, autoInProgressOnChangesAsked: project.autoInProgressOnChangesAsked, autoOnMergeCategory: project.autoOnMergeCategory as "IN_TEST" | "DONE" | null });
  const [newMember, setNewMember] = React.useState("");
  const candidates = orgUsers.filter((u) => !project.members.some((m) => m.userId === u.id));
  const move = (i: number, d: -1 | 1) => setStatuses((s) => { const n = [...s]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); return n; });

  return (
    <div className="flex flex-col gap-4">
      {perms.manage && (
        <Card>
          <form onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await run(() => updateProjectAction({ projectId: project.id, name: String(f.get("name")), description: String(f.get("description")), leadId: String(f.get("lead")) || null, status: f.get("status") as never, targetDate: (f.get("target") as string) || null }), "Projet mis à jour"); }}>
            <CardHeader><div><CardTitle>Informations</CardTitle><CardDescription>La clé <span className="font-mono">{project.key}</span> est immuable : les clés de tickets restent stables.</CardDescription></div></CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5"><Label htmlFor="ps-name">Nom</Label><Input id="ps-name" name="name" defaultValue={project.name} required minLength={2} maxLength={80} /></div>
              <div className="flex flex-col gap-1.5"><Label htmlFor="ps-desc">Description</Label><Textarea id="ps-desc" name="description" defaultValue={project.description} rows={3} /></div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5"><Label htmlFor="ps-lead">Responsable</Label>
                  <select id="ps-lead" name="lead" defaultValue={project.leadId ?? ""} className="h-8 rounded-md border border-input bg-card px-2 text-body">{project.members.filter((m) => m.role !== "VIEWER").map((m) => <option key={m.userId} value={m.userId}>{displayName(m.user)}</option>)}</select>
                </div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="ps-status">Statut</Label>
                  <select id="ps-status" name="status" defaultValue={project.status} className="h-8 rounded-md border border-input bg-card px-2 text-body">{Object.entries(projectStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                </div>
                <div className="flex flex-col gap-1.5"><Label htmlFor="ps-target">Date cible</Label><Input id="ps-target" name="target" type="date" defaultValue={toDateInput(project.targetDate)} /></div>
              </div>
            </CardContent>
            <CardFooter className="justify-end"><Button type="submit" variant="primary">Enregistrer</Button></CardFooter>
          </form>
        </Card>
      )}

      {perms.members && (
        <Card className="overflow-hidden">
          <CardHeader><div><CardTitle>Membres ({project.members.length})</CardTitle><CardDescription>Un membre « observateur » a un accès en lecture seule à ce projet.</CardDescription></div></CardHeader>
          <ul className="divide-y border-t">
            {project.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 text-body-sm"><UserName user={m.user} size="sm" /></span>
                <Select value={m.role} disabled={orgUsers.find((u) => u.id === m.userId)?.orgRole === "VIEWER"} onValueChange={(v) => run(() => upsertMemberAction({ projectId: project.id, userId: m.userId, role: v as never }), "Rôle mis à jour")}>
                  <SelectTrigger size="sm" className="w-40" aria-label={`Rôle de ${displayName(m.user)}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(projectRoleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon-sm" variant="ghost" aria-label={`Retirer ${displayName(m.user)}`} onClick={() => run(() => removeMemberAction({ projectId: project.id, userId: m.userId }), "Membre retiré")}><Trash2 aria-hidden /></Button>
              </li>
            ))}
          </ul>
          {candidates.length > 0 && (
            <CardFooter>
              <Select value={newMember} onValueChange={setNewMember}>
                <SelectTrigger size="sm" className="flex-1" aria-label="Ajouter un membre"><SelectValue placeholder="Ajouter un membre…" /></SelectTrigger>
                <SelectContent>{candidates.map((u) => <SelectItem key={u.id} value={u.id}>{displayName(u)}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="secondary" disabled={!newMember} onClick={async () => { const u = orgUsers.find((x) => x.id === newMember); if (await run(() => upsertMemberAction({ projectId: project.id, userId: newMember, role: u?.orgRole === "VIEWER" ? "VIEWER" : "MEMBER" }), "Membre ajouté")) setNewMember(""); }}><Plus aria-hidden />Ajouter</Button>
            </CardFooter>
          )}
        </Card>
      )}

      {perms.workflow && (
        <Card>
          <CardHeader><div><CardTitle>Workflow</CardTitle><CardDescription>Colonnes du tableau. La catégorie pilote les rapports et les automatisations ; un statut ne peut être supprimé que s&apos;il est vide.</CardDescription></div></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {statuses.map((s, i) => (
              <div key={s.id ?? `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5">
                <div className="flex flex-col"><Button size="icon-xs" variant="ghost" disabled={i === 0} aria-label="Monter" onClick={() => move(i, -1)}><ArrowUp aria-hidden /></Button><Button size="icon-xs" variant="ghost" disabled={i === statuses.length - 1} aria-label="Descendre" onClick={() => move(i, 1)}><ArrowDown aria-hidden /></Button></div>
                <Input value={s.name} onChange={(e) => setStatuses((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label="Nom du statut" className="h-7 w-44" maxLength={40} />
                <Select value={s.category} onValueChange={(v) => setStatuses((x) => x.map((y, j) => (j === i ? { ...y, category: v as Cat } : y)))}>
                  <SelectTrigger size="sm" className="w-36" aria-label="Catégorie"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(categoryLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} max={99} value={s.wipLimit ?? ""} onChange={(e) => setStatuses((x) => x.map((y, j) => (j === i ? { ...y, wipLimit: e.target.value ? Number(e.target.value) : null } : y)))} aria-label="Limite WIP" placeholder="WIP" className="h-7 w-20" />
                <StatusBadge name={s.name || "—"} category={s.category} />
                <span className="ml-auto text-caption text-muted-foreground tabular-nums">{s.id ? `${statusCounts[s.id] ?? 0} ticket(s)` : "nouveau"}</span>
                <Button size="icon-xs" variant="ghost" aria-label="Supprimer le statut" disabled={!!(s.id && statusCounts[s.id])} onClick={() => setStatuses((x) => x.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
              </div>
            ))}
            <div className="flex justify-between">
              <Button size="sm" variant="ghost" onClick={() => setStatuses((x) => [...x, { id: undefined as unknown as string, name: "", category: "IN_PROGRESS", wipLimit: null }])}><Plus aria-hidden />Ajouter un statut</Button>
              <Button size="sm" variant="primary" onClick={() => run(() => saveWorkflowAction({ projectId: project.id, statuses: statuses.map((s) => ({ id: s.id || undefined, name: s.name, category: s.category, wipLimit: s.wipLimit })) }), "Workflow enregistré")}>Enregistrer le workflow</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {perms.workflow && (
        <Card>
          <CardHeader><div><CardTitle>Automatisations GitHub</CardTitle><CardDescription>Désactivées par défaut. Un ticket n&apos;est jamais déplacé sans règle explicite, et jamais vers un statut moins avancé (sauf « modifications demandées »).</CardDescription></div></CardHeader>
          <CardContent className="divide-y">
            <div className="flex items-start justify-between gap-4 py-3"><div><Label htmlFor="au-1" className="text-body font-medium text-foreground">PR ouverte → « En revue »</Label><p className="text-body-sm text-muted-foreground">Quand une PR non brouillon référençant le ticket est ouverte.</p></div><Switch id="au-1" checked={auto.autoReviewOnPrOpen} onCheckedChange={(v) => setAuto((a) => ({ ...a, autoReviewOnPrOpen: v }))} /></div>
            <div className="flex items-start justify-between gap-4 py-3"><div><Label htmlFor="au-2" className="text-body font-medium text-foreground">Modifications demandées → « En cours »</Label><p className="text-body-sm text-muted-foreground">Quand une revue demande des changements (depuis « En revue » ou « En test »).</p></div><Switch id="au-2" checked={auto.autoInProgressOnChangesAsked} onCheckedChange={(v) => setAuto((a) => ({ ...a, autoInProgressOnChangesAsked: v }))} /></div>
            <div className="flex flex-wrap items-start justify-between gap-4 py-3">
              <div><Label htmlFor="au-3" className="text-body font-medium text-foreground">PR fusionnée →</Label><p className="text-body-sm text-muted-foreground">Destination du ticket à la fusion de la PR.</p></div>
              <Select value={auto.autoOnMergeCategory ?? "none"} onValueChange={(v) => setAuto((a) => ({ ...a, autoOnMergeCategory: v === "none" ? null : (v as "IN_TEST" | "DONE") }))}>
                <SelectTrigger id="au-3" size="sm" className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Ne rien faire</SelectItem><SelectItem value="IN_TEST">En test</SelectItem><SelectItem value="DONE">Terminé</SelectItem></SelectContent>
              </Select>
            </div>
          </CardContent>
          <CardFooter className="justify-end"><Button variant="primary" size="sm" onClick={() => run(() => saveAutomationsAction({ projectId: project.id, ...auto }), "Automatisations enregistrées")}>Enregistrer</Button></CardFooter>
        </Card>
      )}

      {perms.manage && (
        <Card>
          <CardHeader><CardTitle>Étiquettes</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">{project.labels.map((l) => <LabelChip key={l.id} name={l.name} color={l.color} />)}{!project.labels.length && <span className="text-body-sm text-muted-foreground">Aucune étiquette.</span>}</div>
            <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await run(() => createLabelAction({ projectId: project.id, name: String(f.get("name")), color: f.get("color") as never }), "Étiquette créée")) e.currentTarget.reset(); }}>
              <Input name="name" required maxLength={30} placeholder="Nouvelle étiquette" aria-label="Nom de l'étiquette" className="h-8 w-56" />
              <select name="color" aria-label="Couleur" defaultValue="bleu" className="h-8 rounded-md border border-input bg-card px-2 text-body">{labelColors.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <Button size="sm" variant="secondary" type="submit"><Plus aria-hidden />Créer</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
