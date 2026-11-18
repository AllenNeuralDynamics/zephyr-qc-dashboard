// One-off: download real Zephyr outputs (public S3) and trim them into test fixtures.
//   npx tsx scripts/make-fixtures.ts
// The QC report's percentiles were computed by Zephyr against this exact reference, so the
// trimmed reference keeps every validation window and copies values exactly (parity test).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = "https://aind-scratch-data.s3.us-west-2.amazonaws.com/vr-foraging/zephyr-manuscript-runs";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "fixtures");
const KEEP = [
  "clip_id", "start", "end",
  "n_inhales", "rate_hz", "too_fast_frac", "alternation_break_frac", "flat_breath_frac",
  "head_trace_f1", "peak_prob", "ambiguous_peak_frac", "onset_background", "expected_precision",
  "truth_correlation", "truth_inhale_f1", "truth_exhale_f1", "truth_kl_ibi",
];

async function get(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

mkdirSync(OUT, { recursive: true });
const qc = await get(`${ROOT}/application/788731_2025-12-09_19-10-07_FaceCamera/video.qc.json`);
writeFileSync(join(OUT, "video.qc.json"), qc);

// Raw text kept for the sha-in-the-first-bytes check; trimmed JSON for the windows.
const refText = await get(`${ROOT}/all-cameras/cv_0/seed-17/qc-reference.json`);
const ref = JSON.parse(refText);
ref.validation.windows = ref.validation.windows.map((w: Record<string, unknown>) =>
  Object.fromEntries(KEEP.filter((k) => k in w).map((k) => [k, w[k]])),
);
const gz = gzipSync(JSON.stringify(ref), { level: 9 });
writeFileSync(join(OUT, "reference.trimmed.json.gz"), gz);
console.log(`video.qc.json ${qc.length} B, reference.trimmed.json.gz ${gz.length} B, ${ref.validation.windows.length} windows`);
