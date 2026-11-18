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
  import { autoRateWindow, breathingRate } from "../lib/rate";
  import { extentTicks } from "../lib/ticks";

  let {
    pred,
    windows,
    pcts,
    measure,
    threshold,
    sniff = null,
    rateWindow = null,
  }: {
    pred: Prediction;
    windows: QcWindow[];
    pcts: Values[];
    measure: MeasureName;
    threshold: number;
    /** sniff sensor on the prediction's samples (null: none or not loaded yet) */
    sniff?: Float32Array | null;
    /** breathing-rate rolling window, s (0 = instantaneous, null = follow the zoom) */
    rateWindow?: number | null;
  } = $props();

  let host = $state<HTMLDivElement | null>(null);
  // one element per chart, each under its own caption
  const hosts = $state<Record<"sig" | "sniff" | "rate" | "ons" | "strip", HTMLDivElement | null>>({ sig: null, sniff: null, rate: null, ons: null, strip: null });
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
  /** the rate window in use (the set one, or the one the zoom picked) */
  let effWindow = $state(0);

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

  const gap = (v: number) => (Number.isFinite(v) ? v : null);

  function data(series: ArrayLike<number>, x: Float64Array = rel): uPlot.AlignedData {
    const [i0, i1] = visibleRange(x, range[0], range[1]);
    const d = decimate(x, series, i0, i1, Math.max(200, Math.round(width)));
    return [Array.from(d.x), Array.from(d.y, gap)] as uPlot.AlignedData;
  }

  // charts whose data is re-decimated to the visible range on every zoom
  let refreshers: (() => void)[] = [];

  function setRange(next: [number, number]) {
    const span = Math.max(next[1] - next[0], 0.5);
    range = [next[0], next[0] + span];
    for (const r of refreshers) r();
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
    if (!host || !hosts.sig || !hosts.rate || !hosts.ons || !hosts.strip) return;
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
      hosts.sig!,
    );
    const made: uPlot[] = [sig];
    refreshers = [() => sig.setData(data(pred.signal), false)];

    if (sniff && hosts.sniff) {
      const values = sniff;
      const sn = new uPlot(
        {
          ...common(110),
          axes: [timeAxis(false), axis("sniff sensor")],
          series: [{}, { stroke: css("--sniff"), width: 1, points: { show: false } }],
        },
        data(values),
        hosts.sniff,
      );
      made.push(sn);
      refreshers.push(() => sn.setData(data(values), false));
    }

    // breathing rate from the inter-onset intervals: steps (window 0) or a rolling mean; the window
    // follows the zoom unless one is set, so it is recomputed (only when it changes) on every zoom
    const stepped = uPlot.paths.stepped!({ align: 1 });
    const linear = uPlot.paths.linear!();
    let computedFor = -1;
    let rateData: uPlot.AlignedData = [[], []];
    let top = 1;
    const rateFor = (): uPlot.AlignedData => {
      const w = rateWindow ?? autoRateWindow(range[1] - range[0]);
      if (w !== computedFor) {
        const r = breathingRate(inhales, w);
        const v = Array.from(r.hz).filter(Number.isFinite).sort((a, b) => a - b);
        top = v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.995))] * 1.15 : 1;
        rateData = [Array.from(r.t), Array.from(r.hz, gap)] as uPlot.AlignedData;
        computedFor = w;
        effWindow = w;
      }
      return rateData;
    };
    const first = rateFor();
    const rt = new uPlot(
      {
        ...common(100),
        axes: [timeAxis(false), axis("rate (Hz)", { values: (_u, t) => t.map((v) => formatValue(v, 2)) })],
        scales: { ...common(0).scales, y: { auto: false, range: () => [0, top] } },
        series: [{}, { stroke: css("--rate"), width: 1.25, points: { show: false }, paths: effWindow > 0 ? linear : stepped }],
      },
      first,
      hosts.rate!,
    );
    made.push(rt);
    refreshers.push(() => {
      const d = rateFor();
      rt.series[1].paths = computedFor > 0 ? linear : stepped;
      rt.setData(d, false);
    });

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
      hosts.ons!,
    );
    made.push(ons);
    refreshers.push(() => ons.setData(data(pred.onset), false));

    const atyp = css("--atyp");
    const surface = css("--surface-3");
    const better = MEASURE_BY_NAME[measure].better;
    const strip = new uPlot(
      {
        ...common(100),
        axes: [
          timeAxis(true),
          // label the windows' min and max (auto ticks can miss a narrow padded range)
          axis(MEASURE_BY_NAME[measure].short, {
            splits: () => extentTicks(wins.map((w) => w.value)),
            values: (_u, t) => t.map((v) => formatValue(v, 2)),
          }),
        ],
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
      hosts.strip!,
    );
    strip.over.addEventListener("click", () => {
      if (hovered !== null && strip.select.width < 3) setRange([wins[hovered].start, wins[hovered].end]);
    });
    charts = [...made, strip];
    for (const u of charts) u.over.addEventListener("dblclick", () => setRange([...full]));
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
    void [pred, wins, threshold, app.theme, sniff, rateWindow];
    untrack(build);
  });

  const hoveredWin = $derived(hovered === null ? null : wins[hovered]);

  // colour key of the QC strip, drawn with the same rule as the bars (percentile on the worse side → tint)
  const tint = (worseThan: number) => {
    const mix = shadeMix(atypicality(100 - worseThan, "higher")) / 45;
    return mix > 0 ? { color: "var(--atyp)", alpha: 0.35 + 0.65 * mix } : { color: "var(--surface-3)", alpha: 1 };
  };
  const KEY = [
    { label: "grey: median or better", ...tint(50) },
    { label: "light: worse than 75% of them", ...tint(75) },
    { label: "strong: worse than 90%", ...tint(90) },
    { label: "full: worse than 98%", ...tint(98) },
  ];
