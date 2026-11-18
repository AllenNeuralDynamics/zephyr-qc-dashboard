// Where sessions come from: the metadata service (published capsule results) or, until those
// exist, the manuscript's application/ folder (real capsule-format outputs) with metadata from
// the raw sessions' DocDB records.
import { assetMeta, PROCESS_NAME, queryDocDb, zephyrProcesses, type AssetMeta } from "./docdb";
import type { SessionRef } from "./index-types";
import { NETWORKS_BUCKET, NETWORKS_PREFIX } from "./networks";
import { bucketUrl, httpsUrl, listPrefix, type Fetch } from "./s3";

export interface Source {
  name: "metadata" | "application";
  list(f?: Fetch): Promise<SessionRef[]>;
}

const QC = ".qc.json";
const STEM_FILES = /([^/]+?)(\.qc\.json|\.prediction\.parquet|\.clip\.toml)$/;

/** Stems of Zephyr output files in an asset folder (used when metadata does not name them). */
async function stemsInAsset(location: string, f: Fetch): Promise<string[]> {
  const m = /^s3:\/\/([^/]+)\/(.+?)\/?$/.exec(location);
  if (!m) return [];
  let keys: { key: string }[];
  try {
    ({ keys } = await listPrefix(m[1], `${m[2]}/`, {}, f));
  } catch {
    return []; // unlistable asset (private, moved): its unnamed videos become unknown-<i> rows
  }
  const stems = keys.map((k) => STEM_FILES.exec(k.key)?.[1]).filter((s): s is string => !!s);
  return [...new Set(stems)];
}

export const metadataSource: Source = {
  name: "metadata",
  async list(f: Fetch = fetch) {
    const docs = await queryDocDb({ "processing.data_processes.name": PROCESS_NAME }, f);
    const out: SessionRef[] = [];
    for (const doc of docs) {
      const meta = assetMeta(doc);
      const procs = zephyrProcesses(doc);
      const named = procs.map((p) => (p.qcJson?.endsWith(QC) ? p.qcJson.slice(0, -QC.length) : null));
      let spare: string[] = [];
      if (named.some((s) => s === null)) {
        spare = (await stemsInAsset(meta.location, f)).filter((s) => !named.includes(s));
      }
      procs.forEach((p, i) => {
        const stem = named[i] ?? spare.shift() ?? `unknown-${i}`;
        out.push({
          ...meta,
          id: `${meta.asset}/${stem}`,
          base: `${httpsUrl(meta.location).replace(/\/$/, "")}/`,
          stem,
          camera: p.camera,
          sha: p.sha,
          failed: p.failed,
        });
      });
    }
    return out;
  },
};

const APPLICATION = `${NETWORKS_PREFIX}application/`;

export const applicationSource: Source = {
  name: "application",
  async list(f: Fetch = fetch) {
    const { prefixes } = await listPrefix(NETWORKS_BUCKET, APPLICATION, { delimiter: "/" }, f);
    const folders = prefixes.map((p) => p.slice(APPLICATION.length).replace(/\/$/, "")).filter(Boolean);
    const split = folders.map((name) => {
      const cut = name.lastIndexOf("_");
      return { name, raw: name.slice(0, cut), camera: name.slice(cut + 1) };
    });
    const raws = [...new Set(split.map((s) => s.raw))];
    const docs = raws.length ? await queryDocDb({ name: { $in: raws } }, f) : [];
    const byName = new Map(docs.map((d) => [String(d.name), assetMeta(d)]));
    return split.map(({ name, raw, camera }): SessionRef => {
      const meta: AssetMeta = byName.get(raw) ?? {
        asset: raw, location: "", subject: null, rig: null, experimenters: [], date: null, rawSession: raw,
      };
      return {
        ...meta,
        asset: name,
        location: `s3://${NETWORKS_BUCKET}/${APPLICATION}${name}`,
        rawSession: raw,
        id: `${name}/video`,
        base: `${bucketUrl(NETWORKS_BUCKET)}/${APPLICATION}${name}/`,
        stem: "video",
        camera,
        sha: null,
        failed: false,
      };
    });
  },
};
