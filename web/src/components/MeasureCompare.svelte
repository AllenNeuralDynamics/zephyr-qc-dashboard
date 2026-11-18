<script lang="ts">
  // One small multiple per measure: the session's 30-s windows against the network's validation
  // windows, split by a true score into "predicted well" and "predicted poorly". Box = middle
  // half, whiskers = 5–95 %, tick = median (as in Zephyr's Quality tab). Rule = session median.
  import * as Plot from "@observablehq/plot";
  import { app } from "../lib/app.svelte";
  import { formatPct, formatValue } from "../lib/format";
  import type { Measure } from "../lib/measures";
  import type { QcWindow, RefWindow, Values } from "../lib/qc";
  import { median, spread, type Spread } from "../lib/stats";

  let {
    measure,
    windows,
    pcts,
    good,
    poor,
    hasReference,
  }: { measure: Measure; windows: QcWindow[]; pcts: Values[]; good: RefWindow[]; poor: RefWindow[]; hasReference: boolean } =
    $props();

  let host = $state<HTMLDivElement | null>(null);
  let width = $state(320);

  const sessionMedian = $derived(median(windows.map((w) => w[measure.name])));
  const medianPct = $derived(median(pcts.map((p) => p[measure.name])));
  const rows = $derived.by(() => {
    const out: { group: string; key: "good" | "poor" | "session"; s: Spread }[] = [];
    const add = (group: string, key: "good" | "poor" | "session", xs: (number | null | undefined)[]) => {
      const s = spread(xs);
      if (s) out.push({ group, key, s });
    };
    if (hasReference) {
      add("Reference: well", "good", good.map((w) => w[measure.name]));
      add("Reference: poorly", "poor", poor.map((w) => w[measure.name]));
    }
    add("This session", "session", windows.map((w) => w[measure.name]));
    return out;
  });

  function color(name: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    return m ? color(m[1]) : v;
  }

  $effect(() => {
    void [rows, width, app.theme, sessionMedian];
    if (!host) return;
    const fill: Record<string, string> = {
      good: color("--series-good"),
      poor: color("--series-poor"),
      session: color("--series-session"),
    };
    const data = rows.map((r) => ({ ...r.s, group: r.group, key: r.key }));
    const order = rows.map((r) => r.group);
    const chart = Plot.plot({
      width,
      height: 28 + 26 * Math.max(1, rows.length),
      marginLeft: 112,
      marginRight: 12,
      marginTop: 6,
      style: { fontFamily: "IBM Plex Sans", fontSize: "11px", background: "transparent", color: color("--text-2") },
      x: { grid: true, nice: true, tickFormat: (v: number) => formatValue(v, 2), label: null },
      y: { domain: order, label: null, tickSize: 0 },
      marks: [
        Plot.ruleY(data, { y: "group", x1: "p05", x2: "p95", stroke: (d) => fill[d.key], strokeWidth: 1.5 }),
        Plot.barX(data, {
          y: "group",
          x1: "p25",
          x2: "p75",
          fill: (d) => fill[d.key],
          fillOpacity: 0.35,
          stroke: (d) => fill[d.key],
          rx: 3,
          insetTop: 5,
          insetBottom: 5,
        }),
        Plot.tickX(data, { y: "group", x: "p50", stroke: (d) => fill[d.key], strokeWidth: 2.5, insetTop: 3, insetBottom: 3 }),
        sessionMedian === null ? null : Plot.ruleX([sessionMedian], { stroke: color("--text"), strokeDasharray: "3,3", strokeWidth: 1 }),
        Plot.tip(
          data,
          Plot.pointerY({
            y: "group",
            x: "p50",
            title: (d) =>
              `${d.group} (${d.n} windows)\n5 %: ${formatValue(d.p05)}  25 %: ${formatValue(d.p25)}\nmedian: ${formatValue(d.p50)}\n75 %: ${formatValue(d.p75)}  95 %: ${formatValue(d.p95)}`,
          }),
        ),
      ],
    });
    host.replaceChildren(chart);
    return () => chart.remove();
  });
</script>

<article class="card mc" bind:clientWidth={width}>
  <header>
    <h3 title={measure.help}>{measure.label}</h3>
    <span class="faint dir">{measure.better ? `${measure.better} is better` : "description"}</span>
  </header>
  <div class="nums">
    <span>median <b class="mono">{formatValue(sessionMedian)}</b></span>
    {#if hasReference}<span>percentile <b class="mono">{formatPct(medianPct)}</b></span>{/if}
  </div>
  <div class="plot" bind:this={host}></div>
</article>

<style>
  .mc {
    padding: 10px 12px 6px;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  h3 {
    color: var(--text);
    cursor: help;
  }
  .dir {
    font-size: 11px;
    margin-left: auto;
  }
  .nums {
    display: flex;
    gap: 14px;
    font-size: 12px;
    color: var(--text-2);
    margin: 2px 0 2px;
  }
  .plot :global(svg) {
    display: block;
    overflow: visible;
  }
</style>
