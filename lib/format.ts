/** Dates et nombres au format français. */
const tz = "Africa/Casablanca";

export function formatDate(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // Les dates « jour » (échéances) sont stockées à minuit UTC : on les affiche en UTC.
  const dateOnly = typeof d === "string" ? /T00:00:00(\.000)?Z$/.test(d) : date.getUTCHours() === 0 && date.getUTCMinutes() === 0;
  return new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: dateOnly ? "UTC" : tz }).format(date);
}

export const formatDateTime = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(d)) : "—";

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
export function timeAgo(d: string | Date) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(d);
}

export const formatNumber = (n: number, digits = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
export const formatMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`);

/** Valeur pour <input type="date"> à partir d'une date « jour ». */
export const toDateInput = (d: string | Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export const isOverdue = (due: string | Date | null | undefined, category?: string) =>
  !!due && category !== "DONE" && new Date(due).getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime();
