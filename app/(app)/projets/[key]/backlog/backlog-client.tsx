"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ChevronDown, GripVertical, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { IssueCardData, UserLite } from "@/lib/serialize";
import { displayName } from "@/lib/serialize";
import { PRIORITIES } from "@/lib/domain";
import { sprintStatusLabels } from "@/lib/labels";
import { assignToSprintAction, bulkUpdateAction, createIssueAction, reorderIssueAction, updateIssueAction } from "@/modules/issues/actions";
import { deleteSprintAction } from "@/modules/sprints/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { FilterBar } from "@/components/pilotage/filter-bar";
import { useIssuePanel } from "@/components/pilotage/issue-panel";
import { BlockedBadge, EpicLabel, IssueKey, IssueTypeIcon, PriorityIcon, StatusBadge, UserAvatar, UserName } from "@/components/pilotage/meta";
import { CompleteSprintButton, SprintFormDialog, StartSprintButton } from "@/components/pilotage/sprint-dialogs";

interface SprintLite { id: string; name: string; goal: string; status: "PLANNED" | "ACTIVE" | "COMPLETED"; startDate: string; endDate: string }
interface Props {
  projectId: string;
  projectKey: string;
  sprints: SprintLite[];
  issues: IssueCardData[];
  members: UserLite[];
  epics: { id: string; key: string; title: string }[];
  perms: { prioritize: boolean; sprint: boolean; edit: boolean; create: boolean; archive: boolean };
}

const BACKLOG = "backlog";
const sectionOf = (i: IssueCardData) => i.sprintId ?? BACKLOG;

function Row({ issue, selected, onSelect, canDrag, canEdit }: { issue: IssueCardData; selected: boolean; onSelect: (v: boolean) => void; canDrag: boolean; canEdit: boolean }) {
  const panel = useIssuePanel();
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled: !canDrag });
  const [points, setPoints] = React.useState(issue.storyPoints?.toString() ?? "");
  React.useEffect(() => setPoints(issue.storyPoints?.toString() ?? ""), [issue.storyPoints]);
  const savePoints = async () => {
    const v = points === "" ? null : Math.max(0, Math.min(100, Math.round(Number(points))));
    if (v === issue.storyPoints || Number.isNaN(v)) return;
    const r = await updateIssueAction({ issueId: issue.id, patch: { storyPoints: v } });
    if (!r.ok) {
      toast.error(r.error);
      setPoints(issue.storyPoints?.toString() ?? "");
    } else router.refresh();
  };
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("group flex h-10 items-center gap-2 border-b bg-card px-2 last:border-b-0", isDragging && "relative z-10 opacity-60 shadow-raised", selected && "bg-selected/60")} data-issue-key={issue.key}>
      {canDrag ? (
        <button type="button" className="cursor-grab rounded-xs text-fg-disabled opacity-40 hover:text-muted-foreground group-hover:opacity-100 focus-visible:opacity-100" aria-label={`Déplacer ${issue.key}`} {...attributes} {...listeners}>
          <GripVertical className="size-4" aria-hidden />
        </button>
      ) : <span className="w-4" />}
      <Checkbox checked={selected} onCheckedChange={(c) => onSelect(!!c)} aria-label={`Sélectionner ${issue.key}`} />
      <IssueTypeIcon type={issue.type} />
      <IssueKey issueKey={issue.key} done={issue.status.category === "DONE"} className="w-16 shrink-0" />
      <button type="button" onClick={() => panel.open(issue.key)} className="min-w-0 flex-1 truncate rounded-xs text-left text-body hover:text-primary-text hover:underline">{issue.title}</button>
      {issue.blocked && <BlockedBadge className="hidden md:inline-flex" />}
      {issue.parent?.type === "EPIC" && <EpicLabel epicKey={issue.parent.key} title={issue.parent.title} className="hidden max-w-44 lg:inline-flex" />}
      <StatusBadge name={issue.status.name} category={issue.status.category} className="hidden sm:inline-flex" />
      <PriorityIcon priority={issue.priority} />
      <label className="sr-only" htmlFor={`pts-${issue.id}`}>Story points de {issue.key}</label>
      <input
        id={`pts-${issue.id}`}
        value={points}
        disabled={!canEdit}
        onChange={(e) => setPoints(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={savePoints}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        inputMode="numeric"
        placeholder="–"
        title="Story points (cliquer pour estimer)"
        className="h-6 w-9 rounded-full bg-surface-active text-center text-caption font-semibold text-fg-secondary tabular-nums outline-none hover:ring-1 hover:ring-border-strong focus:bg-card focus:ring-2 focus:ring-ring disabled:hover:ring-0"
      />
      <UserAvatar user={issue.assignee} size="sm" />
    </li>
  );
}

