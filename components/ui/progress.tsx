"use client";
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";

type Tone = "actif" | "termine" | "retard" | "planifie";
const toneClass: Record<Tone, string> = {
  actif: "bg-sprint-actif",
  termine: "bg-sprint-termine",
  retard: "bg-sprint-retard",
  planifie: "bg-sprint-planifie",
};

export function Progress({
  value,
  tone = "actif",
  size = "md",
  label,
  className,
}: {
  value: number;
  tone?: Tone;
  size?: "sm" | "md";
  label: string;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <ProgressPrimitive.Root
      value={v}
      aria-label={label}
      className={cn("relative w-full overflow-hidden rounded-full bg-progress-track", size === "sm" ? "h-1" : "h-1.5", className)}
    >
      <ProgressPrimitive.Indicator className={cn("h-full rounded-full transition-[width]", toneClass[tone])} style={{ width: `${v}%` }} />
    </ProgressPrimitive.Root>
  );
}

/** Barre segmentée (terminé / en cours / à faire) — progression d'épopée ou de sprint. */
export function SegmentedProgress({
  done,
  inProgress,
  total,
  label,
  className,
}: {
  done: number;
  inProgress: number;
  total: number;
  label: string;
  className?: string;
}) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} terminés, ${inProgress} en cours sur ${total}`}
      className={cn("flex h-1.5 w-full overflow-hidden rounded-full bg-progress-track", className)}
    >
      <span className="h-full bg-sprint-termine" style={{ width: `${pct(done)}%` }} />
      <span className="h-full bg-sprint-actif" style={{ width: `${pct(inProgress)}%` }} />
    </div>
  );
}
