// Anonymous access to AIND's public S3 buckets (all us-west-2, CORS-open for GET/HEAD/Range).
// Works in the browser and in Node (no DOMParser: the listing XML is parsed with regexes).

export type Fetch = typeof fetch;

const REGION = "us-west-2";

export const bucketUrl = (bucket: string): string => `https://${bucket}.s3.${REGION}.amazonaws.com`;

/** `s3://bucket/key` → public https URL; https URLs pass through. */
export function httpsUrl(uri: string): string {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(uri);
  return m ? `${bucketUrl(m[1])}/${m[2]}` : uri;
}

/** Public https URL of an object or folder → bucket and key prefix (for listing); null otherwise. */
export function s3Location(url: string): { bucket: string; prefix: string } | null {
  const m = /^https:\/\/([^.]+)\.s3\.[\w-]+\.amazonaws\.com\/(.*)$/.exec(url);
  return m ? { bucket: m[1], prefix: decodeURIComponent(m[2]) } : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : (ENTITIES[e] ?? all),
  );
const tag = (xml: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? unxml(m[1]) : null;
};
const blocks = (xml: string, name: string): string[] =>
  Array.from(xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g")), (m) => m[1]);

export interface Listing {
  keys: { key: string; etag: string; size: number }[];
  prefixes: string[];
}

/** Every key (and, with a delimiter, every common prefix) under `prefix`, following pagination. */
export async function listPrefix(
  bucket: string,
  prefix: string,
  opts: { delimiter?: string } = {},
  f: Fetch = fetch,
): Promise<Listing> {
  const out: Listing = { keys: [], prefixes: [] };
  let token: string | null = null;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix });
    if (opts.delimiter) q.set("delimiter", opts.delimiter);
    if (token) q.set("continuation-token", token);
    const r = await f(`${bucketUrl(bucket)}/?${q}`);
    if (!r.ok) throw new Error(`${r.status} listing s3://${bucket}/${prefix}`);
    const xml = await r.text();
    for (const c of blocks(xml, "Contents")) {
      out.keys.push({
        key: tag(c, "Key") ?? "",
        etag: (tag(c, "ETag") ?? "").replace(/"/g, ""),
        size: Number(tag(c, "Size") ?? 0),
      });
    }
    for (const p of blocks(xml, "CommonPrefixes")) out.prefixes.push(tag(p, "Prefix") ?? "");
    token = tag(xml, "IsTruncated") === "true" ? tag(xml, "NextContinuationToken") : null;
  } while (token);
  return out;
}

/** Bytes `start`–`end` (inclusive) of a public object, as text. */
export async function fetchRange(url: string, start: number, end: number, f: Fetch = fetch): Promise<string> {
  const r = await f(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

export async function fetchJson<T>(url: string, f: Fetch = fetch): Promise<T> {
  const r = await f(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

/** Whether a public object exists (HEAD). */
export async function exists(url: string, f: Fetch = fetch): Promise<boolean> {
  try {
    return (await f(url, { method: "HEAD" })).ok;
  } catch {
    return false;
  }
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