function Section({ id, title, meta, issues, selected, setSelected, collapsedDefault, actions, canDrag, canEdit, groupByEpic, epics, footer }: {
  id: string; title: React.ReactNode; meta?: React.ReactNode; issues: IssueCardData[]; selected: Set<string>; setSelected: (fn: (s: Set<string>) => Set<string>) => void;
  collapsedDefault?: boolean; actions?: React.ReactNode; canDrag: boolean; canEdit: boolean; groupByEpic: boolean; epics: Props["epics"]; footer?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!collapsedDefault);
  const { setNodeRef, isOver } = useDroppable({ id: `section:${id}` });
  const pts = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const unestimated = issues.filter((i) => i.storyPoints == null && i.type !== "SUBTASK").length;
  const allSelected = issues.length > 0 && issues.every((i) => selected.has(i.id));
  const headingId = React.useId();
  const groups = groupByEpic
    ? [...epics.map((e) => ({ key: e.id, label: <EpicLabel epicKey={e.key} title={`${e.key} · ${e.title}`} />, items: issues.filter((i) => i.parent?.id === e.id) })), { key: "none", label: <span className="text-caption font-semibold text-muted-foreground">Sans épopée</span>, items: issues.filter((i) => i.parent?.type !== "EPIC") }].filter((g) => g.items.length)
    : [{ key: "all", label: null as React.ReactNode, items: issues }];
  const toggle = (id: string, v: boolean) => setSelected((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
  return (
    <section ref={setNodeRef} aria-labelledby={headingId} className={cn("rounded-lg bg-surface-sunken p-1.5 transition-colors", isOver && "ring-2 ring-selected-border ring-inset")}>
      <div className="flex flex-wrap items-center gap-2 px-1.5 py-1">
        <Checkbox checked={allSelected ? true : issues.some((i) => selected.has(i.id)) ? "indeterminate" : false} onCheckedChange={(c) => setSelected((s) => { const n = new Set(s); for (const i of issues) if (c) n.add(i.id); else n.delete(i.id); return n; })} aria-label="Tout sélectionner dans la section" disabled={!issues.length} />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 items-center gap-1.5 rounded-sm">
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden />
          <h2 id={headingId} className="truncate text-h3 font-semibold">{title}</h2>
        </button>
        {meta && <span className="hidden min-w-0 truncate text-body-sm text-muted-foreground sm:inline">{meta}</span>}
        <span className="ml-auto shrink-0 text-caption text-muted-foreground tabular-nums">
          {issues.length} ticket{issues.length > 1 ? "s" : ""} · <strong className="text-fg-secondary">{pts} pts</strong>{unestimated ? ` · ${unestimated} non estimé${unestimated > 1 ? "s" : ""}` : ""}
        </span>
        {actions}
      </div>
      {open && (
        <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="mt-1 overflow-hidden rounded-md border bg-card">
            {groups.map((g) => (
              <div key={g.key}>
                {g.label && <div className="border-b bg-surface-subtle px-3 py-1">{g.label}</div>}
                <ul>{g.items.map((i) => <Row key={i.id} issue={i} selected={selected.has(i.id)} onSelect={(v) => toggle(i.id, v)} canDrag={canDrag} canEdit={canEdit} />)}</ul>
              </div>
            ))}
            {!issues.length && <p className="px-3 py-4 text-center text-body-sm text-muted-foreground">{id === BACKLOG ? "Le backlog est vide." : "Glissez des tickets ici pour planifier ce sprint."}</p>}
            {footer}
          </div>
        </SortableContext>
      )}
    </section>
  );
}

function QuickAdd({ projectId }: { projectId: string }) {
  const [title, setTitle] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  return (
    <form
      className="flex items-center gap-2 border-t px-3 py-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (title.trim().length < 3) return void toast.error("Le titre doit contenir au moins 3 caractères.");
        setPending(true);
        const r = await createIssueAction({ projectId, title, type: "STORY", labelIds: [] } as never);
        setPending(false);
        if (!r.ok) return void toast.error(r.error);
        toast.success(`Ticket ${r.data.key} ajouté au backlog`);
        setTitle("");
        router.refresh();
      }}
    >
      <Plus className="size-4 text-muted-foreground" aria-hidden />
      <label htmlFor="bl-quick" className="sr-only">Ajouter une story au backlog</label>
      <input id="bl-quick" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={240} placeholder="Ajouter une story au backlog… (Entrée)" className="h-7 flex-1 bg-transparent text-body outline-none placeholder:text-muted-foreground" />
      {title && <Button size="xs" variant="primary" type="submit" loading={pending}>Ajouter</Button>}
    </form>
  );
}

