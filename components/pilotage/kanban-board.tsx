"use client";
import * as React from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { moveIssueAction, createIssueAction } from "@/modules/issues/actions";
import type { IssueCardData } from "@/lib/serialize";
import { displayName } from "@/lib/serialize";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { IssueCard } from "./issue-card";
import { useIssuePanel } from "./issue-panel";
import { EpicLabel, UserAvatar } from "./meta";
import { useRouter } from "next/navigation";

export interface BoardStatus { id: string; name: string; category: string; wipLimit: number | null }
export type Swimlane = "none" | "assignee" | "epic";

const colId = (lane: string, status: string) => `col::${lane}::${status}`;

function SortableCard({ issue, canMove, onShift }: { issue: IssueCardData; canMove: boolean; onShift: (key: string, dir: -1 | 1) => void }) {
  const panel = useIssuePanel();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled: !canMove });
  return (
    <IssueCard
      ref={setNodeRef}
      issue={issue}
      placeholder={isDragging}
      selected={panel.current === issue.key}
      onOpen={(i) => panel.open(i.key)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={(e) => {
        if (e.key === "Enter") return (e.preventDefault(), panel.open(issue.key));
        if (canMove && e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) return (e.preventDefault(), onShift(issue.id, e.key === "ArrowRight" ? 1 : -1));
        listeners?.onKeyDown?.(e);
      }}
      aria-roledescription="carte déplaçable"
      aria-keyshortcuts="Enter Space Shift+ArrowLeft Shift+ArrowRight"
    />
  );
}

function Column({ lane, status, items, canMove, canCreate, onShift, onQuickCreate, count, showHeader }: { lane: string; status: BoardStatus; items: IssueCardData[]; canMove: boolean; canCreate: boolean; onShift: (id: string, dir: -1 | 1) => void; onQuickCreate: (statusId: string, title: string) => Promise<boolean>; count: number; showHeader: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: colId(lane, status.id) });
  const over = status.wipLimit != null && count > status.wipLimit;
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const headingId = React.useId();
  return (
    <section ref={setNodeRef} aria-labelledby={headingId} className={cn("flex w-[17.5rem] shrink-0 flex-col rounded-md bg-surface-sunken transition-colors", isOver && "bg-selected/70 ring-2 ring-selected-border ring-inset", over && "bg-warning-subtle/60")}>
      <header className={cn("flex h-9 items-center gap-1.5 px-2.5", !showHeader && "sr-only")}>
        <h2 id={headingId} className="truncate text-overline-caps text-muted-foreground">{status.name}</h2>
        <span className={cn("text-overline-caps", over ? "text-warning-subtle-foreground" : "text-muted-foreground")}>
          {count}{status.wipLimit != null && <span className="font-medium"> / {status.wipLimit}</span>}
        </span>
        {over && <span className="sr-only">Limite WIP dépassée</span>}
      </header>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("flex min-h-20 flex-1 flex-col gap-1.5 px-1.5 pb-1.5", !showHeader && "pt-1.5")}>
          {items.map((i) => <SortableCard key={i.id} issue={i} canMove={canMove} onShift={onShift} />)}
        </div>
      </SortableContext>
      {canCreate && (adding ? (
        <form
          className="mx-1.5 mb-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (title.trim().length < 3) return;
            if (await onQuickCreate(status.id, title)) setTitle("");
          }}
        >
          <label htmlFor={`qc-${lane}-${status.id}`} className="sr-only">Nouveau ticket dans {status.name}</label>
          <textarea id={`qc-${lane}-${status.id}`} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} rows={2} maxLength={240} placeholder="Que faut-il faire ?" className="w-full resize-none rounded-md border border-ring bg-card p-2 text-body outline-none ring-2 ring-ring/25"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
              if (e.key === "Escape") setAdding(false);
            }} />
          <div className="mt-1 flex justify-end gap-1">
            <Button size="xs" variant="ghost" type="button" onClick={() => setAdding(false)}>Annuler</Button>
            <Button size="xs" variant="primary" type="submit">Créer</Button>
          </div>
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="mx-1.5 mb-1.5 justify-start text-muted-foreground" onClick={() => setAdding(true)}><Plus aria-hidden />Créer un ticket</Button>
      ))}
    </section>
  );
}

/**
 * Tableau Kanban — mise à jour optimiste, persistance en base, annulation si le serveur refuse.
 * Clavier : Entrée ouvre · Maj + ←/→ change de colonne · Espace saisit/dépose · Échap annule.
 */
