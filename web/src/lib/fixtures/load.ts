// Test-only helpers: read the real-data fixtures (see scripts/make-fixtures.ts).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const DIR = dirname(fileURLToPath(import.meta.url));

export const qcFixture = (): unknown => JSON.parse(readFileSync(join(DIR, "video.qc.json"), "utf8"));

export const referenceFixture = (): unknown =>
  JSON.parse(gunzipSync(readFileSync(join(DIR, "reference.trimmed.json.gz"))).toString("utf8"));
