// Zephyr's QC report (<stem>.qc.json) and a network's reference (qc-reference.json):
// types, parsing, per-window percentiles, session medians and the good/poor reference split.
import { MEASURE_NAMES, type MeasureName } from "./measures";
import { finite, median, percentile } from "./stats";

export type Values = Partial<Record<MeasureName, number | null>>;

export interface QcWindow extends Values {
  start: number;
  end: number;
  percentiles?: Values;
}

export interface QcReport {
  checkpoint_sha256: string;
  head_threshold: number;
  duration_s: number;
  params: { window_s: number };
  summary: QcWindow;
  windows: QcWindow[];
}

export type TruthName = "truth_correlation" | "truth_inhale_f1" | "truth_exhale_f1" | "truth_kl_ibi";

export const TRUTHS: { name: TruthName; label: string; better: "higher" | "lower" }[] = [
  { name: "truth_inhale_f1", label: "True inhale F1", better: "higher" },
  { name: "truth_exhale_f1", label: "True exhale F1", better: "higher" },
  { name: "truth_correlation", label: "True correlation", better: "higher" },
  { name: "truth_kl_ibi", label: "True KL of inter-breath intervals", better: "lower" },
];

export interface RefWindow extends Values {
  clip_id: string;
  start: number;
  end: number;
  truth_correlation?: number | null;
  truth_inhale_f1?: number | null;
  truth_exhale_f1?: number | null;
  truth_kl_ibi?: number | null;
}

export interface Calibration {
  slope: number;
  intercept: number;
  events: number;
  precision: number;
  ece_raw: number;
  ece: number;
  reliability: { predicted: number; observed: number; n: number }[];
}

export interface Reference {
  checkpoint_sha256: string;
  head_threshold: number;
  zephyr_version: string;
  onset_calibration: Calibration | null;
  windows: RefWindow[];
  /** Finite values of each measure over the validation windows, prebuilt for percentiles. */
  columns: Record<MeasureName, Float64Array>;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

export function parseQcReport(json: unknown): QcReport {
  if (!isObj(json) || !Array.isArray(json.windows)) throw new Error("not a Zephyr QC report");
  return json as unknown as QcReport;
}

export function parseReference(json: unknown): Reference {
  const validation = isObj(json) && isObj(json.validation) ? json.validation : null;
  if (!isObj(json) || !validation || !Array.isArray(validation.windows)) {
    throw new Error("not a Zephyr QC reference");
  }
  const windows = validation.windows as RefWindow[];
  const columns = Object.fromEntries(
    MEASURE_NAMES.map((m) => [m, finite(windows.map((w) => w[m]))]),
  ) as Record<MeasureName, Float64Array>;
  return {
    checkpoint_sha256: String(json.checkpoint_sha256 ?? ""),
    head_threshold: Number(json.head_threshold),
    zephyr_version: String(json.zephyr_version ?? ""),
    onset_calibration: (json.onset_calibration as Calibration | null | undefined) ?? null,
    windows,
    columns,
  };
}

/** A window's percentiles: as Zephyr wrote them, else computed from `ref`, else null. */
export function windowPercentiles(w: QcWindow, ref: Reference | null): Values {
  const out: Values = {};
  for (const m of MEASURE_NAMES) {
    const written = w.percentiles?.[m];
    if (written !== undefined && written !== null) out[m] = written;
    else out[m] = ref ? percentile(w[m], ref.columns[m]) : null;
  }
  return out;
}

export interface MeasureStat {
  median: number | null;
  medianPct: number | null;
}

/** Per measure: median over the session's windows of the value and of its percentile. */
export function windowStats(report: QcReport, ref: Reference | null): Record<MeasureName, MeasureStat> {
  const pcts = report.windows.map((w) => windowPercentiles(w, ref));
  return Object.fromEntries(
    MEASURE_NAMES.map((m) => [
      m,
      { median: median(report.windows.map((w) => w[m])), medianPct: median(pcts.map((p) => p[m])) },
    ]),
  ) as Record<MeasureName, MeasureStat>;
}

/** Validation windows predicted well (`good`) or not (`poor`) by a true score; unknown truth in neither. */
export function splitReference(
  ref: Reference,
  truth: TruthName,
  threshold: number,
): { good: RefWindow[]; poor: RefWindow[] } {
  const lowerIsBetter = TRUTHS.find((t) => t.name === truth)?.better === "lower";
  const good: RefWindow[] = [];
  const poor: RefWindow[] = [];
  for (const w of ref.windows) {
    const v = w[truth];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    (lowerIsBetter ? v <= threshold : v >= threshold) ? good.push(w) : poor.push(w);
  }
  return { good, poor };
}
