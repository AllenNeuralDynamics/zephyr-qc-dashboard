# Zephyr QC Dashboard

A static, read-only web dashboard for [Zephyr](https://github.com/AllenNeuralDynamics/zephyr)
breathing predictions produced by the
[`Zephyr_Inference`](https://github.com/AllenNeuralDynamics/Zephyr_Inference) capsule. It lists
inference sessions, shows each predicted breathing trace, and places every label-free QC measure
among the trained network's own validation windows (its `qc-reference.json`), where the true
breathing was known.

## Develop

```bash
cd web
npm ci
npm run index -- --source application --out public/index.json   # build a local index (public data)
npm run dev                                                      # http://localhost:5173
npm test && npm run check
```

On Windows, run `npm test` from a path whose drive letter is upper case (`C:\...`); a lower-case
`c:` makes vitest load itself twice ("Cannot read properties of undefined (reading 'config')").

## How it works

- **`web/scripts/index.ts`** (`npm run index`) lists inference sessions, resolves each one's
  network by checkpoint SHA-256, and writes `index.json`: one compact row per predicted video,
  with every QC measure's median over its 30-s windows and median percentile among the network's
  validation windows.
  - `--source metadata`: AIND metadata service (DocDB v2), assets with a
    `"Zephyr breathing prediction"` process; all displayed metadata (animal, rig, experimenter,
    date, raw session id, camera, network) comes from that projection.
  - `--source application`: the manuscript's `zephyr-manuscript-runs/application/` sessions
    (real capsule outputs), with metadata from their raw sessions' DocDB records. Used until
    capsule results are published.
  - `--prev <url|path>` reuses rows already indexed; `--full` re-reads everything.
- **Networks and references**: `s3://aind-scratch-data/vr-foraging/zephyr-manuscript-runs/`; the
  map is built from the first kilobyte of each `qc-reference.json`.
- **The web app** loads `index.json` for the table, and fetches each session's
  `.prediction.parquet`, `.qc.json` and its network's reference straight from public S3 when opened.
  All QC values come from Zephyr; the app only computes medians and percentiles
  (Zephyr's definition, checked against Zephyr's own output in the tests).

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`, daily at 09:00 UTC, and on demand
(**Actions → Index and deploy → Run workflow**, tick *full* to re-index every session). It type
checks, tests, builds the index incrementally from the published one, builds the app and
publishes it to GitHub Pages. In the repository settings, set **Pages → Source** to
**GitHub Actions**. `.github/workflows/ci.yml` runs the checks on pull requests.
