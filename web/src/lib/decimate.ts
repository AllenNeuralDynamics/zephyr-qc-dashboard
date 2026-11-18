// Min/max decimation for drawing long traces: per pixel bucket keep the lowest and highest
// sample (in time order), so peaks never disappear however far the view is zoomed out.

export function decimate(
  x: Float64Array,
  y: ArrayLike<number>,
  i0: number,
  i1: number,
  buckets: number,
): { x: Float64Array; y: Float64Array } {
  const n = i1 - i0;
  if (n <= 4 * buckets) {
    return { x: x.slice(i0, i1), y: Float64Array.from({ length: n }, (_, k) => y[i0 + k]) };
  }
  const ox = new Float64Array(2 * buckets);
  const oy = new Float64Array(2 * buckets);
  let o = 0;
  for (let b = 0; b < buckets; b++) {
    const s = i0 + Math.floor((b * n) / buckets);
    const e = i0 + Math.floor(((b + 1) * n) / buckets);
    if (e <= s) continue;
    let lo = s;
    let hi = s;
    for (let i = s + 1; i < e; i++) {
      if (y[i] < y[lo]) lo = i;
      if (y[i] > y[hi]) hi = i;
    }
    const [a, c] = lo <= hi ? [lo, hi] : [hi, lo];
    ox[o] = x[a];
    oy[o++] = y[a];
    if (c !== a) {
      ox[o] = x[c];
      oy[o++] = y[c];
    }
  }
  return { x: ox.slice(0, o), y: oy.slice(0, o) };
}

/** Index range [i0, i1) of sorted `x` covering [min, max], one sample of margin each side. */
export function visibleRange(x: Float64Array, min: number, max: number): [number, number] {
  const lower = (v: number) => {
    let lo = 0;
    let hi = x.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (x[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  // lower(max) is the first sample at/after max: include it (the margin), exclusive end one past it
  return [Math.max(0, lower(min) - 1), Math.min(x.length, lower(max) + 1)];
}
