// The session's behavior-processed asset (vr-foraging NWB packaging) and its sniff sensor.
// Looked up lazily when a session opens: one DocDB query gives the raw asset (for the camera's
// frame clock) and the latest processed asset (for sniffing.parquet, present when the animal
// was implanted with a thermistor).
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

export interface BehaviorAssets {
  /** raw asset location (s3://…), for behavior-videos/<camera>/metadata.csv */
  raw: string | null;
  processed: AssetRef | null;
}

/** The raw asset and its latest vr-foraging packaging output, in one DocDB query. */
export async function behaviorAssets(raw: string, f: Fetch = fetch): Promise<BehaviorAssets> {
  const recs: DocDbRecord[] = await queryDocDb(
    {
      $or: [
        { name: raw },
        { "data_description.source_data": raw, "processing.data_processes.name": PACKAGING_PROCESS },
      ],
    },
    f,
    50,
    { _id: 0, name: 1, location: 1 },
  );
  const refs = recs.map((r) => ({ name: String(r.name ?? ""), location: String(r.location ?? "") }));
  return {
    raw: refs.find((r) => r.name === raw)?.location ?? null,
    processed: latestProcessed(refs.filter((r) => r.name !== raw)),
  };
}

const assetFile = (location: string, file: string): string => `${httpsUrl(location).replace(/\/$/, "")}/${file}`;

export const sniffUrl = (processedLocation: string): string => assetFile(processedLocation, "sniffing.parquet");
export const clockUrl = (rawLocation: string, camera: string): string =>
  assetFile(rawLocation, `behavior-videos/${camera}/metadata.csv`);

export interface ClockEdges {
  t0: number;
  f0: number;
  t1: number;
  f1: number;
}

const row = (line: string): [number, number] => {
  const [t, n] = line.split(",");
  return [Number(t), Number(n)];
};

/** First and last (ReferenceTime, CameraFrameNumber) from a head and a tail byte range. */
export function parseClockEdges(head: string, tail: string): ClockEdges {
  const first = head.split("\n")[1];
  const last = tail.split("\n").filter((l) => l.trim()).pop() ?? "";
  const [t0, f0] = row(first);
  const [t1, f1] = row(last);
  return { t0, f0, t1, f1 };
}

export type FrameClock = (frame: number) => number;

/**
 * A linear frame → Harp-time clock from the first and last rows (within 1 ms of the full file on
 * sessions without dropped frames). Null when the prediction's last frame does not end just before
 * the clock's (on real sessions the prediction stops 8 frames short of metadata.csv); then frames
 * were dropped or the files do not belong together, and the full metadata.csv is needed. A gap of
 * up to ~4 frames (17 ms) can hide inside the slack.
 */
export function clockFromEdges(e: ClockEdges, lastFrame: number, slack = 12): FrameClock | null {
  const span = e.f1 - e.f0;
  const spare = span - lastFrame;
  if (!(span > 0) || spare < 0 || spare > slack) return null;
  const dt = (e.t1 - e.t0) / span;
  return (frame) => e.t0 + frame * dt;
}

/** ReferenceTime of every row of a camera metadata.csv (row i = video frame i). */
export function parseClockCsv(text: string): Float64Array {
  const lines = text.split("\n");
  const out = new Float64Array(lines.length);
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const c = l.indexOf(",");
    out[n++] = Number(c < 0 ? l : l.slice(0, c));
  }
  return out.slice(0, n);
}

export type Sniff =
  | { state: "no-raw" }
  | { state: "no-asset" }
  | { state: "no-sensor"; asset: string }
  | { state: "failed"; asset: string; error: string }
  | { state: "ready"; asset: string; url: string; clock: "linear" | "full"; values: Float32Array };

export interface SniffDeps {
  fetch?: Fetch;
  /** read sniffing.parquet → Harp timestamps and voltages (a worker in the browser) */
  readSniff: (url: string) => Promise<{ time: Float64Array; value: Float64Array }>;
}

async function frameTimes(clockCsv: string, frames: Float64Array, f: Fetch): Promise<{ t: Float64Array; clock: "linear" | "full" }> {
  const range = async (spec: string) => {
    const r = await f(clockCsv, { headers: { Range: `bytes=${spec}` } });
    if (!r.ok) throw new Error(`${r.status} ${clockCsv}`);
    return r.text();
  };
  const [head, tail] = await Promise.all([range("0-1023"), range("-1024")]);
  const lastFrame = frames.length ? frames[frames.length - 1] : 0;
  const linear = clockFromEdges(parseClockEdges(head, tail), lastFrame);
  if (linear) return { t: Float64Array.from(frames, linear), clock: "linear" };
  const r = await f(clockCsv);
  if (!r.ok) throw new Error(`${r.status} ${clockCsv}`);
  const rows = parseClockCsv(await r.text());
  if (lastFrame >= rows.length) throw new Error(`the camera clock has ${rows.length} frames, the prediction reads frame ${lastFrame}`);
  return { t: Float64Array.from(frames, (i) => rows[i]), clock: "full" };
}

/**
 * The sniff sensor on the prediction's samples: find the latest processed asset, check it has
 * sniffing.parquet, put every predicted frame on the Harp clock and interpolate the sensor there
 * (250 Hz → the prediction's 60 Hz, so it shares the trace's time axis and zoom).
 */
export async function loadSniff(raw: string, camera: string, pred: { frame: Float64Array }, deps: SniffDeps): Promise<Sniff> {
  const f = deps.fetch ?? fetch;
  const assets = await behaviorAssets(raw, f);
  if (!assets.processed) return { state: "no-asset" };
  const asset = assets.processed.name;
  const url = sniffUrl(assets.processed.location);
  const head = await f(url, { method: "HEAD" }).catch(() => null);
  if (!head?.ok) return { state: "no-sensor", asset };
  if (!assets.raw) return { state: "failed", asset, error: "raw asset not found in DocDB (needed for the camera clock)" };
  try {
    const [{ t, clock }, sensor] = await Promise.all([frameTimes(clockUrl(assets.raw, camera), pred.frame, f), deps.readSniff(url)]);
    return { state: "ready", asset, url, clock, values: resample(sensor.time, sensor.value, t) };
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
