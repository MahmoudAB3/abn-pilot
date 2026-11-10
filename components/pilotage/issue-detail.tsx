"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive, ArchiveRestore, Ban, Copy, Eye, EyeOff, ExternalLink, GitBranch, GitCommitHorizontal, GitMerge, GitPullRequest,
  GitPullRequestClosed, Link2, MoreHorizontal, Paperclip, Plus, Timer, Trash2, Upload, X,
} from "lucide-react";
import type { IssueDetail } from "@/modules/issues/service";
import type { Jsonify } from "@/lib/jsonify";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, formatMinutes, isOverdue, timeAgo, toDateInput } from "@/lib/format";
import { ISSUE_TYPES, PRIORITIES, typeMeta } from "@/lib/domain";
import { inverseLinkTypeLabels, linkTypeLabels, prStateLabels, reviewStateLabels } from "@/lib/labels";
import { suggestBranchName } from "@/lib/issue-keys";
import { displayName } from "@/lib/serialize";
import { useAction } from "@/lib/use-action";
import {
  addCommentAction, addLinkAction, archiveIssueAction, createIssueAction, deleteAttachmentAction, deleteCommentAction, deleteIssueAction,
  duplicateIssueAction, logWorkAction, removeLinkAction, restoreIssueAction, toggleWatchAction, updateIssueAction,
} from "@/modules/issues/actions";
import { projectFormDataAction } from "@/modules/projects/actions";
import type { issuePatchSchema } from "@/modules/issues/schemas";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { IssueKey, IssueTypeIcon, LabelChip, PriorityIcon, StatusBadge, UserAvatar, UserName } from "./meta";
import { MentionTextarea } from "./mention-textarea";

export type IssueDetailJson = Omit<Jsonify<IssueDetail>, "issue"> & {
  viewer: { id: string; isAdmin: boolean };
  issue: Omit<Jsonify<IssueDetail["issue"]>, "comments"> & { descriptionHtml: string; comments: (Jsonify<IssueDetail["issue"]["comments"][number]> & { html: string })[] };
};
type Patch = z.input<typeof issuePatchSchema>;

