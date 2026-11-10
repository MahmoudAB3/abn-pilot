"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabels } from "@/lib/labels";
import type { UserLite } from "@/lib/serialize";
import { saveFilterAction, deleteFilterAction } from "@/modules/issues/actions";
import { Button } from "@/components/ui/button";
import { inputBase } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import { FilterBar, useUrlFilters } from "@/components/pilotage/filter-bar";

export function SearchFilters({ projects, members, saved }: { projects: { id: string; key: string; name: string }[]; members: UserLite[]; saved: { id: string; name: string; query: string }[] }) {
  const f = useUrlFilters();
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const cats = f.list("categorie");
  return (
    <div className="flex flex-col gap-2">
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => (e.preventDefault(), f.set("q", q.trim() || null))}>
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Clé (ERP-14), mots du titre ou de la description…" aria-label="Recherche plein texte" className={cn(inputBase, "h-9 pl-8")} />
        </div>
        <Select value={sp.get("projet") ?? "all"} onValueChange={(v) => f.set("projet", v === "all" ? null : v)}>
          <SelectTrigger className="h-9 w-48" aria-label="Projet"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Tous les projets</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.key}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant={cats.length ? "secondary" : "outline"} className="h-9">Statut{cats.length ? ` (${cats.length})` : ""}</Button></DropdownMenuTrigger>
          <DropdownMenuContent>{Object.entries(categoryLabels).map(([k, v]) => <DropdownMenuCheckboxItem key={k} checked={cats.includes(k)} onSelect={(e) => e.preventDefault()} onCheckedChange={(c) => f.set("categorie", c ? [...cats, k] : cats.filter((x) => x !== k))}>{v}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
        </DropdownMenu>
        <Button type="submit" variant="primary" className="h-9">Rechercher</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" className="h-9"><Bookmark aria-hidden />Filtres enregistrés</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Mes filtres</DropdownMenuLabel>
            {saved.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => router.push(`/recherche?${s.query}`)} className="justify-between">
                <span className="truncate">{s.name}</span>
                <button type="button" aria-label={`Supprimer ${s.name}`} onClick={async (e) => { e.stopPropagation(); await deleteFilterAction({ id: s.id }); router.refresh(); }} className="rounded-xs text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" aria-hidden /></button>
              </DropdownMenuItem>
            ))}
            {!saved.length && <p className="px-2 py-1.5 text-body-sm text-muted-foreground">Aucun filtre enregistré.</p>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={async () => {
              const name = window.prompt("Nom du filtre :");
              if (!name?.trim()) return;
              const r = await saveFilterAction({ name: name.trim(), projectId: null, filters: { url: sp.toString() } });
              if (!r.ok) toast.error(r.error); else { toast.success("Filtre enregistré"); router.refresh(); }
            }}>Enregistrer la recherche actuelle</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </form>
      <FilterBar members={members} />
    </div>
  );
}
