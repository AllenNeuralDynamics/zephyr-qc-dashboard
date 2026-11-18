// The published index.json: one compact row per predicted video (short keys keep 2000 rows small).
import type { AssetMeta } from "./docdb";
import type { MeasureName } from "./measures";

/** One predicted video inside an inference asset, as listed by a source. */
export interface SessionRef extends AssetMeta {
  /** `<asset>/<stem>`: unique, used in URLs. */
  id: string;
  /** https URL of the asset folder, ending with `/`. */
  base: string;
  /** File stem: `${base}${stem}.qc.json`, `.prediction.parquet`, `_network_input.png`. */
  stem: string;
  camera: string | null;
  /** Checkpoint SHA-256 from metadata; null when it must be read from the QC report. */
  sha: string | null;
  /** Metadata says the prediction failed. */
  failed: boolean;
}

export interface IndexRow {
  id: string;
  /** base URL of the asset folder */
  b: string;
  /** stem */
  st: string;
  /** raw data session id */
  raw: string | null;
  /** subject (animal) */
  s: string | null;
  /** rig */
  r: string | null;
  /** experimenters */
  e: string[];
  /** acquisition start, ISO UTC */
  t: string | null;
  /** camera used for inference */
  c: string | null;
  /** network checkpoint SHA-256 */
  n: string | null;
  /** duration (s) */
  d: number | null;
  /** number of 30-s windows */
  w: number;
  /** per measure: [median over windows, median percentile] */
  m: Partial<Record<MeasureName, [number | null, number | null]>>;
  /** `<stem>_network_input.png` exists */
  png: boolean;
  /** why this session could not be indexed */
  err?: string;
}

export interface Index {
  v: 1;
  generated: string;
  source: string;
  networks: Record<string, { label: string; ref: string }>;
  sessions: IndexRow[];
}

export const fileUrl = (row: Pick<IndexRow, "b" | "st">, suffix: ".qc.json" | ".prediction.parquet" | "_network_input.png"): string =>
  `${row.b}${row.st}${suffix}`;
