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
