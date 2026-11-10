"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { GitPullRequest, Sparkles, X } from "lucide-react";
import { draftReleaseNotesAction, setReleaseIssuesAction, updateReleaseAction } from "@/modules/releases/actions";
import { releaseStatusLabels } from "@/lib/labels";
import { formatDate, toDateInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { IssueKey, IssueTypeIcon, StatusBadge, UserAvatar } from "@/components/pilotage/meta";
import { useIssuePanel } from "@/components/pilotage/issue-panel";

interface Props {
  release: { id: string; name: string; version: string; status: "PLANNED" | "IN_PROGRESS" | "RELEASED" | "CANCELLED"; plannedDate: string | null; releasedAt: string | null; notes: string };
  notesHtml: string;
  issues: { id: string; key: string; title: string; type: string; status: { name: string; category: string }; assignee: { id: string; name: string | null; email: string; image: string | null } | null; githubLinks: { pullRequest: { number: number; title: string; state: string; url: string; repository: { fullName: string } } | null }[] }[];
  candidates: { id: string; key: string; title: string; status: { name: string; category: string } }[];
  canManage: boolean;
}

export function ReleaseClient({ release, notesHtml, issues, candidates, canManage }: Props) {
  const router = useRouter();
  const panel = useIssuePanel();
  const [editing, setEditing] = React.useState(false);
  const [notes, setNotes] = React.useState(release.notes);
  const [adding, setAdding] = React.useState("");
  const done = issues.filter((i) => i.status.category === "DONE").length;
  const prs = issues.flatMap((i) => i.githubLinks.map((l) => l.pullRequest).filter(Boolean));
  const save = async (patch: Parameters<typeof updateReleaseAction>[0], msg: string) => {
    const r = await updateReleaseAction(patch);
    if (!r.ok) return void toast.error(r.error), false;
    toast.success(msg);
    router.refresh();
    return true;
  };
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        <Card className="overflow-hidden">
          <CardHeader><div><CardTitle>Tickets inclus ({issues.length})</CardTitle><CardDescription>{done} terminé(s)</CardDescription></div></CardHeader>
          <ul className="divide-y">
            {issues.map((i) => (
              <li key={i.id} className="flex items-center gap-2.5 px-4 py-2">
                <IssueTypeIcon type={i.type as never} />
                <IssueKey issueKey={i.key} done={i.status.category === "DONE"} className="w-20 shrink-0" />
                <button type="button" onClick={() => panel.open(i.key)} className="min-w-0 flex-1 truncate text-left text-body hover:underline">{i.title}</button>
                {i.githubLinks.some((l) => l.pullRequest) && <GitPullRequest className="size-4 text-muted-foreground" aria-label="PR liée" />}
                <StatusBadge name={i.status.name} category={i.status.category} />
                <UserAvatar user={i.assignee} size="xs" />
                {canManage && <Button size="icon-xs" variant="ghost" aria-label={`Retirer ${i.key} de la version`} onClick={async () => { const r = await setReleaseIssuesAction({ releaseId: release.id, issueIds: [i.id], attach: false }); if (!r.ok) toast.error(r.error); else router.refresh(); }}><X aria-hidden /></Button>}
              </li>
            ))}
            {!issues.length && <li className="px-4 py-4 text-body-sm text-muted-foreground">Aucun ticket dans cette version.</li>}
          </ul>
          {canManage && candidates.length > 0 && (
            <div className="flex items-center gap-2 border-t px-4 py-2">
              <Select value={adding} onValueChange={setAdding}>
                <SelectTrigger size="sm" className="flex-1" aria-label="Ajouter un ticket"><SelectValue placeholder="Ajouter un ticket à la version…" /></SelectTrigger>
                <SelectContent>{candidates.map((c) => <SelectItem key={c.id} value={c.id}>{c.key} · {c.title}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="secondary" disabled={!adding} onClick={async () => { const r = await setReleaseIssuesAction({ releaseId: release.id, issueIds: [adding], attach: true }); if (!r.ok) return void toast.error(r.error); setAdding(""); router.refresh(); }}>Ajouter</Button>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader>
            <div><CardTitle>Notes de version</CardTitle><CardDescription>Brouillon généré à partir des tickets terminés, modifiable librement.</CardDescription></div>
            {canManage && !editing && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={async () => { const r = await draftReleaseNotesAction({ releaseId: release.id }); if (!r.ok) return void toast.error(r.error); setNotes(r.data); setEditing(true); }}><Sparkles aria-hidden />Générer un brouillon</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Modifier</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {editing ? (
              <div className="flex flex-col gap-2">
                <label htmlFor="rel-notes" className="sr-only">Notes de version (Markdown)</label>
                <Textarea id="rel-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={14} className="font-mono text-body-sm" />
                <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => (setNotes(release.notes), setEditing(false))}>Annuler</Button><Button size="sm" variant="primary" onClick={async () => (await save({ releaseId: release.id, notes }, "Notes enregistrées")) && setEditing(false)}>Enregistrer</Button></div>
              </div>
            ) : notesHtml ? <div className="prose-pilotage" dangerouslySetInnerHTML={{ __html: notesHtml }} /> : <p className="text-body-sm text-muted-foreground">Aucune note pour l&apos;instant.</p>}
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader><CardTitle>Statut</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Select value={release.status} disabled={!canManage} onValueChange={(v) => save({ releaseId: release.id, status: v as never }, "Statut mis à jour")}>
              <SelectTrigger aria-label="Statut de la version"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(releaseStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Date prévue
              <Input type="date" disabled={!canManage} defaultValue={toDateInput(release.plannedDate)} onBlur={(e) => e.target.value !== toDateInput(release.plannedDate) && save({ releaseId: release.id, plannedDate: e.target.value || null }, "Date mise à jour")} />
            </label>
            <p className="text-body-sm text-muted-foreground">{release.releasedAt ? `Publiée le ${formatDate(release.releasedAt)}` : "Non publiée"}</p>
            <Progress value={issues.length ? (done / issues.length) * 100 : 0} tone="termine" label="Avancement de la version" />
            <p className="text-caption text-muted-foreground">Passer la version à « Publiée » enregistre la date réelle. La création d&apos;une release GitHub reste une action manuelle sur GitHub.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pull requests liées ({prs.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {prs.map((pr) => <li key={pr!.url}><a href={pr!.url} target="_blank" rel="noopener noreferrer" className="block truncate text-body-sm hover:underline"><span className="font-mono text-caption text-muted-foreground">#{pr!.number}</span> {pr!.title}</a></li>)}
              {!prs.length && <li className="text-body-sm text-muted-foreground">Aucune.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
