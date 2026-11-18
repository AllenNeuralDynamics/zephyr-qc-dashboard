// Trained networks and their QC references, keyed by checkpoint SHA-256.
// Zephyr writes `checkpoint_sha256` in the first few hundred bytes of qc-reference.json, so a
// 1 KB range request per network is enough to build the whole map.
import { bucketUrl, fetchRange, listPrefix, mapLimit, type Fetch } from "./s3";

export const NETWORKS_BUCKET = "aind-scratch-data";
export const NETWORKS_PREFIX = "vr-foraging/zephyr-manuscript-runs/";
const REFERENCE = "qc-reference.json";

export interface Network {
  sha: string;
  prefix: string;
  /** Short name: the prefix under NETWORKS_PREFIX, e.g. `all-cameras/cv_0/seed-17`. */
  label: string;
  referenceUrl: string;
}

const SHA = /"checkpoint_sha256"\s*:\s*"([0-9a-f]{64})"/;

export async function buildNetworkMap(f: Fetch = fetch): Promise<Record<string, Network>> {
  const { keys } = await listPrefix(NETWORKS_BUCKET, NETWORKS_PREFIX, {}, f);
  const refs = keys.map((k) => k.key).filter((k) => k.endsWith(`/${REFERENCE}`));
  const found = await mapLimit(refs, 8, async (key): Promise<Network | null> => {
    const referenceUrl = `${bucketUrl(NETWORKS_BUCKET)}/${key}`;
    const m = SHA.exec(await fetchRange(referenceUrl, 0, 1023, f));
    if (!m) return null;
    const prefix = key.slice(0, -REFERENCE.length);
    return { sha: m[1], prefix, label: prefix.slice(NETWORKS_PREFIX.length).replace(/\/$/, ""), referenceUrl };
  });
  return Object.fromEntries(found.filter((n): n is Network => n !== null).map((n) => [n.sha, n]));
}
