// How strongly to tint a percentile cell: distance from the median toward the measure's worse
// side (0 = median or better side, 1 = the extreme of the worse tail). A position, not a verdict.

export function atypicality(pct: number | null | undefined, better: "higher" | "lower" | null): number {
  if (better === null || pct === null || pct === undefined || !Number.isFinite(pct)) return 0;
  const toward = better === "higher" ? 50 - pct : pct - 50;
  return Math.min(1, Math.max(0, toward / 50));
}

/** Percent of the atypicality hue mixed into the surface (single-hue sequential, capped for legibility). */
export function shadeMix(a: number): number {
  return Math.round(45 * Math.pow(Math.min(1, Math.max(0, a)), 1.5));
}
