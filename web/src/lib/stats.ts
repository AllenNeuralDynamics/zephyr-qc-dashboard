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
