import { cn } from "@/lib/utils";

/** Indicateur compact. Le libellé décrit toujours la source de la valeur. */
export function Kpi({ label, value, unit, hint, tone, className }: { label: string; value: string | number; unit?: string; hint?: string; tone?: "danger" | "warning" | "success"; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-lg border bg-card px-4 py-3", className)}>
      <p className="text-body-sm font-medium text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1">
        <span className={cn("text-display font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "warning" && "text-warning", tone === "success" && "text-success")}>{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</span>
        {unit && <span className="text-body text-muted-foreground">{unit}</span>}
      </p>
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}
