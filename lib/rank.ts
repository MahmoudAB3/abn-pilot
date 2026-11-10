/** Rang fractionnaire : insérer entre deux voisins sans renuméroter la liste. */
export const RANK_STEP = 1024;

export function rankBetween(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return RANK_STEP;
  if (before == null) return (after as number) - RANK_STEP;
  if (after == null) return before + RANK_STEP;
  return (before + after) / 2;
}

/** Vrai quand deux rangs voisins sont trop proches : prévoir un rééquilibrage. */
export const needsRebalance = (a: number, b: number) => Math.abs(b - a) < 1e-6;
