// Build index.json for the dashboard.
//   npm run index -- [--source metadata|application|both] [--out public/index.json]
//                    [--prev <url-or-path>] [--full]
// Row errors are recorded in the index and do not fail the run; a failed listing does.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { Index, SessionRef } from "../src/lib/index-types.ts";
import { buildIndex } from "../src/lib/indexer.ts";
import { buildNetworkMap } from "../src/lib/networks.ts";
import { parseQcReport, parseReference } from "../src/lib/qc.ts";
import { exists, fetchJson } from "../src/lib/s3.ts";
import { applicationSource, metadataSource, type Source } from "../src/lib/sources.ts";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: "both" },
    out: { type: "string", default: "public/index.json" },
    prev: { type: "string" },
    full: { type: "boolean", default: false },
  },
});

const SOURCES: Record<string, Source[]> = {
  metadata: [metadataSource],
  application: [applicationSource],
  both: [metadataSource, applicationSource],
};
const sources = SOURCES[values.source!];
if (!sources) throw new Error(`--source must be one of ${Object.keys(SOURCES).join(", ")}`);

async function loadPrev(where: string | undefined): Promise<Index | null> {
  if (!where) return null;
  try {
    const json = /^https?:/.test(where)
      ? await fetchJson<Index>(where)
      : existsSync(where)
        ? (JSON.parse(readFileSync(where, "utf8")) as Index)
        : null;
    return json && json.v === 1 ? json : null;
  } catch (e) {
    console.warn(`no previous index at ${where} (${(e as Error).message}); indexing everything`);
    return null;
  }
}

const listed = new Map<string, SessionRef>();
for (const s of sources) {
  const refs = await s.list();
  console.log(`${s.name}: listed ${refs.length}`);
  for (const r of refs) if (!listed.has(r.id)) listed.set(r.id, r);
}
const prev = await loadPrev(values.prev);
const networks = await buildNetworkMap();
console.log(`networks with a reference: ${Object.keys(networks).length}`);

const index = await buildIndex(
  [...listed.values()],
  prev,
  {
    networks,
    loadQc: async (url) => parseQcReport(await fetchJson(url)),
    loadRef: async (url) => parseReference(await fetchJson(url)),
    exists: (url) => exists(url),
  },
  { full: values.full!, source: values.source! },
);

const reused = prev ? index.sessions.filter((r) => prev.sessions.includes(r)).length : 0;
const errors = index.sessions.filter((r) => r.err);
mkdirSync(dirname(values.out!), { recursive: true });
writeFileSync(values.out!, JSON.stringify(index));
console.log(
  `listed ${listed.size}, reused ${reused}, new ${index.sessions.length - reused}, errors ${errors.length} → ${values.out}`,
);
for (const r of errors.slice(0, 20)) console.log(`  error ${r.id}: ${r.err}`);
