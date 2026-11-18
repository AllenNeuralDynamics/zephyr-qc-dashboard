// AIND metadata service (DocDB v2, public, CORS-open): the query for Zephyr inference assets and
// the projection every displayed session field comes from.
import type { Fetch } from "./s3";

export const DOCDB_URL = "https://api.allenneuraldynamics.org/v2/metadata_index/data_assets";
export const PROCESS_NAME = "Zephyr breathing prediction";

export const PROJECTION = {
  _id: 0,
  name: 1,
  location: 1,
  "subject.subject_id": 1,
  "acquisition.subject_id": 1,
  "acquisition.instrument_id": 1,
  "instrument.instrument_id": 1,
  "acquisition.experimenters": 1,
  "acquisition.acquisition_start_time": 1,
  "data_description.source_data": 1,
  "processing.data_processes": 1,
};

/* eslint-disable @typescript-eslint/no-explicit-any -- DocDB records are schemaless JSON */
export type DocDbRecord = Record<string, any>;

/** All records matching `filter`, paged by `_id`; halves the page when the gateway says 413. */
export async function queryDocDb(filter: object, f: Fetch = fetch, pageSize = 500): Promise<DocDbRecord[]> {
  const out: DocDbRecord[] = [];
  let size = pageSize;
  for (;;) {
    const q = new URLSearchParams({
      filter: JSON.stringify(filter),
      projection: JSON.stringify(PROJECTION),
      sort: JSON.stringify({ _id: 1 }),
      limit: String(size),
      skip: String(out.length),
    });
    const r = await f(`${DOCDB_URL}?${q}`);
    if (r.status === 413 && size > 25) {
      size = Math.max(25, Math.floor(size / 2));
      continue;
    }
    if (!r.ok) throw new Error(`${r.status} querying DocDB`);
    const page = (await r.json()) as DocDbRecord[];
    out.push(...page);
    if (page.length < size) return out;
  }
}

/** ISO `YYYY-MM-DDTHH:MM:SSZ` (UTC) from either DocDB timestamp format; null if unreadable. */
export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(String(s).trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1"));
  return Number.isNaN(t) ? null : new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface AssetMeta {
  asset: string;
  location: string;
  subject: string | null;
  rig: string | null;
  experimenters: string[];
  date: string | null;
  rawSession: string | null;
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

export function assetMeta(doc: DocDbRecord): AssetMeta {
  const acq = doc.acquisition ?? {};
  const source = doc.data_description?.source_data;
  return {
    asset: String(doc.name ?? ""),
    location: String(doc.location ?? ""),
    subject: str(doc.subject?.subject_id) ?? str(acq.subject_id),
    rig: str(acq.instrument_id) ?? str(doc.instrument?.instrument_id),
    experimenters: Array.isArray(acq.experimenters) ? acq.experimenters.map(String) : [],
    date: parseDate(acq.acquisition_start_time),
    rawSession: Array.isArray(source) && source.length ? String(source[0]) : null,
  };
}

export interface ZephyrProcess {
  camera: string | null;
  sha: string | null;
  qcJson: string | null;
  failed: boolean;
}

export function zephyrProcesses(doc: DocDbRecord): ZephyrProcess[] {
  const procs: DocDbRecord[] = doc.processing?.data_processes ?? [];
  return procs
    .filter((p) => p?.name === PROCESS_NAME)
    .map((p) => ({
      camera: str(p.code?.parameters?.camera),
      sha: str(p.code?.parameters?.checkpoint_sha256),
      qcJson: str(p.output_parameters?.qc_json),
      failed: String(p.notes ?? "").includes("PREDICTION FAILED"),
    }));
}
