// Loading one session's files in the browser: prediction parquet, QC report, and the network's
// reference (parsed in a worker, cached per URL so switching sessions of one network is instant).
import { parquetRead } from "hyparquet";
import { parseQcReport, parseReference, type QcReport, type Reference } from "./qc";
import { fetchJson } from "./s3";

export interface Prediction {
  time: Float64Array;
  /** video frame each sample was read from (row of the camera's metadata.csv) */
  frame: Float64Array;
  signal: Float32Array;
  onset: Float32Array;
  inhaleTimes: Float64Array;
}

export async function parsePrediction(buf: ArrayBuffer): Promise<Prediction> {
  const cols: Record<string, ArrayLike<unknown>> = {};
  await parquetRead({
    file: buf,
    columns: ["time", "frame", "signal", "onset", "inhale"],
    onComplete: () => {},
    onChunk: (c) => {
      // one row group per file in Zephyr's output; concatenate if there are more
      const prev = cols[c.columnName];
      cols[c.columnName] = prev ? [...Array.from(prev), ...Array.from(c.columnData as ArrayLike<unknown>)] : (c.columnData as ArrayLike<unknown>);
    },
  });
  const time = Float64Array.from(cols.time as ArrayLike<number>);
  const inhale = cols.inhale as ArrayLike<unknown>;
  const inhaleTimes: number[] = [];
  for (let i = 0; i < time.length; i++) if (inhale[i] === true || inhale[i] === 1) inhaleTimes.push(time[i]);
  return {
    time,
    frame: Float64Array.from(cols.frame as ArrayLike<number | bigint>, Number),
    signal: Float32Array.from(cols.signal as ArrayLike<number>),
    onset: Float32Array.from(cols.onset as ArrayLike<number>),
    inhaleTimes: Float64Array.from(inhaleTimes),
  };
}

export async function loadPrediction(url: string): Promise<Prediction> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return parsePrediction(await r.arrayBuffer());
}

export async function loadQc(url: string): Promise<QcReport> {
  return parseQcReport(await fetchJson(url));
}

const references = new Map<string, Promise<Reference>>();

function parseInWorker(url: string): Promise<Reference> {
  if (typeof Worker === "undefined") return fetchJson(url).then(parseReference);
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./reference.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ ok: true; ref: Reference } | { ok: false; error: string }>) => {
      w.terminate();
      if (e.data.ok) resolve(e.data.ref);
      else reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "reference worker failed"));
    };
    w.postMessage(url);
  });
}

/** sniffing.parquet → Harp timestamps and voltages, decoded in a worker. */
export function readSniff(url: string): Promise<{ time: Float64Array; value: Float64Array }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("./sniff.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ ok: true; time: Float64Array; value: Float64Array } | { ok: false; error: string }>) => {
      w.terminate();
      if (e.data.ok) resolve({ time: e.data.time, value: e.data.value });
      else reject(new Error(e.data.error));
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || "sniff worker failed"));
    };
    w.postMessage(url);
  });
}

/** The network's reference, fetched and parsed once per URL. */
export function loadReference(url: string): Promise<Reference> {
  let p = references.get(url);
  if (!p) {
    p = parseInWorker(url);
    p.catch(() => references.delete(url)); // allow a retry after a failure
    references.set(url, p);
  }
  return p;
}