function BulkBar({ ids, clear, sprints, members, canSprint, canArchive }: { ids: string[]; clear: () => void; sprints: SprintLite[]; members: UserLite[]; canSprint: boolean; canArchive: boolean }) {
  const router = useRouter();
  const run = async (patch: Parameters<typeof bulkUpdateAction>[0]["patch"], label: string) => {
    const r = await bulkUpdateAction({ issueIds: ids, patch });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${r.data} ticket(s) ${label}`);
    clear();
    router.refresh();
  };
  return (
    <div role="toolbar" aria-label="Actions groupées" className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-lg border bg-popover px-3 py-2 shadow-overlay">
      <span className="text-body-sm font-semibold">{ids.length} sélectionné{ids.length > 1 ? "s" : ""}</span>
      {canSprint && (
        <Select onValueChange={async (v) => { const r = await assignToSprintAction({ sprintId: v === BACKLOG ? null : v, issueIds: ids }); if (!r.ok) return void toast.error(r.error); toast.success("Tickets déplacés"); clear(); router.refresh(); }}>
          <SelectTrigger size="sm" className="w-44" aria-label="Déplacer vers"><SelectValue placeholder="Déplacer vers…" /></SelectTrigger>
          <SelectContent>
            {sprints.filter((s) => s.status !== "COMPLETED").map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            <SelectSeparator />
            <SelectItem value={BACKLOG}>Backlog</SelectItem>
          </SelectContent>
        </Select>
      )}
      <Select onValueChange={(v) => run({ priority: v as never }, "repriorisé(s)")}>
        <SelectTrigger size="sm" className="w-36" aria-label="Priorité"><SelectValue placeholder="Priorité…" /></SelectTrigger>
        <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}><PriorityIcon priority={p} withLabel /></SelectItem>)}</SelectContent>
      </Select>
      <Select onValueChange={(v) => run({ assigneeId: v === "none" ? null : v }, "assigné(s)")}>
        <SelectTrigger size="sm" className="w-44" aria-label="Assigner"><SelectValue placeholder="Assigner à…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Non assigné</SelectItem>
          {members.map((m) => <SelectItem key={m.id} value={m.id}><UserName user={m} /></SelectItem>)}
        </SelectContent>
      </Select>
      {canArchive && <Button size="sm" variant="ghost" onClick={() => run({ archive: true }, "archivé(s)")}><Archive aria-hidden />Archiver</Button>}
      <Button size="icon-sm" variant="ghost" onClick={clear} aria-label="Annuler la sélection"><X aria-hidden /></Button>
    </div>
  );
}

export function BacklogClient(p: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(p.issues);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [groupByEpic, setGroupByEpic] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const snapshot = React.useRef<IssueCardData[]>(p.issues);
  React.useEffect(() => {
    setItems(p.issues);
    setSelected((s) => new Set([...s].filter((id) => p.issues.some((i) => i.id === id))));
  }, [p.issues]);

  const canDrag = p.perms.prioritize && !groupByEpic;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const sectionFor = (overId: string) => (overId.startsWith("section:") ? overId.slice(8) : (() => { const i = items.find((x) => x.id === overId); return i ? sectionOf(i) : undefined; })());

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    snapshot.current = items;
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const to = sectionFor(String(over.id));
    const cur = items.find((i) => i.id === active.id);
    if (!to || !cur || sectionOf(cur) === to) return;
    if (!p.perms.sprint) return;
    setItems((l) => l.map((i) => (i.id === active.id ? { ...i, sprintId: to === BACKLOG ? null : to } : i)));
  };
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return setItems(snapshot.current);
    let list = items;
    const overId = String(over.id);
    if (!overId.startsWith("section:") && overId !== active.id) {
      const from = list.findIndex((i) => i.id === active.id), to = list.findIndex((i) => i.id === overId);
      list = [...list];
      const [m] = list.splice(from, 1);
      list.splice(to, 0, m!);
      setItems(list);
    }
    const moved = list.find((i) => i.id === active.id)!;
    const peers = list.filter((i) => sectionOf(i) === sectionOf(moved));
    const idx = peers.findIndex((i) => i.id === moved.id);
    const r = await reorderIssueAction({ issueId: moved.id, beforeId: peers[idx - 1]?.id ?? null, afterId: peers[idx + 1]?.id ?? null, sprintId: moved.sprintId });
    if (!r.ok) {
      toast.error(r.error);
      setItems(snapshot.current);
    } else router.refresh();
  };

  const active = p.sprints.find((s) => s.status === "ACTIVE");
  const planned = p.sprints.filter((s) => s.status === "PLANNED");
  const dragged = items.find((i) => i.id === activeId);
  const sectionIssues = (id: string) => items.filter((i) => sectionOf(i) === id);

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        members={p.members}
        trailing={
          <>
            <div className="flex items-center gap-2"><Switch id="bl-group" checked={groupByEpic} onCheckedChange={setGroupByEpic} /><Label htmlFor="bl-group" className="font-normal text-foreground">Grouper par épopée</Label></div>
            {p.perms.sprint && <SprintFormDialog projectId={p.projectId} />}
          </>
        }
      />
      {groupByEpic && <p className="text-caption text-muted-foreground">Le glisser-déposer est désactivé pendant le regroupement par épopée.</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setItems(snapshot.current))}>
        {[...(active ? [active] : []), ...planned].map((s) => {
          const list = sectionIssues(s.id);
          return (
            <Section
              key={s.id}
              id={s.id}
              title={<>{s.name} <span className="ml-1 rounded-sm bg-status-encours-bg px-1.5 py-0.5 align-middle text-[0.6875rem] font-bold tracking-[0.03em] text-status-encours-fg uppercase">{sprintStatusLabels[s.status]}</span></>}
              meta={<>{formatDate(s.startDate, { day: "numeric", month: "short" })} – {formatDate(s.endDate, { day: "numeric", month: "short" })}{s.goal ? ` · ${s.goal}` : ""}</>}
              issues={list}
              selected={selected}
              setSelected={setSelected}
              canDrag={canDrag}
              canEdit={p.perms.edit}
              groupByEpic={groupByEpic}
              epics={p.epics}
              actions={
                p.perms.sprint && (
                  <div className="flex items-center gap-1">
                    {s.status === "ACTIVE" ? (
                      <CompleteSprintButton size="xs" sprint={s} done={list.filter((i) => i.status.category === "DONE").length} unfinished={list.filter((i) => i.status.category !== "DONE").length} planned={planned} />
                    ) : (
                      <StartSprintButton sprint={{ ...s, points: list.reduce((a, i) => a + (i.storyPoints ?? 0), 0), count: list.length }} disabledReason={active ? `Terminez d'abord ${active.name}.` : !list.length ? "Ajoutez des tickets au sprint." : undefined} />
                    )}
                    <SprintMenu sprint={s} projectId={p.projectId} />
                  </div>
                )
              }
            />
          );
        })}
        <Section id={BACKLOG} title="Backlog" meta="Non planifié, par ordre de priorité" issues={sectionIssues(BACKLOG)} selected={selected} setSelected={setSelected} canDrag={canDrag} canEdit={p.perms.edit} groupByEpic={groupByEpic} epics={p.epics} footer={p.perms.create ? <QuickAdd projectId={p.projectId} /> : undefined} />
        <DragOverlay>{dragged ? <div className="flex h-10 items-center gap-2 rounded-md bg-card px-3 shadow-overlay"><IssueTypeIcon type={dragged.type} /><IssueKey issueKey={dragged.key} /><span className="truncate text-body">{dragged.title}</span></div> : null}</DragOverlay>
      </DndContext>
      {selected.size > 0 && <BulkBar ids={[...selected]} clear={() => setSelected(new Set())} sprints={p.sprints} members={p.members} canSprint={p.perms.sprint} canArchive={p.perms.archive} />}
      <span className="sr-only">{displayName(null)}</span>
    </div>
  );
}

function SprintMenu({ sprint, projectId }: { sprint: SprintLite; projectId: string }) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button size="icon-xs" variant="ghost" aria-label={`Actions pour ${sprint.name}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <SprintFormDialog projectId={projectId} sprint={sprint} trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}><Pencil aria-hidden />Modifier</DropdownMenuItem>} />
        {sprint.status === "PLANNED" && (
          <DropdownMenuItem destructive onSelect={async () => { const r = await deleteSprintAction({ sprintId: sprint.id }); if (!r.ok) return void toast.error(r.error); toast.success("Sprint supprimé, tickets renvoyés au backlog"); router.refresh(); }}>
            <Trash2 aria-hidden />Supprimer
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
