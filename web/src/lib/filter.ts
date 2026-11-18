// Filtering, sorting and searching index rows (pure; the table and palette use these).
import type { IndexRow } from "./index-types";
import type { MeasureName } from "./measures";

export interface Filters {
  subject: string[];
  rig: string[];
  experimenter: string[];
  /** inclusive day, `YYYY-MM-DD` */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: Filters = { subject: [], rig: [], experimenter: [], from: null, to: null };

export function filterRows(rows: IndexRow[], f: Filters): IndexRow[] {
  const dated = f.from !== null || f.to !== null;
  return rows.filter((r) => {
    if (f.subject.length && !(r.s && f.subject.includes(r.s))) return false;
    if (f.rig.length && !(r.r && f.rig.includes(r.r))) return false;
    if (f.experimenter.length && !r.e.some((e) => f.experimenter.includes(e))) return false;
    if (dated) {
      const day = r.t?.slice(0, 10);
      if (!day) return false;
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
    }
    return true;
  });
}

export type SortKey = "date" | MeasureName;

/**
 * Sorted copy; sessions without the value go last in both directions. Sorting by percentile puts
 * sessions that have none (no reference for their network) after those that do, ordered by value.
 */
export function sortRows(rows: IndexRow[], key: SortKey, by: "value" | "pct", dir: "asc" | "desc"): IndexRow[] {
  const num = (v: number | null | undefined): number | null => (v === undefined || v === null || !Number.isFinite(v) ? null : v);
  const keyOf = (r: IndexRow): [number, number | string | null] => {
    if (key === "date") return [0, r.t];
    const [value, pct] = r.m[key] ?? [null, null];
    if (by === "value") return [0, num(value)];
    return num(pct) !== null ? [0, num(pct)] : [1, num(value)];
  };
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r) => ({ r, k: keyOf(r) }))
    .sort((a, b) => {
      const [ga, va] = a.k;
      const [gb, vb] = b.k;
      if (va === null || vb === null) return va === null ? (vb === null ? ga - gb : 1) : -1;
      if (ga !== gb) return ga - gb;
      return sign * (va < vb ? -1 : va > vb ? 1 : 0);
    })
    .map((x) => x.r);
}

const uniq = (xs: (string | null)[]): string[] =>
  [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

export function facetValues(rows: IndexRow[]): { subject: string[]; rig: string[]; experimenter: string[] } {
  return { subject: uniq(rows.map((r) => r.s)), rig: uniq(rows.map((r) => r.r)), experimenter: uniq(rows.flatMap((r) => r.e)) };
}

/** Rows whose id, raw session or animal contains `q` (case-insensitive), at most `limit`. */
export function searchRows(rows: IndexRow[], q: string, limit = 12): IndexRow[] {
  const needle = q.trim().toLowerCase();
  const out: IndexRow[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    if (!needle || `${r.id} ${r.raw ?? ""} ${r.s ?? ""}`.toLowerCase().includes(needle)) out.push(r);
  }
  return out;
}
