"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Flag, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorFor, labelClass } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { milestoneStatusLabels } from "@/lib/labels";
import { createMilestoneAction, updateMilestoneAction } from "@/modules/releases/actions";
import { updateIssueAction } from "@/modules/issues/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedProgress, Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/sonner";
import { useIssuePanel } from "@/components/pilotage/issue-panel";
import { IssueKey, StatusBadge } from "@/components/pilotage/meta";

interface Milestone { id: string; name: string; description: string; targetDate: string | null; status: "PLANNED" | "IN_PROGRESS" | "DONE"; epics: number; completion: number }
interface Epic { id: string; key: string; title: string; milestoneId: string | null; status: { name: string; category: string }; createdAt: string; dueDate: string | null; progress: { total: number; done: number; inProgress: number; start: string | null; end: string | null } }

function MilestoneDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setPending(true);
            const r = await createMilestoneAction({ projectId, name: String(f.get("name")), description: String(f.get("description") ?? ""), targetDate: (f.get("date") as string) || null });
            setPending(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Jalon créé");
            onOpenChange(false);
            router.refresh();
          }}
        >
          <DialogHeader><DialogTitle>Nouveau jalon</DialogTitle></DialogHeader>
          <DialogBody>
            <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Nom *<Input name="name" required minLength={2} maxLength={80} placeholder="Ex. : Version 3.2 — Stocks" /></label>
            <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Description<Textarea name="description" rows={2} /></label>
            <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Date cible<Input name="date" type="date" className="w-48" /></label>
          </DialogBody>
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button><Button type="submit" variant="primary" loading={pending}>Créer</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RoadmapClient({ projectId, milestones, epics, canManage }: { projectId: string; milestones: Milestone[]; epics: Epic[]; canManage: boolean }) {
  const router = useRouter();
  const panel = useIssuePanel();
  const [open, setOpen] = React.useState(false);
  // Fenêtre de la frise : du plus ancien début à la plus lointaine échéance (+ marge)
  const dates = [...epics.flatMap((e) => [e.progress.start ?? e.createdAt, e.dueDate ?? e.progress.end]), ...milestones.map((m) => m.targetDate)].filter(Boolean).map((d) => new Date(d!).getTime());
  const now = Date.now();
  const min = Math.min(now - 30 * 86_400_000, ...dates);
  const max = Math.max(now + 60 * 86_400_000, ...dates) + 14 * 86_400_000;
  const pos = (d: string | number) => ((new Date(d).getTime() - min) / (max - min)) * 100;
  const months: Date[] = [];
  for (let d = new Date(new Date(min).getFullYear(), new Date(min).getMonth() + 1, 1); d.getTime() < max; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(d);

  const setMilestone = async (epicId: string, milestoneId: string | null) => {
    const r = await updateIssueAction({ issueId: epicId, patch: { milestoneId } });
    if (!r.ok) return void toast.error(r.error);
    router.refresh();
  };
  const groups = [...milestones.map((m) => ({ m, items: epics.filter((e) => e.milestoneId === m.id) })), { m: null, items: epics.filter((e) => !e.milestoneId) }];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{canManage && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus aria-hidden />Nouveau jalon</Button>}</div>
      {milestones.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {milestones.map((m) => (
            <Card key={m.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-h3 font-semibold"><Flag className="size-4 text-muted-foreground" aria-hidden />{m.name}</h3>
                {canManage ? (
                  <Select value={m.status} onValueChange={async (v) => { const r = await updateMilestoneAction({ milestoneId: m.id, status: v as never }); if (!r.ok) toast.error(r.error); else router.refresh(); }}>
                    <SelectTrigger size="sm" className="w-32" aria-label="Statut du jalon"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(milestoneStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <span className="text-caption text-muted-foreground">{milestoneStatusLabels[m.status]}</span>}
              </div>
              <p className="mt-1 text-body-sm text-muted-foreground">{m.targetDate ? `Cible : ${formatDate(m.targetDate)}` : "Sans date cible"} · {m.epics} épopée(s)</p>
              {m.description && <p className="mt-1 text-body-sm text-fg-secondary">{m.description}</p>}
              <div className="mt-3 flex items-center gap-2"><Progress value={m.completion} tone={m.status === "DONE" ? "termine" : "actif"} size="sm" label={`Progression de ${m.name}`} /><span className="w-10 text-right text-caption font-semibold tabular-nums">{m.completion} %</span></div>
            </Card>
          ))}
        </div>
      )}

      {epics.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="grid min-w-[56rem] grid-cols-[18rem_1fr]">
              <div className="flex h-9 items-center border-r border-b bg-surface-subtle px-3 text-overline-caps text-muted-foreground">Épopée</div>
              <div className="relative h-9 border-b bg-surface-subtle">
                {months.map((d) => <span key={d.toISOString()} className="absolute top-0 flex h-full items-center border-l pl-2 text-overline-caps text-muted-foreground" style={{ left: `${pos(d.getTime())}%` }}>{d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}</span>)}
              </div>
              {groups.map(({ m, items }) =>
                items.length ? (
                  <React.Fragment key={m?.id ?? "none"}>
                    <div className="col-span-2 flex items-center gap-2 border-b bg-surface-subtle/60 px-3 py-1 text-caption font-semibold text-fg-secondary"><Flag className="size-3.5" aria-hidden />{m ? `${m.name}${m.targetDate ? ` · ${formatDate(m.targetDate)}` : ""}` : "Sans jalon"}</div>
                    {items.map((e) => {
                      const start = e.progress.start ?? e.createdAt;
                      // Fin : échéance de l'épopée, sinon date cible du jalon, sinon dernière échéance des tickets
                      const rawEnd = e.dueDate ?? m?.targetDate ?? e.progress.end;
                      const end = rawEnd && new Date(rawEnd).getTime() > new Date(start).getTime() + 7 * 86_400_000 ? rawEnd : new Date(new Date(start).getTime() + 30 * 86_400_000).toISOString();
                      const pct = e.progress.total ? Math.round((e.progress.done / e.progress.total) * 100) : 0;
                      return (
                        <React.Fragment key={e.id}>
                          <div className="flex h-14 flex-col justify-center gap-1 border-r border-b px-3">
                            <button type="button" onClick={() => panel.open(e.key)} className="flex min-w-0 items-center gap-2 text-left hover:underline"><IssueKey issueKey={e.key} /><span className="truncate text-body font-medium">{e.title}</span></button>
                            <div className="flex items-center gap-2"><SegmentedProgress done={e.progress.done} inProgress={e.progress.inProgress} total={Math.max(1, e.progress.total)} label={`Progression de ${e.title}`} className="h-1" /><span className="shrink-0 text-caption tabular-nums text-muted-foreground">{e.progress.done}/{e.progress.total}</span></div>
                          </div>
                          <div className="relative h-14 border-b">
                            {months.map((d) => <span key={d.toISOString()} className="absolute inset-y-0 border-l border-dashed" style={{ left: `${pos(d.getTime())}%` }} aria-hidden />)}
                            <span className="absolute inset-y-0 z-10 w-0.5 bg-destructive" style={{ left: `${pos(now)}%` }} aria-hidden />
                            {m?.targetDate && <span className="absolute top-1 z-10 -translate-x-1/2 text-caption" style={{ left: `${pos(m.targetDate)}%` }} title={`Jalon ${m.name}`} aria-hidden>◆</span>}
                            <div className={cn("absolute top-3.5 flex h-7 items-center overflow-hidden rounded-md px-2 text-caption font-semibold", labelClass[colorFor(e.key)])} style={{ left: `${pos(start)}%`, width: `${Math.max(2, pos(end) - pos(start))}%` }} title={`${e.title} : ${formatDate(start)} → ${formatDate(end)}`}>
                              <span className="absolute inset-y-0 left-0 bg-current opacity-15" style={{ width: `${pct}%` }} aria-hidden />
                              <span className="relative truncate tabular-nums">{pct} %</span>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ) : null,
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t px-3 py-2 text-caption text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-destructive" aria-hidden />Aujourd&apos;hui</span>
            <span>◆ Date cible du jalon</span>
            <span>Barre : du premier ticket à l&apos;échéance de l&apos;épopée (ou du jalon)</span>
          </div>
        </Card>
      ) : (
        <EmptyState icon={<Flag />} title="Aucune épopée" description="Créez des épopées (type « Épopée ») pour structurer la feuille de route." />
      )}

      {canManage && epics.length > 0 && milestones.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Rattacher les épopées aux jalons</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {epics.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2">
                  <IssueKey issueKey={e.key} className="w-16" />
                  <span className="min-w-0 flex-1 truncate text-body">{e.title}</span>
                  <StatusBadge name={e.status.name} category={e.status.category} />
                  <Select value={e.milestoneId ?? "none"} onValueChange={(v) => setMilestone(e.id, v === "none" ? null : v)}>
                    <SelectTrigger size="sm" className="w-64" aria-label={`Jalon de ${e.key}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="none">Sans jalon</SelectItem>{milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <MilestoneDialog projectId={projectId} open={open} onOpenChange={setOpen} />
    </div>
  );
}
