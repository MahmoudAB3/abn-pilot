"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ISSUE_TYPES, PRIORITIES } from "@/lib/domain";
import { displayName, type UserLite } from "@/lib/serialize";
import { Button } from "@/components/ui/button";
import { inputBase } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IssueTypeIcon, LabelChip, PriorityIcon, UserAvatar } from "./meta";

/**
 * Filtres portés par l'URL (partageables, conservés au rechargement) et appliqués côté serveur.
 * Paramètres : q, assignee (liste), priority, type, label, bloques (tableau uniquement).
 */
export function useUrlFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const list = (k: string) => sp.get(k)?.split(",").filter(Boolean) ?? [];
  const set = (k: string, v: string | string[] | null) => {
    const p = new URLSearchParams(sp.toString());
    const val = Array.isArray(v) ? v.join(",") : v;
    if (val) p.set(k, val);
    else p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return { sp, list, set, clear: () => router.replace(pathname, { scroll: false }) };
}

function MultiFilter<T extends string>({ label, values, options, onChange, render }: { label: string; values: string[]; options: T[]; onChange: (v: string[]) => void; render: (v: T) => React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant={values.length ? "secondary" : "ghost"} className={cn(values.length && "bg-selected text-selected-foreground hover:bg-selected")}>
          {label}
          {values.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[0.625rem] text-primary-foreground">{values.length}</span>}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuCheckboxItem key={o} checked={values.includes(o)} onSelect={(e) => e.preventDefault()} onCheckedChange={(c) => onChange(c ? [...values, o] : values.filter((x) => x !== o))}>
            {render(o)}
          </DropdownMenuCheckboxItem>
        ))}
        {values.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={false} onSelect={() => onChange([])}>Effacer</DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterBar({ members, labels, trailing, showTypes = true, showBlocked = false }: { members: UserLite[]; labels?: { id: string; name: string; color: string }[]; trailing?: React.ReactNode; showTypes?: boolean; showBlocked?: boolean }) {
  const f = useUrlFilters();
  const [q, setQ] = React.useState(f.sp.get("q") ?? "");
  React.useEffect(() => {
    const id = setTimeout(() => q !== (f.sp.get("q") ?? "") && f.set("q", q.trim() || null), 300);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignees = f.list("assignee");
  const active = ["q", "assignee", "priority", "type", "label", "bloques"].some((k) => f.sp.get(k));
  return (
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filtrer les tickets">
      <div className="relative w-full sm:w-52">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (clé ou titre)…" aria-label="Rechercher dans le tableau" className={cn(inputBase, "h-8 bg-surface-subtle pl-7 focus-visible:bg-card")} />
      </div>
      <div className="flex items-center -space-x-1" role="group" aria-label="Filtrer par assigné">
        {members.slice(0, 8).map((m) => {
          const on = assignees.includes(m.id);
          return (
            <button key={m.id} type="button" aria-pressed={on} title={displayName(m)} onClick={() => f.set("assignee", on ? assignees.filter((x) => x !== m.id) : [...assignees, m.id])} className={cn("rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:z-10", on && "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background")}>
              <UserAvatar user={m} size="md" decorative />
              <span className="sr-only">{displayName(m)}</span>
            </button>
          );
        })}
        <button type="button" aria-pressed={assignees.includes("none")} title="Non assignés" onClick={() => f.set("assignee", assignees.includes("none") ? assignees.filter((x) => x !== "none") : [...assignees, "none"])} className={cn("rounded-full", assignees.includes("none") && "z-10 ring-2 ring-primary ring-offset-1 ring-offset-background")}>
          <UserAvatar user={null} size="md" />
        </button>
      </div>
      <MultiFilter label="Priorité" values={f.list("priority")} options={PRIORITIES} onChange={(v) => f.set("priority", v)} render={(p) => <PriorityIcon priority={p} withLabel />} />
      {showTypes && <MultiFilter label="Type" values={f.list("type")} options={ISSUE_TYPES.filter((t) => t !== "EPIC")} onChange={(v) => f.set("type", v)} render={(t) => <IssueTypeIcon type={t} withLabel />} />}
      {labels && labels.length > 0 && (
        <MultiFilter label="Étiquette" values={f.list("label")} options={labels.map((l) => l.id)} onChange={(v) => f.set("label", v)} render={(id) => { const l = labels.find((x) => x.id === id)!; return <LabelChip name={l.name} color={l.color} />; }} />
      )}
      {showBlocked && (
        <Button size="sm" variant={f.sp.get("bloques") ? "secondary" : "ghost"} aria-pressed={Boolean(f.sp.get("bloques"))} onClick={() => f.set("bloques", f.sp.get("bloques") ? null : "1")} className={cn(f.sp.get("bloques") && "bg-selected text-selected-foreground hover:bg-selected")}>
          <Ban aria-hidden />Bloqués
        </Button>
      )}
      {active && <Button size="sm" variant="ghost" onClick={f.clear}><X aria-hidden />Effacer</Button>}
      {trailing && <div className="ml-auto flex flex-wrap items-center gap-2">{trailing}</div>}
    </div>
  );
}
