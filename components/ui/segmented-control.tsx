"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Bascule compacte (vue grille/liste, échelle de temps…).
 * À utiliser à la place d'onglets quand il n'y a pas de panneau associé.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode; hideLabelOnMobile?: boolean }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex items-center gap-0.5 rounded-md bg-surface-sunken p-0.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-body-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-4",
              on && "bg-card text-foreground shadow-card",
            )}
          >
            {o.icon}
            <span className={cn(o.hideLabelOnMobile && "sr-only sm:not-sr-only")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