</script>

<div class="stack">
  <div class="tools faint">
    <span>Drag to zoom · double-click to reset · click a window below to zoom to it</span>
    <span class="spacer"></span>
    <label
      class="rw"
      title="Empty = follows the zoom (a wide rolling mean zoomed out, each interval zoomed in). 0 = instantaneous rate of every inter-onset interval; otherwise a centred rolling mean over this many seconds."
    >
      rate window
      <input
        type="number"
        min="0"
        step="1"
        value={rateWindow ?? ""}
        placeholder={`auto ${effWindow}`}
        onchange={(e) => {
          const raw = e.currentTarget.value.trim();
          const v = Number(raw);
          app.setRateWindow(raw === "" || !Number.isFinite(v) ? null : v);
        }}
        aria-label="Breathing rate window in seconds"
      />
      s
      {#if rateWindow !== null}<button class="small" onclick={() => app.setRateWindow(null)}>auto</button>{/if}
    </label>
    {#if hoveredWin}
      <span class="mono hov">
        {formatDuration(hoveredWin.start)}–{formatDuration(hoveredWin.end)} · {MEASURE_BY_NAME[measure].short}
        {formatValue(hoveredWin.value)} · pct {formatPct(hoveredWin.pct)}
      </span>
    {/if}
    <button class="small" onclick={() => setRange([...full])}>Reset zoom</button>
  </div>
  <div class="host" bind:this={host}>
    <div class="cap">
      <i class="sw" style:background="var(--trace)"></i>
      <b>Predicted breathing</b> — the network's trace from the video, z-scored, inhale up. Ticks along the bottom: detected inhales.
    </div>
    <div bind:this={hosts.sig}></div>

    {#if sniff}
      <div class="cap">
        <i class="sw" style:background="var(--sniff)"></i>
        <b>Sniff sensor</b> — the implanted thermistor (sniffing.parquet, raw voltage), resampled from 250 Hz to the prediction's 60 Hz.
        Aligned to the prediction at their first samples only.
      </div>
      <div bind:this={hosts.sniff}></div>
    {/if}

    <div class="cap">
      <i class="sw" style:background="var(--rate)"></i>
      <b>Breathing rate</b> — 1 / the time between consecutive detected inhales, in Hz.
      {#if effWindow > 0}Smoothed: mean over a centred {effWindow}-s window.{:else}Unsmoothed: one step per inter-inhale interval.{/if}
      {#if rateWindow === null}<span class="faint">The window follows the zoom (wider when zoomed out, none when zoomed in).</span>{/if}
      Gaps over 2 s are left blank.
    </div>
    <div bind:this={hosts.rate}></div>

    <div class="cap">
      <i class="sw" style:background="var(--onset)"></i>
      <b>Inhale probability</b> — the network's per-sample probability that an inhale starts; an inhale is detected where it peaks above the dashed
      threshold ({threshold}).
    </div>
    <div bind:this={hosts.ons}></div>

    <div class="cap">
      <b>QC per 30-s window: {MEASURE_BY_NAME[measure].label}</b> — {MEASURE_BY_NAME[measure].help}
      {#if MEASURE_BY_NAME[measure].better}
        <span class="faint">({MEASURE_BY_NAME[measure].better} is better.)</span>
        <div class="key">
          Bar height = the window's value. Colour = how this window ranks among the network's validation windows on this measure:
          {#each KEY as k (k.label)}
            <span class="chip"><i class="swatch" style:background={k.color} style:opacity={k.alpha}></i>{k.label}</span>
          {/each}
          <span class="faint">A rank, not a verdict: compare with the reference panels below.</span>
        </div>
      {:else}
        <span class="faint">Descriptive only (no better direction): bars are not coloured.</span>
      {/if}
    </div>
    <div bind:this={hosts.strip}></div>
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
  .rw {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .rw input {
    width: 76px;
    height: 24px;
    padding: 0 4px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .host {
    width: 100%;
  }
  .host :global(.u-select) {
    background: color-mix(in oklab, var(--accent) 18%, transparent);
  }
  .cap {
    font-size: 12px;
    color: var(--text-2);
    margin: 10px 0 2px 44px;
    line-height: 1.45;
  }
  .cap b {
    color: var(--text);
    font-weight: 600;
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin-top: 3px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .swatch {
    display: inline-block;
    width: 18px;
    height: 10px;
    border-radius: 2px;
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 3px;
    border-radius: 2px;
    vertical-align: middle;
    margin-right: 2px;
  }
</style>