export function useIssueQuery(key: string | undefined) {
  return useQuery<IssueDetailJson>({
    queryKey: ["issue", key],
    enabled: !!key,
    queryFn: async () => {
      const r = await fetch(`/api/issues/${encodeURIComponent(key!)}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Ticket introuvable.");
      return r.json();
    },
  });
}

function useFormData(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project-form", projectId],
    enabled: !!projectId,
    staleTime: 60_000,
    queryFn: async () => {
      const r = await projectFormDataAction({ projectId: projectId! });
      if (!r.ok) throw new Error(r.error);
      return r.data;
    },
  });
}

/* ───────────────────────────────── utilitaires ───────────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[7.5rem_1fr] items-center gap-3">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-overline-caps text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function copy(text: string, what: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copié`),
    () => toast.error("Copie impossible"),
  );
}

/* ───────────────────────────────── composant ───────────────────────────────── */

export function IssueDetailView({ issueKey, variant = "panel", onClose }: { issueKey: string; variant?: "panel" | "page"; onClose?: () => void }) {
  const { data, isLoading, error } = useIssueQuery(issueKey);
  if (isLoading) return <DetailSkeleton />;
  if (error || !data) return <div className="p-6 text-body text-muted-foreground">{(error as Error)?.message ?? "Ticket introuvable."}</div>;
  return <DetailBody data={data} variant={variant} onClose={onClose} />;
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy>
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-7 w-40" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

function DetailBody({ data, variant, onClose }: { data: IssueDetailJson; variant: "panel" | "page"; onClose?: () => void }) {
  const { issue } = data;
  const qc = useQueryClient();
  const router = useRouter();
  const can = (p: string) => (data.permissions as string[]).includes(p);
  const editable = can("issue.edit") && !issue.archivedAt;
  const form = useFormData(issue.projectId);
  const refresh = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["issue", issue.key] });
    router.refresh();
  }, [qc, issue.key, router]);

  const update = useAction(updateIssueAction, { refresh: false });
  const patch = async (p: Patch) => {
    const r = await update.run({ issueId: issue.id, patch: p });
    if (r.ok) refresh();
    return r.ok;
  };

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title, setTitle] = React.useState(issue.title);
  React.useEffect(() => setTitle(issue.title), [issue.title]);

  const done = issue.status.category === "DONE";
  const TitleTag = variant === "page" ? "h1" : "h2";
  const fd = form.data;
  const parentOptions = issue.type === "SUBTASK" ? fd?.parents.filter((p) => p.id !== issue.id) : issue.type === "EPIC" ? [] : fd?.epics;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* En-tête */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <IssueTypeIcon type={issue.type} />
        <Link href={`/projets/${issue.project.key}`} className="truncate text-body-sm text-muted-foreground hover:underline">
          {issue.project.name}
        </Link>
        <span className="text-muted-foreground" aria-hidden>/</span>
        <IssueKey issueKey={issue.key} done={done} href={`/tickets/${issue.key}`} />
        {issue.archivedAt && <span className="rounded-sm bg-warning-subtle px-1.5 text-caption font-semibold text-warning-subtle-foreground">Archivé</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <WatchButton issueId={issue.id} watching={data.watching} onDone={refresh} />
          <Tooltip label="Copier le lien">
            <Button size="icon-sm" variant="ghost" aria-label="Copier le lien" onClick={() => copy(`${location.origin}/tickets/${issue.key}`, "Lien")}>
              <Link2 aria-hidden />
            </Button>
          </Tooltip>
          {variant === "panel" && (
            <Tooltip label="Ouvrir en pleine page">
              <Button size="icon-sm" variant="ghost" asChild>
                <Link href={`/tickets/${issue.key}`} aria-label="Ouvrir en pleine page">
                  <ExternalLink aria-hidden />
                </Link>
              </Button>
            </Tooltip>
          )}
          <IssueMenu data={data} onDone={refresh} onClose={onClose} />
          {onClose && (
            <>
              <Separator orientation="vertical" className="mx-1 h-5" />
              <Button size="sm" variant="ghost" onClick={onClose}>
                Fermer
              </Button>
            </>
          )}
        </div>
      </header>

      <div className={cn("min-h-0 flex-1 overflow-y-auto", variant === "page" ? "px-6 py-5" : "px-4 py-4")}>
        {/* Parent */}
        {issue.parent && (
          <p className="mb-1 flex items-center gap-1.5 text-body-sm text-muted-foreground">
            <IssueTypeIcon type={issue.parent.type as never} />
            <IssueKey issueKey={issue.parent.key} href={`/tickets/${issue.parent.key}`} />
            <span className="truncate">{issue.parent.title}</span>
          </p>
        )}

        {/* Titre */}
        {editingTitle ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (title.trim() !== issue.title && (await patch({ title }))) setEditingTitle(false);
              else setEditingTitle(false);
            }}
          >
            <label htmlFor="issue-title" className="sr-only">Titre</label>
            <Input id="issue-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={240} className="h-9 text-h2 font-semibold" onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === "Escape" && (setTitle(issue.title), setEditingTitle(false))} />
          </form>
        ) : (
          <TitleTag
            className={cn("text-h1 font-semibold", editable && "-mx-1 cursor-text rounded-sm px-1 hover:bg-surface-hover")}
            onClick={() => editable && setEditingTitle(true)}
            tabIndex={editable ? 0 : undefined}
            onKeyDown={(e) => editable && e.key === "Enter" && setEditingTitle(true)}
            title={editable ? "Cliquer pour modifier" : undefined}
          >
            {issue.title}
          </TitleTag>
        )}

        {/* Statut + blocage */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={issue.statusId} disabled={!can("board.move") || !!issue.archivedAt} onValueChange={(v) => patch({ statusId: v })}>
            <SelectTrigger size="sm" className="w-44 font-semibold" aria-label="Statut">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(fd?.statuses ?? [issue.status]).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <BlockedControl issue={issue} disabled={!editable} onPatch={patch} />
        </div>

        {/* Champs */}
        <dl className="mt-4 flex flex-col gap-1">
          <Row label="Type">
            <Select value={issue.type} disabled={!editable} onValueChange={(v) => patch({ type: v as never })}>
              <SelectTrigger size="sm" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}><IssueTypeIcon type={t} withLabel /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Assigné">
            <Select value={issue.assigneeId ?? "none"} disabled={!editable} onValueChange={(v) => patch({ assigneeId: v === "none" ? null : v })}>
              <SelectTrigger size="sm" aria-label="Assigné"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non assigné</SelectItem>
                <SelectSeparator />
                {(fd?.members ?? (issue.assignee ? [issue.assignee] : [])).map((m) => (
                  <SelectItem key={m.id} value={m.id}><UserName user={m} /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Priorité">
            <Select value={issue.priority} disabled={!editable} onValueChange={(v) => patch({ priority: v as never })}>
              <SelectTrigger size="sm" aria-label="Priorité"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}><PriorityIcon priority={p} withLabel /></SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          {issue.type !== "EPIC" && (
            <Row label="Story points">
              <PointsInput value={issue.storyPoints} disabled={!editable} onSave={(v) => patch({ storyPoints: v })} />
            </Row>
          )}
          {issue.type !== "EPIC" && (
            <Row label="Sprint">
              <Select value={issue.sprintId ?? "none"} disabled={!editable || !can("sprint.manage")} onValueChange={(v) => patch({ sprintId: v === "none" ? null : v })}>
                <SelectTrigger size="sm" aria-label="Sprint"><SelectValue placeholder="Backlog" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Backlog</SelectItem>
                  {issue.sprint?.status === "COMPLETED" && <SelectItem value={issue.sprint.id}>{issue.sprint.name} (terminé)</SelectItem>}
                  {(fd?.sprints ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}{s.status === "ACTIVE" ? " · actif" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}
          {issue.type !== "EPIC" && (
            <Row label={issue.type === "SUBTASK" ? "Parent" : "Épopée"}>
              <Select value={issue.parentId ?? "none"} disabled={!editable} onValueChange={(v) => patch({ parentId: v === "none" ? null : v })}>
                <SelectTrigger size="sm" aria-label={issue.type === "SUBTASK" ? "Parent" : "Épopée"}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {issue.type !== "SUBTASK" && <SelectItem value="none">Aucune</SelectItem>}
                  {issue.parent && !parentOptions?.some((p) => p.id === issue.parentId) && <SelectItem value={issue.parent.id}>{issue.parent.key} · {issue.parent.title}</SelectItem>}
                  {(parentOptions ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.key} · {p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          )}
          <Row label="Échéance">
            <Input
              type="date"
              aria-label="Échéance"
              disabled={!editable}
              defaultValue={toDateInput(issue.dueDate)}
              key={issue.dueDate ?? "none"}
              className={cn("h-7 w-44", isOverdue(issue.dueDate, issue.status.category) && "border-destructive text-destructive")}
              onBlur={(e) => {
                const v = e.target.value || null;
                if (v !== (toDateInput(issue.dueDate) || null)) patch({ dueDate: v as never });
              }}
            />
          </Row>
          <Row label="Étiquettes">
            <LabelsControl issue={issue} labels={fd?.labels ?? []} disabled={!editable} onPatch={patch} />
          </Row>
          <Row label="Rapporteur">
            <span className="text-body"><UserName user={issue.reporter} /></span>
          </Row>
          {(issue.release || issue.milestone) && (
            <Row label="Planification">
              <span className="text-body-sm text-fg-secondary">
                {issue.release && <>Version {issue.release.name} ({issue.release.version})</>}
                {issue.release && issue.milestone && " · "}
                {issue.milestone && <>Jalon {issue.milestone.name}</>}
              </span>
            </Row>
          )}
          <Row label="Temps passé">
            <span className="flex items-center gap-2 text-body">
              {data.loggedMinutes ? formatMinutes(data.loggedMinutes) : "—"}
              {can("worklog.create") && !issue.archivedAt && <WorkLogButton issueId={issue.id} onDone={refresh} />}
            </span>
          </Row>
          <Row label="Dates">
            <span className="text-caption text-muted-foreground">Créé {formatDateTime(issue.createdAt)} · mis à jour {timeAgo(issue.updatedAt)}</span>
          </Row>
        </dl>

        <Description issue={issue} editable={editable} onPatch={patch} />

        {/* Enfants */}
        {issue.type !== "SUBTASK" && (
          <Section title={issue.type === "EPIC" ? `Tickets de l'épopée (${issue.children.length})` : `Sous-tâches (${issue.children.length})`}>
            <ul className="flex flex-col divide-y rounded-md border">
              {issue.children.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                  <IssueTypeIcon type={c.type} />
                  <IssueKey issueKey={c.key} href={`/tickets/${c.key}`} done={c.status.category === "DONE"} />
                  <span className="min-w-0 flex-1 truncate text-body-sm">{c.title}</span>
                  <StatusBadge name={c.status.name} category={c.status.category} />
                  <UserAvatar user={c.assignee} size="xs" />
                </li>
              ))}
              {can("issue.create") && !issue.archivedAt && <QuickChild issue={issue} onDone={refresh} />}
            </ul>
          </Section>
        )}

        <LinksSection data={data} editable={editable} onDone={refresh} />
        <AttachmentsSection data={data} editable={editable} onDone={refresh} />
        <GitHubSection data={data} />

        {/* Commentaires / historique */}
        <section className="mt-6">
          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">Commentaires ({issue.comments.length})</TabsTrigger>
              <TabsTrigger value="history">Historique</TabsTrigger>
            </TabsList>
            <TabsContent value="comments">
              <Comments data={data} members={fd?.members ?? []} onDone={refresh} />
            </TabsContent>
            <TabsContent value="history">
              <ActivityList activities={issue.activities} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────────────────── contrôles ─────────────────────────────── */

function PointsInput({ value, disabled, onSave }: { value: number | null; disabled: boolean; onSave: (v: number | null) => void }) {
  return (
    <Input
      type="number"
      min={0}
      max={100}
      aria-label="Story points"
      defaultValue={value ?? ""}
      key={value ?? "none"}
      disabled={disabled}
      className="h-7 w-24"
      onBlur={(e) => {
        const v = e.target.value === "" ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value))));
        if (v !== value) onSave(v);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

function BlockedControl({ issue, disabled, onPatch }: { issue: IssueDetailJson["issue"]; disabled: boolean; onPatch: (p: Patch) => Promise<boolean> }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState(issue.blockedReason ?? "");
  return (
    <>
      <Button
        size="sm"
        variant={issue.blocked ? "destructive" : "outline"}
        disabled={disabled}
        onClick={() => (issue.blocked ? onPatch({ blocked: false }) : setOpen(true))}
        aria-pressed={issue.blocked}
      >
        <Ban aria-hidden />
        {issue.blocked ? "Bloqué — lever" : "Signaler un blocage"}
      </Button>
      {issue.blocked && issue.blockedReason && <span className="text-body-sm text-destructive">{issue.blockedReason}</span>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await onPatch({ blocked: true, blockedReason: reason.trim() || null })) setOpen(false);
            }}
          >
            <DialogHeader><DialogTitle>Signaler un blocage</DialogTitle></DialogHeader>
            <DialogBody>
              <label htmlFor="blocked-reason" className="text-body-sm font-medium text-fg-secondary">Raison (facultatif)</label>
              <Textarea id="blocked-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ex. : en attente de l'accès à l'API de la DGI" />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" variant="destructive">Marquer comme bloqué</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LabelsControl({ issue, labels, disabled, onPatch }: { issue: IssueDetailJson["issue"]; labels: { id: string; name: string; color: string }[]; disabled: boolean; onPatch: (p: Patch) => Promise<boolean> }) {
  const current = issue.labels.map((l) => l.label.id);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {issue.labels.map((l) => (
        <LabelChip key={l.label.id} name={l.label.name} color={l.label.color} />
      ))}
      {!disabled && labels.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" aria-label="Modifier les étiquettes"><Plus aria-hidden />{issue.labels.length ? "" : "Ajouter"}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Étiquettes</DropdownMenuLabel>
            {labels.map((l) => (
              <DropdownMenuCheckboxItem
                key={l.id}
                checked={current.includes(l.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(c) => onPatch({ labelIds: c ? [...current, l.id] : current.filter((x) => x !== l.id) })}
              >
                <LabelChip name={l.name} color={l.color} />
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!issue.labels.length && (disabled || !labels.length) && <span className="text-body-sm text-muted-foreground">—</span>}
    </div>
  );
}

function Description({ issue, editable, onPatch }: { issue: IssueDetailJson["issue"]; editable: boolean; onPatch: (p: Patch) => Promise<boolean> }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(issue.description);
  React.useEffect(() => setValue(issue.description), [issue.description]);
  return (
    <Section
      title="Description"
      action={
        editable && !editing ? (
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            Modifier
          </Button>
        ) : null
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="issue-desc" className="sr-only">Description (Markdown)</label>
          <Textarea id="issue-desc" value={value} onChange={(e) => setValue(e.target.value)} rows={10} className="font-mono text-body-sm" placeholder="Contexte, critères d'acceptation… (Markdown pris en charge)" autoFocus />
          <p className="text-caption text-muted-foreground">Markdown : **gras**, _italique_, listes, `code`, [lien](https://…), tableaux.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => (setValue(issue.description), setEditing(false))}>Annuler</Button>
            <Button size="sm" variant="primary" onClick={async () => (await onPatch({ description: value })) && setEditing(false)}>Enregistrer</Button>
          </div>
        </div>
      ) : issue.descriptionHtml ? (
        <div className="prose-pilotage" dangerouslySetInnerHTML={{ __html: issue.descriptionHtml }} />
      ) : (
        <p className="text-body text-muted-foreground">{editable ? "Aucune description. Cliquez sur « Modifier » pour en ajouter une." : "Aucune description."}</p>
      )}
    </Section>
  );
}

function QuickChild({ issue, onDone }: { issue: IssueDetailJson["issue"]; onDone: () => void }) {
  const [title, setTitle] = React.useState("");
  const create = useAction(createIssueAction, { refresh: false });
  return (
    <li className="px-2 py-1.5">
      <form
        className="flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          const r = await create.run({ projectId: issue.projectId, title, type: issue.type === "EPIC" ? "STORY" : "SUBTASK", parentId: issue.id, sprintId: issue.type === "EPIC" ? null : issue.sprintId });
          if (r.ok) {
            setTitle("");
            onDone();
          }
        }}
      >
        <Plus className="size-4 text-muted-foreground" aria-hidden />
        <label htmlFor={`child-${issue.id}`} className="sr-only">{issue.type === "EPIC" ? "Nouvelle story" : "Nouvelle sous-tâche"}</label>
        <input id={`child-${issue.id}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={issue.type === "EPIC" ? "Ajouter une story à l'épopée…" : "Ajouter une sous-tâche…"} className="h-7 flex-1 bg-transparent text-body-sm outline-none placeholder:text-muted-foreground" maxLength={240} />
        {title && <Button size="xs" variant="primary" type="submit" loading={create.pending}>Ajouter</Button>}
      </form>
    </li>
  );
}

function WatchButton({ issueId, watching, onDone }: { issueId: string; watching: boolean; onDone: () => void }) {
  const a = useAction(toggleWatchAction, { refresh: false });
  return (
    <Tooltip label={watching ? "Ne plus suivre" : "Suivre ce ticket"}>
      <Button size="icon-sm" variant="ghost" aria-pressed={watching} aria-label={watching ? "Ne plus suivre" : "Suivre ce ticket"} onClick={async () => (await a.run({ issueId })).ok && onDone()}>
        {watching ? <Eye className="text-primary-text" aria-hidden /> : <EyeOff aria-hidden />}
      </Button>
    </Tooltip>
  );
}

function IssueMenu({ data, onDone, onClose }: { data: IssueDetailJson; onDone: () => void; onClose?: () => void }) {
  const { issue } = data;
  const router = useRouter();
  const can = (p: string) => (data.permissions as string[]).includes(p);
  const dup = useAction(duplicateIssueAction, { refresh: false, success: (d) => `Ticket ${d.key} créé` });
  const arch = useAction(archiveIssueAction, { refresh: false, success: "Ticket archivé" });
  const rest = useAction(restoreIssueAction, { refresh: false, success: "Ticket restauré" });
  const del = useAction(deleteIssueAction, { refresh: false, success: "Ticket supprimé définitivement" });
  const [confirm, setConfirm] = React.useState(false);
  const branch = suggestBranchName(issue.key, issue.title, issue.type);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Plus d'actions"><MoreHorizontal aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => copy(branch, "Nom de branche")}><GitBranch aria-hidden />Copier le nom de branche</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copy(issue.key, "Clé")}><Copy aria-hidden />Copier la clé</DropdownMenuItem>
          {can("issue.create") && (
            <DropdownMenuItem onSelect={async () => { const r = await dup.run({ issueId: issue.id }); if (r.ok) { onDone(); router.push(`/tickets/${r.data.key}`); } }}>
              <Plus aria-hidden />Dupliquer
            </DropdownMenuItem>
          )}
          {can("issue.delete") && (
            <>
              <DropdownMenuSeparator />
              {issue.archivedAt ? (
                <>
                  <DropdownMenuItem onSelect={async () => (await rest.run({ issueId: issue.id })).ok && onDone()}><ArchiveRestore aria-hidden />Restaurer</DropdownMenuItem>
                  <DropdownMenuItem destructive onSelect={() => setConfirm(true)}><Trash2 aria-hidden />Supprimer définitivement</DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem destructive onSelect={async () => (await arch.run({ issueId: issue.id })).ok && onDone()}><Archive aria-hidden />Archiver</DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Supprimer {issue.key} définitivement ?</DialogTitle></DialogHeader>
          <DialogBody><p className="text-body">Les commentaires, pièces jointes et l&apos;historique seront supprimés. Cette action est irréversible.</p></DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(false)}>Annuler</Button>
            <Button variant="destructive" loading={del.pending} onClick={async () => { if ((await del.run({ issueId: issue.id })).ok) { setConfirm(false); onClose?.(); router.refresh(); } }}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WorkLogButton({ issueId, onDone }: { issueId: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const a = useAction(logWorkAction, { refresh: false, success: "Temps enregistré" });
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}><Timer aria-hidden />Saisir</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const minutes = Math.round(Number(f.get("hours") || 0) * 60) + Number(f.get("minutes") || 0);
              const r = await a.run({ issueId, minutes, date: String(f.get("date")), note: String(f.get("note") ?? "") });
              if (r.ok) { setOpen(false); onDone(); }
            }}
          >
            <DialogHeader><DialogTitle>Saisir du temps</DialogTitle></DialogHeader>
            <DialogBody>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Heures<Input name="hours" type="number" min={0} max={24} step={0.25} defaultValue={1} /></label>
                <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Minutes<Input name="minutes" type="number" min={0} max={59} defaultValue={0} /></label>
                <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Date<Input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              </div>
              <label className="flex flex-col gap-1.5 text-body-sm font-medium text-fg-secondary">Note<Input name="note" maxLength={500} placeholder="Facultatif" /></label>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" variant="primary" loading={a.pending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────────── sections ─────────────────────────────── */

function LinksSection({ data, editable, onDone }: { data: IssueDetailJson; editable: boolean; onDone: () => void }) {
  const { issue } = data;
  const add = useAction(addLinkAction, { refresh: false, success: "Lien ajouté" });
  const remove = useAction(removeLinkAction, { refresh: false });
  const [adding, setAdding] = React.useState(false);
  const [type, setType] = React.useState<"BLOCKS" | "RELATES_TO" | "DUPLICATES">("RELATES_TO");
  const [key, setKey] = React.useState("");
  const links = [
    ...issue.linksOut.map((l) => ({ id: l.id, label: linkTypeLabels[l.type], other: l.target })),
    ...issue.linksIn.map((l) => ({ id: l.id, label: inverseLinkTypeLabels[l.type], other: l.source })),
  ];
  if (!links.length && !editable) return null;
  return (
    <Section title="Tickets liés" action={editable && !adding ? <Button size="xs" variant="ghost" onClick={() => setAdding(true)}><Plus aria-hidden />Lier</Button> : null}>
      {links.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="w-28 shrink-0 text-caption text-muted-foreground">{l.label}</span>
              <IssueKey issueKey={l.other.key} href={`/tickets/${l.other.key}`} done={l.other.status.category === "DONE"} />
              <span className="min-w-0 flex-1 truncate text-body-sm">{l.other.title}</span>
              <StatusBadge name={l.other.status.name} category={l.other.status.category} />
              {editable && <Button size="icon-xs" variant="ghost" aria-label="Retirer le lien" onClick={async () => (await remove.run({ linkId: l.id })).ok && onDone()}><X aria-hidden /></Button>}
            </li>
          ))}
        </ul>
      )}
      {!links.length && !adding && <p className="text-body-sm text-muted-foreground">Aucun ticket lié.</p>}
      {adding && (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await add.run({ sourceId: issue.id, targetKey: key, type });
            if (r.ok) { setKey(""); setAdding(false); onDone(); }
          }}
        >
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger size="sm" className="w-36" aria-label="Type de lien"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="RELATES_TO">est lié à</SelectItem>
              <SelectItem value="BLOCKS">bloque</SelectItem>
              <SelectItem value="DUPLICATES">duplique</SelectItem>
            </SelectContent>
          </Select>
          <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="Clé, ex. ERP-14" aria-label="Clé du ticket" className="h-7 w-36 font-mono" autoFocus />
          <Button size="sm" variant="primary" type="submit" loading={add.pending}>Lier</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Annuler</Button>
        </form>
      )}
    </Section>
  );
}

function AttachmentsSection({ data, editable, onDone }: { data: IssueDetailJson; editable: boolean; onDone: () => void }) {
  const { issue } = data;
  const input = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const del = useAction(deleteAttachmentAction, { refresh: false });
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("issueId", issue.id);
      fd.set("file", file);
      const r = await fetch("/api/attachments", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) toast.error(j.error ?? "Téléversement impossible.");
      else toast.success(`${j.filename} ajouté`);
    }
    setUploading(false);
    if (input.current) input.current.value = "";
    onDone();
  };
  if (!issue.attachments.length && !editable) return null;
  return (
    <Section
      title={`Pièces jointes (${issue.attachments.length})`}
      action={
        editable ? (
          <>
            <input ref={input} type="file" multiple className="sr-only" id={`file-${issue.id}`} onChange={(e) => upload(e.target.files)} />
            <Button size="xs" variant="ghost" loading={uploading} onClick={() => input.current?.click()}><Upload aria-hidden />Joindre</Button>
          </>
        ) : null
      }
    >
      {issue.attachments.length ? (
        <ul className="flex flex-col divide-y rounded-md border">
          {issue.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-1.5">
              <Paperclip className="size-4 text-muted-foreground" aria-hidden />
              <a href={`/api/attachments/${a.id}`} className="min-w-0 flex-1 truncate text-body-sm text-primary-text hover:underline" target="_blank" rel="noopener">{a.filename}</a>
              <span className="text-caption text-muted-foreground tabular-nums">{Math.max(1, Math.round(a.size / 1024))} Ko · {displayName(a.uploader)}</span>
              {editable && <Button size="icon-xs" variant="ghost" aria-label={`Supprimer ${a.filename}`} onClick={async () => (await del.run({ attachmentId: a.id })).ok && onDone()}><Trash2 aria-hidden /></Button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-muted-foreground">Aucune pièce jointe. Images, PDF, documents Office, ZIP et fichiers texte jusqu&apos;à 10 Mo.</p>
      )}
    </Section>
  );
}

const prIcon = { OPEN: GitPullRequest, MERGED: GitMerge, CLOSED: GitPullRequestClosed };
const prClass = { OPEN: "bg-pr-ouverte-bg text-pr-ouverte-fg", MERGED: "bg-pr-fusionnee-bg text-pr-fusionnee-fg", CLOSED: "bg-pr-fermee-bg text-pr-fermee-fg" };

function GitHubSection({ data }: { data: IssueDetailJson }) {
  const { issue } = data;
  const prs = issue.githubLinks.filter((l) => l.pullRequest).map((l) => l.pullRequest!);
  const commits = issue.githubLinks.filter((l) => l.commit).map((l) => l.commit!);
  const branch = suggestBranchName(issue.key, issue.title, issue.type);
  return (
    <Section title="Développement">
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-surface-subtle px-3 py-2">
        <GitBranch className="size-4 text-muted-foreground" aria-hidden />
        <code className="min-w-0 flex-1 truncate font-mono text-caption">{branch}</code>
        <Button size="xs" variant="ghost" onClick={() => copy(branch, "Nom de branche")}><Copy aria-hidden />Copier</Button>
        <Button size="xs" variant="ghost" onClick={() => copy(`git switch -c ${branch}`, "Commande git")}>git switch -c</Button>
      </div>
      {prs.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y rounded-md border">
          {prs.map((pr) => {
            const Icon = prIcon[pr.state];
            return (
              <li key={pr.id} className="flex flex-col gap-1 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-caption font-semibold", prClass[pr.state])}><Icon className="size-3" aria-hidden />{prStateLabels[pr.state]}</span>
                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-body-sm font-medium hover:text-primary-text hover:underline">{pr.title}</a>
                  <span className="font-mono text-caption text-muted-foreground">#{pr.number}</span>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
                  <span>{pr.repository.fullName}</span>
                  <code className="font-mono">{pr.headRef}</code>
                  <span>par {pr.authorLogin}</span>
                  <span>{reviewStateLabels[pr.reviewState]}</span>
                  {pr.mergedAt && <span>fusionnée {timeAgo(pr.mergedAt)}</span>}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {commits.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y rounded-md border">
          {commits.slice(0, 10).map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
              <GitCommitHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="shrink-0 font-mono text-caption font-medium text-primary-text hover:underline">{c.sha.slice(0, 7)}</a>
              <span className="min-w-0 flex-1 truncate text-body-sm">{c.message.split("\n")[0]}</span>
              <span className="hidden shrink-0 text-caption text-muted-foreground sm:inline">{c.authorLogin ?? c.authorName} · {c.repository.fullName}</span>
              <span className="shrink-0 text-caption text-muted-foreground">{timeAgo(c.committedAt)}</span>
            </li>
          ))}
        </ul>
      )}
      {!prs.length && !commits.length && (
        <p className="mt-2 text-body-sm text-muted-foreground">
          Aucune activité GitHub. Mentionnez <code className="font-mono">{issue.key}</code> dans un message de commit, un titre de PR ou un nom de branche.
        </p>
      )}
    </Section>
  );
}

function Comments({ data, members, onDone }: { data: IssueDetailJson; members: { id: string; name: string | null; email: string; image: string | null }[]; onDone: () => void }) {
  const { issue } = data;
  const can = (p: string) => (data.permissions as string[]).includes(p);
  const [body, setBody] = React.useState("");
  const add = useAction(addCommentAction, { refresh: false });
  const del = useAction(deleteCommentAction, { refresh: false });
  return (
    <div className="flex flex-col gap-4">
      {issue.comments.map((c) => (
        <article key={c.id} className="flex gap-3">
          <UserAvatar user={c.author} size="sm" decorative />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-body-sm">
              <span className="font-semibold">{displayName(c.author)}</span>
              <span className="text-caption text-muted-foreground" title={formatDateTime(c.createdAt)}>{timeAgo(c.createdAt)}</span>
              {c.updatedAt !== c.createdAt && <span className="text-caption text-muted-foreground">(modifié)</span>}
              {(c.authorId === data.viewer.id || data.viewer.isAdmin) && (
                <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label="Supprimer le commentaire" onClick={async () => (await del.run({ commentId: c.id })).ok && onDone()}>
                  <Trash2 aria-hidden />
                </Button>
              )}
            </p>
            <div className="prose-pilotage mt-1" dangerouslySetInnerHTML={{ __html: c.html }} />
          </div>
        </article>
      ))}
      {!issue.comments.length && <p className="text-body-sm text-muted-foreground">Aucun commentaire pour l&apos;instant.</p>}
      {can("issue.comment") && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            const r = await add.run({ issueId: issue.id, body });
            if (r.ok) { setBody(""); onDone(); }
          }}
        >
          <MentionTextarea id={`comment-${issue.id}`} label="Ajouter un commentaire" value={body} onChange={setBody} members={members} placeholder="Ajouter un commentaire… Tapez @ pour mentionner quelqu'un." />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" type="submit" disabled={!body.trim()} loading={add.pending}>Commenter</Button>
          </div>
        </form>
      )}
    </div>
  );
}

/* ─────────────────────────────── historique ─────────────────────────────── */

function activityText(a: IssueDetailJson["issue"]["activities"][number]): React.ReactNode {
  const d = (a.data ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "CREATED": return "a créé le ticket";
    case "STATUS_CHANGED": return <>a changé le statut : {String(d.from ?? "—")} → <strong>{String(d.to)}</strong></>;
    case "AUTOMATION": return <>a déplacé le ticket vers <strong>{String(d.to)}</strong> (automatisation : {String(d.reason ?? "")} {String(d.pr ?? "")})</>;
    case "ASSIGNED": return d.to ? "a modifié l'assignation" : "a retiré l'assignation";
    case "UPDATED": return <>a modifié : {((d.changes as { label: string }[]) ?? []).map((c) => c.label).join(", ")}</>;
    case "COMMENTED": return "a commenté";
    case "ATTACHMENT_ADDED": return <>a joint « {String(d.filename)} »</>;
    case "LINKED": return <>a lié le ticket à {String(d.target ?? d.source ?? "")}</>;
    case "ARCHIVED": return "a archivé le ticket";
    case "RESTORED": return "a restauré le ticket";
    case "SPRINT_CHANGED": return d.carryOver ? "a reporté le ticket (fin de sprint)" : d.to ? "a planifié le ticket dans un sprint" : "a renvoyé le ticket au backlog";
    case "WORK_LOGGED": return <>a saisi {formatMinutes(Number(d.minutes ?? 0))}</>;
    case "COMMIT_LINKED": return <>commit <a className="font-mono text-primary-text hover:underline" href={String(d.url)} target="_blank" rel="noopener noreferrer">{String(d.sha)}</a> de {String(d.author)} : {String(d.message)}</>;
    case "PR_LINKED": return <>PR <a className="text-primary-text hover:underline" href={String(d.url)} target="_blank" rel="noopener noreferrer">#{String(d.number)}</a> liée ({String(d.repo)})</>;
    case "PR_UPDATED": return <>PR #{String(d.number)} : {prStateLabels[d.state as keyof typeof prStateLabels] ?? ""}{d.reviewState && d.reviewState !== "NONE" ? ` · ${reviewStateLabels[d.reviewState as keyof typeof reviewStateLabels]}` : ""}</>;
    default: return a.type;
  }
}

export function ActivityList({ activities }: { activities: IssueDetailJson["issue"]["activities"] }) {
  if (!activities.length) return <p className="text-body-sm text-muted-foreground">Aucun évènement.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {activities.map((a) => (
        <li key={a.id} className="flex gap-3 text-body-sm">
          {a.actor ? <UserAvatar user={a.actor} size="xs" decorative /> : <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-background"><GitPullRequest className="size-3" aria-hidden /></span>}
          <p className="min-w-0 flex-1 text-fg-secondary">
            <span className="font-semibold text-foreground">{a.actor ? displayName(a.actor) : a.type.startsWith("PR") || a.type.startsWith("COMMIT") || a.type === "AUTOMATION" ? "GitHub" : "Système"}</span> {activityText(a)}
            <span className="ml-2 text-caption text-muted-foreground" title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

export { typeMeta, formatDate };
