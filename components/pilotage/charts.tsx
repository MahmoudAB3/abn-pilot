"use client";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

/**
 * Graphiques : couleurs catégorielles en ordre fixe (validées daltonisme), un seul axe Y,
 * infobulle au survol, légende dès 2 séries, table équivalente pour lecteurs d'écran.
 * Uniquement des données réelles : les points manquants restent vides (jamais interpolés).
 */
const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
type TipEntry = { dataKey?: string | number; name?: string; value?: number | null; color?: string };

function Tip({ active, payload, label, unit, labelFormat }: { active?: boolean; payload?: TipEntry[]; label?: string | number; unit?: string; labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-caption shadow-overlay">
      <p className="mb-1 font-semibold">{labelFormat ? labelFormat(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{p.value ?? "—"}{unit}</span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-secondary">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={i.dashed ? { backgroundImage: `linear-gradient(90deg, ${i.color} 50%, transparent 50%)`, backgroundSize: "6px 2px" } : { background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function SrTable<T extends Record<string, unknown>>({ caption, rows, cols }: { caption: string; rows: T[]; cols: { key: keyof T; label: string }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{cols.map((c) => <th key={String(c.key)} scope="col">{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={String(c.key)}>{String(r[c.key] ?? "—")}</td>)}</tr>)}</tbody>
    </table>
  );
}

function useMounted() {
  const [m, setM] = React.useState(false);
  React.useEffect(() => setM(true), []);
  return m;
}
const short = (d: string) => formatDate(d, { day: "2-digit", month: "2-digit" });

export function BurndownChart({ data, className }: { data: { date: string; ideal: number; remaining: number | null }[]; className?: string }) {
  const mounted = useMounted();
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <Legend items={[{ label: "Points restants (relevés quotidiens)", color: "var(--chart-1)" }, { label: "Référence idéale", color: "var(--muted-foreground)", dashed: true }]} />
      <div className="h-56" aria-hidden>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="date" {...axis} tickFormatter={short} interval="preserveStartEnd" />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<Tip unit=" pts" labelFormat={(l) => formatDate(l)} />} cursor={{ stroke: "var(--border-strong)" }} />
              <Line name="Référence" dataKey="ideal" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
              <Line name="Restants" dataKey="remaining" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: "var(--chart-1)" }} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <SrTable caption="Burndown du sprint" rows={data} cols={[{ key: "date", label: "Jour" }, { key: "remaining", label: "Points restants" }, { key: "ideal", label: "Référence" }]} />
    </figure>
  );
}

export function VelocityChart({ data, className }: { data: { name: string; committed: number; completed: number }[]; className?: string }) {
  const mounted = useMounted();
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <Legend items={[{ label: "Engagés", color: "var(--chart-1)" }, { label: "Livrés", color: "var(--chart-2)" }]} />
      <div className="h-56" aria-hidden>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<Tip unit=" pts" />} cursor={{ fill: "var(--surface-hover)", opacity: 0.6 }} />
              <Bar name="Engagés" dataKey="committed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
              <Bar name="Livrés" dataKey="completed" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <SrTable caption="Vélocité par sprint" rows={data} cols={[{ key: "name", label: "Sprint" }, { key: "committed", label: "Engagés" }, { key: "completed", label: "Livrés" }]} />
    </figure>
  );
}

export function ThroughputChart({ data }: { data: { week: string; issues: number; points: number }[] }) {
  const mounted = useMounted();
  return (
    <figure className="flex flex-col gap-2">
      <div className="h-56" aria-hidden>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }} barCategoryGap="30%">
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="week" {...axis} tickFormatter={short} />
              <YAxis {...axis} allowDecimals={false} />
              <Tooltip content={<Tip unit=" tickets" labelFormat={(l) => `Semaine du ${formatDate(l)}`} />} cursor={{ fill: "var(--surface-hover)", opacity: 0.6 }} />
              <Bar name="Terminés" dataKey="issues" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <SrTable caption="Tickets terminés par semaine" rows={data} cols={[{ key: "week", label: "Semaine" }, { key: "issues", label: "Tickets" }, { key: "points", label: "Points" }]} />
    </figure>
  );
}

export function HorizontalBars({ data, unit, label }: { data: { label: string; value: number; hint?: string }[]; unit?: string; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2.5" aria-label={label}>
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-3 text-body-sm">
          <span className="truncate text-fg-secondary">{d.label}</span>
          <span className="h-2.5 rounded-r-[4px] bg-chart-1" style={{ width: `${Math.max(2, (d.value / max) * 100)}%` }} title={d.hint} />
          <span className="text-right font-semibold tabular-nums">{d.value.toLocaleString("fr-FR")}{unit}</span>
        </li>
      ))}
    </ul>
  );
}
