// Display formatting. Missing values always render as an em dash, never as 0.

export const DASH = "—";

const isMissing = (v: number | null | undefined): v is null | undefined =>
  v === null || v === undefined || !Number.isFinite(v);

/** A percentile (0–100) as a whole number. */
export function formatPct(p: number | null | undefined): string {
  return isMissing(p) ? DASH : p.toFixed(0);
}

/** A measure value with `digits` significant digits. */
export function formatValue(v: number | null | undefined, digits = 3): string {
  if (isMissing(v)) return DASH;
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  return Number(v.toPrecision(digits)).toString();
}

/** `YYYY-MM-DD` from an ISO-ish timestamp (DocDB uses both `T…Z` and `… +00:00`). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : DASH;
}

/** Seconds as `h:mm:ss` or `m:ss`. */
export function formatDuration(s: number | null | undefined): string {
  if (isMissing(s)) return DASH;
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** An integer count with thousands separators. */
export function formatCount(n: number | null | undefined): string {
  return isMissing(n) ? DASH : Math.round(n).toLocaleString("en-US");
}
