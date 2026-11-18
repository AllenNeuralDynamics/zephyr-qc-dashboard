// Statistics over values Zephyr wrote. Nothing here recomputes a QC measure.

type Maybe = number | null | undefined;

const known = (v: Maybe): v is number => v !== null && v !== undefined && Number.isFinite(v);

/** The finite values of `xs`, as a typed array (a reference column, ready for `percentile`). */
export function finite(xs: ArrayLike<Maybe>): Float64Array {
  const out: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i];
    if (known(v)) out.push(v);
  }
  return Float64Array.from(out);
}

/** Median of the known values; `null` when there are none. */
export function median(xs: ArrayLike<Maybe>): number | null {
  const v = finite(xs).sort();
  if (!v.length) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Where `value` lies among the reference values `ref` (already finite): the percentage of them
 * below it, ties counting half. Same definition as Zephyr's
 * `quality_control/reference.py::percentiles`. `null` without a value or without references.
 */
export function percentile(value: Maybe, ref: Float64Array): number | null {
  if (!known(value) || ref.length === 0) return null;
  let below = 0;
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] < value) below += 1;
    else if (ref[i] === value) below += 0.5;
  }
  return (100 * below) / ref.length;
}

export interface Spread {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  n: number;
}

/** Quantiles for a Zephyr-style box (middle half, 5–95 % whiskers, median); null when empty. */
export function spread(xs: ArrayLike<Maybe>): Spread | null {
  const v = finite(xs).sort();
  if (!v.length) return null;
  const q = (p: number) => {
    const i = p * (v.length - 1);
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), n: v.length };
}
