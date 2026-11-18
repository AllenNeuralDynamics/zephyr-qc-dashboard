<script lang="ts">
  // Three uPlot charts on one time axis: breathing trace (+ inhale ticks), inhale probability
  // (+ threshold), and the selected QC measure per 30-s window. Drag on any chart zooms all;
  // double-click resets; clicking a strip window zooms to it. Long traces are min/max
  // decimated to the visible range at the chart's pixel width.
  import uPlot from "uplot";
  import "uplot/dist/uPlot.min.css";
  import { onMount, untrack } from "svelte";
  import { app } from "../lib/app.svelte";
  import { decimate, visibleRange } from "../lib/decimate";
  import { formatDuration, formatPct, formatValue } from "../lib/format";
  import { MEASURE_BY_NAME, type MeasureName } from "../lib/measures";
  import type { QcWindow, Values } from "../lib/qc";
  import type { Prediction } from "../lib/session";
  import { atypicality, shadeMix } from "../lib/shade";

  let {
    pred,
    windows,
    pcts,
    measure,
    threshold,
  }: { pred: Prediction; windows: QcWindow[]; pcts: Values[]; measure: MeasureName; threshold: number } = $props();

  let host = $state<HTMLDivElement | null>(null);
  let width = $state(800);
  let charts: uPlot[] = [];
  let range: [number, number] = [0, 1];
  let builtFor: Prediction | null = null;
  let hovered = $state<number | null>(null);

  const t0 = $derived(pred.time[0] ?? 0);
  const rel = $derived(Float64Array.from(pred.time, (t) => t - t0));
  const inhales = $derived(Float64Array.from(pred.inhaleTimes, (t) => t - t0));
  const wins = $derived(windows.map((w, i) => ({ start: w.start - t0, end: w.end - t0, value: w[measure] ?? null, pct: pcts[i]?.[measure] ?? null })));
  const full = $derived<[number, number]>([0, rel.length ? rel[rel.length - 1] : 1]);

  // resolve a CSS custom property to a concrete color (canvas cannot use `var(--x)` strings)
  function css(name: string): string {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    return m ? css(m[1]) : v;
  }

  function axis(label: string, extra: Partial<uPlot.Axis> = {}): uPlot.Axis {
    return {
      label,
      labelSize: 14,
      labelFont: "11px IBM Plex Sans",
      font: "11px IBM Plex Sans",
      stroke: css("--axis"),
      grid: { stroke: css("--grid"), width: 1 },
      ticks: { stroke: css("--grid"), width: 1, size: 4 },
      size: 44,
      ...extra,
    };
  }

  function data(series: ArrayLike<number>): uPlot.AlignedData {
    const [i0, i1] = visibleRange(rel, range[0], range[1]);
    const d = decimate(rel, series, i0, i1, Math.max(200, Math.round(width)));
    return [Array.from(d.x), Array.from(d.y)];
  }

  function setRange(next: [number, number]) {
    const span = Math.max(next[1] - next[0], 0.5);
    range = [next[0], next[0] + span];
    charts[0]?.setData(data(pred.signal), false);
    charts[1]?.setData(data(pred.onset), false);
    for (const u of charts) u.setScale("x", { min: range[0], max: range[1] });
  }

  function onSelect(u: uPlot) {
    if (u.select.width < 3) return;
    const a = u.posToVal(u.select.left, "x");
    const b = u.posToVal(u.select.left + u.select.width, "x");
    u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
    setRange([a, b]);
  }

  const timeAxis = (show: boolean) =>
    axis(show ? "time (m:ss from start)" : "", {
      values: (_u: uPlot, ticks: number[]) => ticks.map((t) => (show ? formatDuration(t) : "")),
      size: show ? 36 : 8,
    });

  function build() {
    if (!host) return;
    for (const u of charts) u.destroy();
    // keep the zoom across rebuilds (reference arriving, measure or theme change); reset for new data
    if (builtFor !== pred) range = [...full];
    builtFor = pred;
    const sync = uPlot.sync("zephyr-trace");
    const common = (
      h: number,
    ): { width: number; height: number; legend: uPlot.Legend; cursor: uPlot.Cursor; scales: uPlot.Scales; hooks: uPlot.Hooks.Arrays } => ({
      width,
      height: h,
      legend: { show: false },
      cursor: { sync: { key: sync.key }, drag: { x: true, y: false, setScale: false }, points: { show: false } },
      scales: { x: { time: false, auto: false, range: () => [range[0], range[1]] } },
      hooks: { setSelect: [onSelect] },
    });
    const trace = css("--trace");
    const onsetColor = css("--onset");
    const ink = css("--text-2");

    const sig = new uPlot(
      {
        ...common(180),
        axes: [timeAxis(false), axis("breathing (z)")],
        series: [{}, { stroke: trace, width: 1.25, points: { show: false } }],
        hooks: {
          ...common(0).hooks,
          draw: [
            (u) => {
              const ctx = u.ctx;
              const { top, height } = u.bbox;
              ctx.save();
              ctx.beginPath();
              ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
              ctx.clip();
              ctx.strokeStyle = ink;
              ctx.globalAlpha = 0.55;
              ctx.lineWidth = 1 * devicePixelRatio;
              ctx.beginPath();
              const [i0, i1] = visibleRange(inhales, range[0], range[1]);
              const step = Math.max(1, Math.ceil((i1 - i0) / (u.bbox.width / devicePixelRatio / 2)));
              for (let i = i0; i < i1; i += step) {
                const x = u.valToPos(inhales[i], "x", true);
                ctx.moveTo(x, top + height);
                ctx.lineTo(x, top + height - 6 * devicePixelRatio);
              }
              ctx.stroke();
              ctx.restore();
            },
          ],
        },
      },
      data(pred.signal),
      host,
    );

    const ons = new uPlot(
      {
        ...common(110),
        axes: [timeAxis(false), axis("inhale prob.", { values: (_u, t) => t.map((v) => v.toFixed(1)) })],
        scales: { ...common(0).scales, y: { auto: false, range: [0, 1] } },
        series: [{}, { stroke: onsetColor, width: 1, points: { show: false } }],
        hooks: {
          ...common(0).hooks,
          draw: [
            (u) => {
              const ctx = u.ctx;
              const y = u.valToPos(threshold, "y", true);
              ctx.save();
              ctx.beginPath();
              ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
              ctx.clip();
              ctx.setLineDash([4 * devicePixelRatio, 3 * devicePixelRatio]);
              ctx.strokeStyle = css("--text-3");
              ctx.lineWidth = devicePixelRatio;
              ctx.beginPath();
              ctx.moveTo(u.bbox.left, y);
              ctx.lineTo(u.bbox.left + u.bbox.width, y);
              ctx.stroke();
              ctx.restore();
            },
          ],
        },
      },
      data(pred.onset),
      host,
    );

    const atyp = css("--atyp");
    const surface = css("--surface-3");
    const better = MEASURE_BY_NAME[measure].better;
    const strip = new uPlot(
      {
        ...common(90),
        axes: [timeAxis(true), axis(MEASURE_BY_NAME[measure].short, { values: (_u, t) => t.map((v) => formatValue(v, 2)) })],
        series: [{}, { stroke: "transparent", points: { show: false } }],
        hooks: {
          ...common(0).hooks,
          draw: [
            (u) => {
              const ctx = u.ctx;
              const base = u.bbox.top + u.bbox.height;
              const gap = 2 * devicePixelRatio;
              ctx.save();
              ctx.beginPath();
              ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height);
              ctx.clip();
              wins.forEach((w, i) => {
                if (w.value === null || w.end < range[0] || w.start > range[1]) return;
                const x0 = u.valToPos(w.start, "x", true);
                const x1 = u.valToPos(w.end, "x", true);
                const y = u.valToPos(w.value, "y", true);
                const mix = shadeMix(atypicality(w.pct, better)) / 45;
                ctx.fillStyle = mix > 0 ? atyp : surface;
                ctx.globalAlpha = mix > 0 ? 0.35 + 0.65 * mix : 1;
                ctx.fillRect(x0 + gap / 2, Math.min(y, base), Math.max(1, x1 - x0 - gap), Math.abs(base - y));
                if (hovered === i) {
                  ctx.globalAlpha = 1;
                  ctx.strokeStyle = css("--text");
                  ctx.lineWidth = devicePixelRatio;
                  ctx.strokeRect(x0 + gap / 2, Math.min(y, base), Math.max(1, x1 - x0 - gap), Math.abs(base - y));
                }
              });
              ctx.restore();
            },
          ],
          setCursor: [
            (u) => {
              const left = u.cursor.left ?? -1;
              const t = left >= 0 ? u.posToVal(left, "x") : null;
              const i = t === null ? -1 : wins.findIndex((w) => t >= w.start && t < w.end);
              const next = i >= 0 ? i : null;
              if (next !== hovered) {
                hovered = next;
                u.redraw(false);
              }
            },
          ],
        },
        scales: {
          ...common(0).scales,
          // fit the windows' spread (bars grow from the bottom of the plot, not from 0)
          y: {
            auto: true,
            range: (_u, min, max) => {
              const pad = max > min ? (max - min) * 0.15 : Math.abs(max) * 0.05 || 0.5;
              return [min - pad, max + pad];
            },
          },
        },
      },
      [wins.map((w) => (w.start + w.end) / 2), wins.map((w) => w.value)] as uPlot.AlignedData,
      host,
    );
    strip.over.addEventListener("click", () => {
      if (hovered !== null && strip.select.width < 3) setRange([wins[hovered].start, wins[hovered].end]);
    });
    charts = [sig, ons, strip];
    for (const u of charts) u.over.addEventListener("dblclick", () => setRange([...full]));
    sync.sub(sig);
    sync.sub(ons);
    sync.sub(strip);
  }

  onMount(() => {
    if (host) width = Math.floor(host.clientWidth) || width;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e.contentRect.width);
      if (Math.abs(w - width) < 2) return;
      width = w;
      for (const u of charts) u.setSize({ width: w, height: u.height });
      setRange(range);
    });
    if (host) ro.observe(host);
    return () => {
      ro.disconnect();
      for (const u of charts) u.destroy();
    };
  });

  // rebuild when the data, the measure, the threshold or the theme change
  $effect(() => {
    void [pred, wins, threshold, app.theme];
    untrack(build);
  });

  const hoveredWin = $derived(hovered === null ? null : wins[hovered]);
</script>

<div class="stack">
  <div class="tools faint">
    <span>Drag to zoom · double-click to reset · click a window below to zoom to it</span>
    <span class="spacer"></span>
    {#if hoveredWin}
      <span class="mono hov">
        {formatDuration(hoveredWin.start)}–{formatDuration(hoveredWin.end)} · {MEASURE_BY_NAME[measure].short}
        {formatValue(hoveredWin.value)} · pct {formatPct(hoveredWin.pct)}
      </span>
    {/if}
    <button class="small" onclick={() => setRange([...full])}>Reset zoom</button>
  </div>
  <div class="host" bind:this={host}></div>
  <div class="legend faint">
    <span><i class="sw" style:background="var(--trace)"></i> breathing (z-scored, inhale up) · ticks = inhales</span>
    <span><i class="sw" style:background="var(--onset)"></i> inhale probability · dashed = threshold {threshold}</span>
    <span><i class="sw" style:background="var(--atyp)"></i> window tint = toward the worse side of the reference</span>
  </div>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    min-height: 24px;
  }
  .hov {
    color: var(--text);
  }
  .host {
    width: 100%;
  }
  .host :global(.u-select) {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 11px;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 3px;
    border-radius: 2px;
    vertical-align: middle;
  }
</style>
