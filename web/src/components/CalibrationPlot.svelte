<script lang="ts">
  // The network's onset-head calibration (from its qc-reference.json): predicted vs observed
  // precision of asserted inhales on validation clips, dot area by number of inhales.
  import * as Plot from "@observablehq/plot";
  import { app } from "../lib/app.svelte";
  import { formatCount, formatValue } from "../lib/format";
  import type { Calibration } from "../lib/qc";

  let { cal, version }: { cal: Calibration; version: string } = $props();
  let host = $state<HTMLDivElement | null>(null);

  function color(name: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    return m ? color(m[1]) : v;
  }

  $effect(() => {
    void [cal, app.theme];
    if (!host) return;
    const chart = Plot.plot({
      width: 260,
      height: 220,
      marginLeft: 40,
      marginBottom: 34,
      style: { fontFamily: "IBM Plex Sans", fontSize: "11px", background: "transparent", color: color("--text-2") },
      x: { domain: [0, 1], label: "predicted precision", grid: true },
      y: { domain: [0, 1], label: "observed", grid: true },
      r: { range: [3, 10] },
      marks: [
        Plot.line([[0, 0], [1, 1]], { stroke: color("--text-3"), strokeDasharray: "3,3" }),
        Plot.dot(cal.reliability, {
          x: "predicted",
          y: "observed",
          r: "n",
          fill: color("--series-good"),
          stroke: color("--surface"),
          strokeWidth: 2,
          tip: true,
          title: (d: { predicted: number; observed: number; n: number }) =>
            `predicted ${formatValue(d.predicted)}\nobserved ${formatValue(d.observed)}\n${d.n} inhales`,
        }),
      ],
    });
    host.replaceChildren(chart);
    return () => chart.remove();
  });
</script>

<article class="card cal">
  <h3>Onset calibration of this network</h3>
  <div class="row body">
    <div bind:this={host}></div>
    <dl>
      <div><dt>precision on validation</dt><dd class="mono">{formatValue(cal.precision)}</dd></div>
      <div><dt>calibration error (ECE)</dt><dd class="mono">{formatValue(cal.ece_raw)} → {formatValue(cal.ece)}</dd></div>
      <div><dt>inhales used</dt><dd class="mono">{formatCount(cal.events)}</dd></div>
      <div><dt>Zephyr version</dt><dd class="mono small">{version || "—"}</dd></div>
    </dl>
  </div>
</article>

<style>
  .cal {
    padding: 10px 12px;
  }
  h3 {
    color: var(--text);
  }
  .body {
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }
  dl {
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  dt {
    font-size: 11px;
    color: var(--text-3);
  }
  dd {
    margin: 0;
  }
  .small {
    font-size: 11px;
  }
</style>
