/** Axis ticks at the minimum and maximum of the finite values (so the max is always labelled). */
export function extentTicks(values: ArrayLike<number | null>): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || !Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return [];
  return lo === hi ? [hi] : [lo, hi];
}
