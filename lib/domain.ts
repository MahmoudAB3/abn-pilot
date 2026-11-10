import {
  Bookmark, Bug, CheckSquare, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp, CornerDownRight, Equal, Zap,
  type LucideIcon,
} from "lucide-react";
import { categoryLabels, priorityLabels, typeLabels } from "./labels";

/** Seul endroit qui associe un concept métier à des tokens de couleur et à des icônes. */
export type IssueTypeKey = keyof typeof typeLabels;
export type PriorityKey = keyof typeof priorityLabels;
export type CategoryKey = keyof typeof categoryLabels;
export type LabelColor = "jaune" | "orange" | "cyan" | "violet" | "vert" | "rose" | "bleu" | "gris";

export const typeMeta: Record<IssueTypeKey, { label: string; icon: LucideIcon; className: string }> = {
  EPIC: { label: typeLabels.EPIC, icon: Zap, className: "bg-type-epic" },
  STORY: { label: typeLabels.STORY, icon: Bookmark, className: "bg-type-story" },
  TASK: { label: typeLabels.TASK, icon: CheckSquare, className: "bg-type-tache" },
  BUG: { label: typeLabels.BUG, icon: Bug, className: "bg-type-bug" },
  SUBTASK: { label: typeLabels.SUBTASK, icon: CornerDownRight, className: "bg-type-soustache" },
};

export const priorityMeta: Record<PriorityKey, { label: string; icon: LucideIcon; className: string; rank: number }> = {
  CRITICAL: { label: priorityLabels.CRITICAL, icon: ChevronsUp, className: "text-prio-critique", rank: 0 },
  HIGH: { label: priorityLabels.HIGH, icon: ChevronUp, className: "text-prio-haute", rank: 1 },
  MEDIUM: { label: priorityLabels.MEDIUM, icon: Equal, className: "text-prio-moyenne", rank: 2 },
  LOW: { label: priorityLabels.LOW, icon: ChevronDown, className: "text-prio-basse", rank: 3 },
  LOWEST: { label: priorityLabels.LOWEST, icon: ChevronsDown, className: "text-prio-minimale", rank: 4 },
};

export const categoryClass: Record<CategoryKey, string> = {
  BACKLOG: "bg-status-afaire-bg text-status-afaire-fg",
  TODO: "bg-status-afaire-bg text-status-afaire-fg",
  IN_PROGRESS: "bg-status-encours-bg text-status-encours-fg",
  IN_REVIEW: "bg-status-revue-bg text-status-revue-fg",
  IN_TEST: "bg-status-test-bg text-status-test-fg",
  DONE: "bg-status-termine-bg text-status-termine-fg",
};

export const labelClass: Record<LabelColor, string> = {
  jaune: "bg-label-jaune-bg text-label-jaune-fg",
  orange: "bg-label-orange-bg text-label-orange-fg",
  cyan: "bg-label-cyan-bg text-label-cyan-fg",
  violet: "bg-label-violet-bg text-label-violet-fg",
  vert: "bg-label-vert-bg text-label-vert-fg",
  rose: "bg-label-rose-bg text-label-rose-fg",
  bleu: "bg-label-bleu-bg text-label-bleu-fg",
  gris: "bg-label-gris-bg text-label-gris-fg",
};
export const labelColors = Object.keys(labelClass) as LabelColor[];

/** Couleur stable d'une épopée (ou d'un projet) dérivée de sa clé. */
export function colorFor(seed: string): LabelColor {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (["jaune", "orange", "cyan", "violet", "vert", "rose", "bleu"] as const)[h % 7];
}

export const ISSUE_TYPES = Object.keys(typeMeta) as IssueTypeKey[];
export const PRIORITIES = Object.keys(priorityMeta) as PriorityKey[];