export function KanbanBoard({ issues, statuses, projectId, sprintId, canMove, canCreate, swimlane }: { issues: IssueCardData[]; statuses: BoardStatus[]; projectId: string; sprintId: string | null; canMove: boolean; canCreate: boolean; swimlane: Swimlane }) {
  const router = useRouter();
  const [items, setItems] = React.useState(issues);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const origin = React.useRef<IssueCardData[] | null>(null);
  React.useEffect(() => setItems(issues), [issues]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const lanes = React.useMemo((): { id: string; title: React.ReactNode; filter: (i: IssueCardData) => boolean }[] => {
    if (swimlane === "none") return [{ id: "all", title: null, filter: () => true }];
    if (swimlane === "assignee") {
      const users = new Map<string, IssueCardData["assignee"]>();
      for (const i of issues) if (i.assignee) users.set(i.assignee.id, i.assignee);
      return [...[...users.values()].sort((a, b) => displayName(a).localeCompare(displayName(b))).map((u) => ({ id: u!.id, title: <span className="flex items-center gap-2"><UserAvatar user={u} size="xs" decorative />{displayName(u)}</span>, filter: (i: IssueCardData) => i.assignee?.id === u!.id })), { id: "none", title: "Non assignés", filter: (i: IssueCardData) => !i.assignee }];
    }
    const epics = new Map<string, NonNullable<IssueCardData["parent"]>>();
    for (const i of issues) if (i.parent?.type === "EPIC") epics.set(i.parent.id, i.parent);
    return [...[...epics.values()].map((e) => ({ id: e.id, title: <EpicLabel epicKey={e.key} title={`${e.key} · ${e.title}`} />, filter: (i: IssueCardData) => i.parent?.id === e.id })), { id: "none", title: "Sans épopée", filter: (i: IssueCardData) => i.parent?.type !== "EPIC" }];
  }, [issues, swimlane]);

  const findStatus = (overId: string): string | undefined => {
    if (overId.startsWith("col::")) return overId.split("::")[2];
    return items.find((i) => i.id === overId)?.statusId;
  };

  const persist = async (id: string, statusId: string, list: IssueCardData[]) => {
    const inCol = list.filter((i) => i.statusId === statusId);
    const idx = inCol.findIndex((i) => i.id === id);
    const r = await moveIssueAction({ issueId: id, statusId, beforeId: inCol[idx - 1]?.id ?? null, afterId: inCol[idx + 1]?.id ?? null });
    if (!r.ok) {
      toast.error(r.error);
      setItems(origin.current ?? issues);
      return false;
    }
    setItems((l) => l.map((i) => (i.id === id ? { ...i, rank: r.data.rank } : i)));
    return true;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    origin.current = items;
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const to = findStatus(String(over.id));
    const cur = items.find((i) => i.id === active.id);
    if (!to || !cur || cur.statusId === to) return;
    const st = statuses.find((s) => s.id === to)!;
    setItems((l) => l.map((i) => (i.id === active.id ? { ...i, statusId: to, status: { id: st.id, name: st.name, category: st.category } } : i)));
  };
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return setItems(origin.current ?? issues);
    let list = items;
    const overId = String(over.id);
    if (!overId.startsWith("col::") && overId !== active.id) {
      const from = list.findIndex((i) => i.id === active.id);
      const to = list.findIndex((i) => i.id === overId);
      if (from > -1 && to > -1) {
        list = [...list];
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved!);
        setItems(list);
      }
    }
    const moved = list.find((i) => i.id === active.id)!;
    const before = origin.current?.find((i) => i.id === active.id);
    if (before?.statusId === moved.statusId && list.indexOf(moved) === origin.current!.findIndex((i) => i.id === moved.id)) return;
    if (await persist(moved.id, moved.statusId, list)) {
      if (before && before.statusId !== moved.statusId) toast.success(`${moved.key} → « ${moved.status.name} »`);
      router.refresh();
    }
  };

  const shift = async (id: string, dir: -1 | 1) => {
    const cur = items.find((i) => i.id === id)!;
    const idx = statuses.findIndex((s) => s.id === cur.statusId);
    const st = statuses[idx + dir];
    if (!st) return;
    origin.current = items;
    const list = items.map((i) => (i.id === id ? { ...i, statusId: st.id, status: { id: st.id, name: st.name, category: st.category } } : i));
    setItems(list);
    if (await persist(id, st.id, list)) {
      toast.success(`${cur.key} → « ${st.name} »`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-issue-key="${cur.key}"]`)?.focus());
      router.refresh();
    }
  };

  const quickCreate = async (statusId: string, title: string) => {
    const r = await createIssueAction({ projectId, title, type: "TASK", statusId, sprintId, labelIds: [] } as never);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    toast.success(`Ticket ${r.data.key} créé`);
    router.refresh();
    return true;
  };

  const label = (id: string | number) => items.find((i) => i.id === id)?.key ?? "";
  const colName = (id: string | number) => statuses.find((s) => s.id === findStatus(String(id)))?.name ?? "";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Ticket ${label(active.id)} saisi, colonne ${colName(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `Ticket ${label(active.id)} au-dessus de ${colName(over.id)}.` : `Ticket ${label(active.id)} hors colonne.`),
    onDragEnd: ({ active, over }) => (over ? `Ticket ${label(active.id)} déposé dans ${colName(over.id)}.` : `Ticket ${label(active.id)} déposé.`),
    onDragCancel: ({ active }) => `Déplacement de ${label(active.id)} annulé.`,
  };
  const active = items.find((i) => i.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => (setActiveId(null), setItems(origin.current ?? issues))}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "Entrée ouvre le ticket. Maj + flèche gauche ou droite le déplace vers la colonne voisine. Espace saisit la carte, flèches pour la déplacer, Espace pour la déposer, Échap pour annuler." } }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pb-3">
        {lanes.map((lane, li) => {
          const laneItems = items.filter(lane.filter);
          if (swimlane !== "none" && !laneItems.length) return null;
          return (
            <div key={lane.id} className="flex flex-col gap-1.5">
              {lane.title && <h3 className="sticky left-0 flex items-center gap-2 text-body-sm font-semibold">{lane.title}<span className="font-normal text-muted-foreground">{laneItems.length}</span></h3>}
              <div className="flex gap-2">
                {statuses.map((s) => (
                  <Column key={s.id} lane={lane.id} status={s} items={laneItems.filter((i) => i.statusId === s.id)} count={items.filter((i) => i.statusId === s.id).length} canMove={canMove} canCreate={canCreate && li === 0 && swimlane === "none"} onShift={shift} onQuickCreate={quickCreate} showHeader={li === 0} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}>{active ? <IssueCard issue={active} dragging className="w-[16.75rem]" /> : null}</DragOverlay>
    </DndContext>
  );
}
