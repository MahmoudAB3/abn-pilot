"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { displayName, type UserLite } from "@/lib/serialize";
import { inputBase } from "@/components/ui/input";
import { UserAvatar } from "./meta";

/**
 * Zone de saisie avec @mentions : « @ » ouvre une liste filtrée des membres du projet,
 * la sélection insère @[Nom](id), format reconnu par le serveur pour notifier la personne.
 * Navigation clavier : ↑ ↓ pour choisir, Entrée ou Tab pour insérer, Échap pour fermer.
 */
export function MentionTextarea({ id, label, value, onChange, members, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; members: UserLite[]; placeholder?: string }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = React.useState<{ start: number; text: string } | null>(null);
  const [active, setActive] = React.useState(0);
  const matches = query ? members.filter((m) => displayName(m).toLowerCase().includes(query.text.toLowerCase()) || m.email.toLowerCase().startsWith(query.text.toLowerCase())).slice(0, 6) : [];

  const detect = (v: string, caret: number) => {
    const before = v.slice(0, caret);
    const m = before.match(/(^|\s)@([\p{L}\p{N}._-]{0,30})$/u);
    setQuery(m ? { start: caret - m[2]!.length - 1, text: m[2]! } : null);
    setActive(0);
  };
  const insert = (u: UserLite) => {
    if (!query) return;
    const el = ref.current!;
    const caret = el.selectionStart;
    const token = `@[${displayName(u)}](${u.id}) `;
    const next = value.slice(0, query.start) + token + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = query.start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };
  const listId = `${id}-mentions`;
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <textarea
        ref={ref}
        id={id}
        value={value}
        placeholder={placeholder}
        rows={3}
        maxLength={20000}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className={cn(inputBase, "min-h-20 py-1.5 leading-5")}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (!matches.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insert(matches[active]!);
          } else if (e.key === "Escape") setQuery(null);
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <ul id={listId} role="listbox" className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border bg-popover p-1 shadow-overlay">
          {matches.map((m, i) => (
            <li
              key={m.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => (e.preventDefault(), insert(m))}
              className={cn("flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm", i === active && "bg-surface-hover")}
            >
              <UserAvatar user={m} size="xs" decorative />
              <span className="truncate">{displayName(m)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
