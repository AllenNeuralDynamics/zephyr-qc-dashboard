// Build index.json from listed sessions: incremental (reuses rows already indexed), one
// reference load per network, a row with `err` for anything that cannot be read.
import { fileUrl, type Index, type IndexRow, type SessionRef } from "./index-types";
import { MEASURE_NAMES } from "./measures";
import type { Network } from "./networks";
import { windowStats, type QcReport, type Reference } from "./qc";
import { mapLimit } from "./s3";

export interface IndexDeps {
  networks: Record<string, Network>;
  loadQc(url: string): Promise<QcReport>;
  loadRef(url: string): Promise<Reference>;
  exists(url: string): Promise<boolean>;
}

const baseRow = (s: SessionRef): IndexRow => ({
  id: s.id,
  b: s.base,
  st: s.stem,
  raw: s.rawSession,
  s: s.subject,
  r: s.rig,
  e: s.experimenters,
  t: s.date,
  c: s.camera,
  n: s.sha,
  d: null,
  w: 0,
  m: {},
  png: false,
});

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function buildIndex(
  refs: SessionRef[],
  prev: Index | null,
  deps: IndexDeps,
  opts: { full: boolean; source: string },
): Promise<Index> {
  const old = new Map((prev?.sessions ?? []).map((r) => [r.id, r]));
  const references = new Map<string, Promise<Reference | null>>();
  const reference = (sha: string | null): Promise<Reference | null> => {
    const net = sha ? deps.networks[sha] : undefined;
    if (!net) return Promise.resolve(null);
    if (!references.has(net.referenceUrl)) {
      references.set(net.referenceUrl, deps.loadRef(net.referenceUrl).catch(() => null));
    }
    return references.get(net.referenceUrl)!;
  };

  const rows = await mapLimit(refs, 8, async (s): Promise<IndexRow> => {
    const before = old.get(s.id);
    if (before && !before.err && !opts.full) return before;
    const row = baseRow(s);
    try {
      const qc = await deps.loadQc(fileUrl(row, ".qc.json"));
      row.n = s.sha ?? qc.checkpoint_sha256 ?? null;
      const stats = windowStats(qc, await reference(row.n));
      row.d = Number.isFinite(qc.duration_s) ? qc.duration_s : null;
      row.w = qc.windows.length;
      row.m = Object.fromEntries(MEASURE_NAMES.map((m) => [m, [stats[m].median, stats[m].medianPct]]));
      row.png = await deps.exists(fileUrl(row, "_network_input.png"));
    } catch (e) {
      row.err = (s.failed ? "prediction failed; " : "") + message(e);
    }
    return row;
  });

  const used = new Set(rows.map((r) => r.n).filter((n): n is string => !!n));
  const networks = Object.fromEntries(
    Object.values(deps.networks)
      .filter((n) => used.has(n.sha))
      .map((n) => [n.sha, { label: n.label, ref: n.referenceUrl }]),
  );
  rows.sort((a, b) => (b.t ?? "").localeCompare(a.t ?? ""));
  return { v: 1, generated: new Date().toISOString(), source: opts.source, networks, sessions: rows };
}
