// Breathing rate from the inhalation onsets' inter-onset intervals.

const STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60];

/**
 * The rolling window that suits a visible span of `span` seconds: about a hundredth of it, floored
 * to a round step so small zooms do not change it, 0 (each interval) below half a second — a
 * few-breath view — and at most a minute.
 */
export function autoRateWindow(span: number): number {
  const w = span / 100;
  let out = 0;
  for (const s of STEPS) if (s <= w) out = s;
  return out;
}

export interface Rate {
  t: Float64Array;
  hz: Float64Array;
}

/**
 * window = 0: the instantaneous rate 1/IOI as steps, each starting at its interval's first onset
 * (the last step is repeated at the last onset so it draws). window > 0 (seconds): at each
 * interval's midpoint, the mean rate of the intervals whose midpoints are within ±window/2 — a
 * centred rolling mean in O(n) with two pointers over a prefix sum. Intervals longer than `maxGap`
 * seconds are pauses in detection, not breaths: NaN (a gap in the line) and left out of the means.
 */
export function breathingRate(onsets: ArrayLike<number>, window: number, maxGap = 2): Rate {
  const n = onsets.length - 1;
  if (n < 1) return { t: new Float64Array(0), hz: new Float64Array(0) };
  const inst = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = onsets[i + 1] - onsets[i];
    inst[i] = d > 0 && d <= maxGap ? 1 / d : NaN;
  }
  if (!(window > 0)) {
    const t = new Float64Array(n + 1);
    const hz = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) [t[i], hz[i]] = [onsets[i], inst[i]];
    [t[n], hz[n]] = [onsets[n], inst[n - 1]];
    return { t, hz };
  }
  const mid = new Float64Array(n);
  const sum = new Float64Array(n + 1);
  const cnt = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    mid[i] = (onsets[i] + onsets[i + 1]) / 2;
    const ok = !Number.isNaN(inst[i]);
    sum[i + 1] = sum[i] + (ok ? inst[i] : 0);
    cnt[i + 1] = cnt[i] + (ok ? 1 : 0);
  }
  const hz = new Float64Array(n);
  const half = window / 2;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (lo < n && mid[lo] < mid[i] - half) lo++;
    while (hi < n && mid[hi] <= mid[i] + half) hi++;
    const c = cnt[hi] - cnt[lo];
    hz[i] = Number.isNaN(inst[i]) || c === 0 ? NaN : (sum[hi] - sum[lo]) / c;
  }
  return { t: mid, hz };
}
