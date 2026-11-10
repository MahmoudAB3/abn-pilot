"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Clock, FolderKanban, MessageSquare, Search } from "lucide-react";
import { Command } from "cmdk";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { IssueTypeIcon, StatusBadge } from "@/components/pilotage/meta";
import { useIssuePanel } from "@/components/pilotage/issue-panel";
import { useI18n } from "@/lib/i18n";

interface SearchResult {
  issues: { id: string; key: string; title: string; type: string; projectKey: string; statusName: string; statusCategory: string }[];
  projects: { id: string; key: string; name: string }[];
  comments: { id: string; body: string; issueKey: string; issueTitle: string }[];
  recent?: { key: string; title: string; type: string }[];
}

/** Recherche globale (⌘/Ctrl + K) : clé exacte, plein texte, projets, commentaires, récents. */
export function SearchCommand({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const panel = useIssuePanel();
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(id);
  }, [q]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "/" && !(e.target as HTMLElement).closest("input,textarea,[contenteditable]")) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ["search", debounced],
    enabled: open,
    queryFn: async () => (await fetch(`/api/search?q=${encodeURIComponent(debounced)}`)).json(),
    placeholderData: (p) => p,
  });
  // Sélection par défaut : le premier résultat (et non l'élément « Voir tous les résultats »)
  const [selected, setSelected] = React.useState("");
  React.useEffect(() => {
    const first = data?.issues[0] ? `i-${data.issues[0].id}` : data?.projects[0] ? `p-${data.projects[0].id}` : data?.recent?.[0] ? `r-${data.recent[0].key}` : "all";
    setSelected(first);
  }, [data]);
  const go = (fn: () => void) => {
    onOpenChange(false);
    setQ("");
    fn();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12vh] translate-y-0 overflow-hidden p-0" hideClose aria-describedby={undefined}>
        <DialogTitle className="sr-only">Recherche globale</DialogTitle>
        <Command shouldFilter={false} loop value={selected} onValueChange={setSelected} className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <Command.Input value={q} onValueChange={setQ} placeholder={t("shell.search")} className="h-11 w-full bg-transparent text-body outline-none placeholder:text-muted-foreground" autoFocus />
            {isFetching && <span className="text-caption text-muted-foreground">…</span>}
          </div>
          <CommandList className="max-h-[60vh]">
            {debounced && data && !data.issues.length && !data.projects.length && !data.comments.length && <CommandEmpty>Aucun résultat pour « {debounced} ».</CommandEmpty>}
            {!debounced && !!data?.recent?.length && (
              <CommandGroup heading="Consultés récemment">
                {data.recent.map((i) => (
                  <CommandItem key={i.key} value={`r-${i.key}`} onSelect={() => go(() => panel.open(i.key))}>
                    <Clock className="text-muted-foreground" aria-hidden />
                    <span className="issue-key w-20 text-muted-foreground">{i.key}</span>
                    <span className="truncate">{i.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.issues.length && (
              <CommandGroup heading="Tickets">
                {data.issues.map((i) => (
                  <CommandItem key={i.id} value={`i-${i.id}`} onSelect={() => go(() => panel.open(i.key))}>
                    <IssueTypeIcon type={i.type as never} />
                    <span className="issue-key w-20 shrink-0 text-muted-foreground">{i.key}</span>
                    <span className="min-w-0 flex-1 truncate">{i.title}</span>
                    <StatusBadge name={i.statusName} category={i.statusCategory} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.projects.length && (
              <CommandGroup heading="Projets">
                {data.projects.map((p) => (
                  <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(() => router.push(`/projets/${p.key}`))}>
                    <FolderKanban className="text-muted-foreground" aria-hidden />
                    <span className="truncate">{p.name}</span>
                    <span className="issue-key ml-auto text-muted-foreground">{p.key}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!data?.comments.length && (
              <CommandGroup heading="Commentaires">
                {data.comments.map((c) => (
                  <CommandItem key={c.id} value={`c-${c.id}`} onSelect={() => go(() => panel.open(c.issueKey))}>
                    <MessageSquare className="text-muted-foreground" aria-hidden />
                    <span className="issue-key w-20 shrink-0 text-muted-foreground">{c.issueKey}</span>
                    <span className="truncate text-body-sm">{c.body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1")}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {debounced && (
              <CommandGroup>
                <CommandItem value="all" onSelect={() => go(() => router.push(`/recherche?q=${encodeURIComponent(debounced)}`))}>
                  <Search className="text-muted-foreground" aria-hidden />
                  Voir tous les résultats et filtrer
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
          <div className="flex gap-4 border-t px-3 py-2 text-caption text-muted-foreground">
            <span>↑↓ naviguer</span><span>Entrée ouvrir</span><span>Échap fermer</span><span className="ml-auto">C créer un ticket</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
