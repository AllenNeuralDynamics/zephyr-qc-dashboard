// The session's behavior-processed asset (vr-foraging NWB packaging) and its sniff sensor.
// Looked up lazily when a session opens: one DocDB query gives the latest processed asset, whose
// sniffing.parquet is there when the animal was implanted with a thermistor.
import { queryDocDb, type DocDbRecord } from "./docdb";
import { httpsUrl, type Fetch } from "./s3";

export const PACKAGING_PROCESS = "primary-nwb-packaging-vr-foraging";
const STAMP = /_processed(?:-behavior)?_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})$/;

/** The processing timestamp in an asset name (`…_processed[-behavior]_YYYY-MM-DD_hh-mm-ss`). */
export function processedStamp(name: string): string | null {
  return STAMP.exec(name)?.[1] ?? null;
}

export interface AssetRef {
  name: string;
  location: string;
}

/** The most recently processed asset (the timestamp sorts lexically). */
export function latestProcessed(recs: AssetRef[]): AssetRef | null {
  let best: AssetRef | null = null;
  let bestStamp = "";
  for (const r of recs) {
    const s = processedStamp(r.name);
    if (s && s > bestStamp) [best, bestStamp] = [r, s];
  }
  return best;
}


/** The session's latest vr-foraging packaging output (null if it has none in DocDB). */
export async function processedAsset(raw: string, f: Fetch = fetch): Promise<AssetRef | null> {
  const recs: DocDbRecord[] = await queryDocDb(
    { "data_description.source_data": raw, "processing.data_processes.name": PACKAGING_PROCESS },
    f,
    50,
    { _id: 0, name: 1, location: 1 },
  );
  return latestProcessed(recs.map((r) => ({ name: String(r.name ?? ""), location: String(r.location ?? "") })));
}

export const sniffUrl = (processedLocation: string): string =>
  `${httpsUrl(processedLocation).replace(/\/$/, "")}/sniffing.parquet`;

export type Sniff =
  | { state: "no-asset" }
  | { state: "no-sensor"; asset: string }
  | { state: "failed"; asset: string; error: string }
  | { state: "ready"; asset: string; url: string; values: Float32Array };

export interface SniffDeps {
  fetch?: Fetch;
  /** read sniffing.parquet → its timestamps and voltages (a worker in the browser) */
  readSniff: (url: string) => Promise<{ time: Float64Array; value: Float64Array }>;
}

/**
 * The sniff sensor on the prediction's samples. The prediction's time is video time and the
 * sensor's is the Harp clock, and the two files share no clock: both are aligned at their first
 * sample (an approximation the view warns about), then the 250 Hz sensor is interpolated at the
 * prediction's 60 Hz times so it shares the trace's axis and zoom.
 */
export async function loadSniff(raw: string, pred: { time: Float64Array }, deps: SniffDeps): Promise<Sniff> {
  const f = deps.fetch ?? fetch;
  const processed = await processedAsset(raw, f);
  if (!processed) return { state: "no-asset" };
  const asset = processed.name;
  const url = sniffUrl(processed.location);
  const head = await f(url, { method: "HEAD" }).catch(() => null);
  if (!head?.ok) return { state: "no-sensor", asset };
  try {
    const sensor = await deps.readSniff(url);
    const s0 = sensor.time[0] ?? 0;
    const p0 = pred.time[0] ?? 0;
    const sensorT = Float64Array.from(sensor.time, (t) => t - s0);
    const predT = Float64Array.from(pred.time, (t) => t - p0);
    return { state: "ready", asset, url, values: resample(sensorT, sensor.value, predT) };
  } catch (e) {
    return { state: "failed", asset, error: (e as Error).message };
  }
}

/** Linear interpolation of (srcT, srcV) at dstT (both times ascending); NaN outside srcT. */
export function resample(srcT: ArrayLike<number>, srcV: ArrayLike<number>, dstT: ArrayLike<number>): Float32Array {
  const out = new Float32Array(dstT.length);
  const n = srcT.length;
  let j = 0;
  for (let i = 0; i < dstT.length; i++) {
    const t = dstT[i];
    if (!(n > 0) || t < srcT[0] || t > srcT[n - 1] || Number.isNaN(t)) {
      out[i] = NaN;
      continue;
    }
    while (j < n - 2 && srcT[j + 1] < t) j++;
    const a = srcT[j];
    const b = srcT[j + 1] ?? a;
    const w = b > a ? (t - a) / (b - a) : 0;
    out[i] = srcV[j] + w * ((srcV[j + 1] ?? srcV[j]) - srcV[j]);
  }
  return out;
}
