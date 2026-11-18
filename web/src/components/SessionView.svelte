<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { fileUrl, type IndexRow } from "../lib/index-types";
  import { MEASURES, type MeasureName } from "../lib/measures";
  import { splitReference, TRUTHS, windowPercentiles, type QcReport, type Reference, type TruthName } from "../lib/qc";
  import { loadPrediction, loadQc, loadReference, readSniff, type Prediction } from "../lib/session";
  import { loadSniff, type Sniff } from "../lib/behavior";
  import SessionHeader from "./SessionHeader.svelte";
  import TraceStack from "./TraceStack.svelte";
  import MeasureCompare from "./MeasureCompare.svelte";
  import CalibrationPlot from "./CalibrationPlot.svelte";

  let { id }: { id: string } = $props();
  const row: IndexRow | undefined = $derived(app.byId.get(id));

  let pred = $state<Prediction | null>(null);
  let qc = $state<QcReport | null>(null);
  let ref = $state<Reference | null>(null);
  let refState = $state<"none" | "loading" | "ready" | "failed">("none");
  let error = $state<string | null>(null);

  $effect(() => {
    const r = row;
    pred = null;
    qc = null;
    ref = null;
    error = null;
    if (!r) return;
    let alive = true;
    loadQc(fileUrl(r, ".qc.json"))
      .then((q) => alive && (qc = q))
      .catch((e: Error) => alive && (error = e.message));
    loadPrediction(fileUrl(r, ".prediction.parquet"))
      .then((p) => alive && (pred = p))
      .catch((e: Error) => alive && (error = e.message));
    const refUrl = r.n ? app.index?.networks[r.n]?.ref : undefined;
    refState = refUrl ? "loading" : "none";
    if (refUrl) {
      loadReference(refUrl)
        .then((x) => {
          if (!alive) return;
          ref = x;
          refState = "ready";
        })
        .catch(() => alive && (refState = "failed"));
    }
    return () => {
      alive = false;
    };
  });

  // the sniff sensor, looked up lazily once the prediction (its frame clock) is here
  let sniff = $state<Sniff | { state: "loading" } | null>(null);
  $effect(() => {
    const r = row;
    const p = pred;
    sniff = null;
    if (!r?.raw || !p) return;
    let alive = true;
    sniff = { state: "loading" };
    loadSniff(r.raw, p, { readSniff })
      .then((s) => alive && (sniff = s))
      .catch((e: Error) => alive && (sniff = { state: "failed", asset: "", error: e.message }));
    return () => {
      alive = false;
    };
  });
  const sniffValues = $derived(sniff?.state === "ready" ? sniff.values : null);

  const pcts = $derived(qc ? qc.windows.map((w) => windowPercentiles(w, ref)) : []);
  const split = $derived(ref ? splitReference(ref, app.truth, app.threshold) : { good: [], poor: [] });
  const truthBetter = $derived(TRUTHS.find((t) => t.name === app.truth)?.better ?? "higher");
</script>

{#if !row}
  <div class="empty">No session <span class="mono">{id}</span> in the index.</div>
{:else}
  <div class="view">
    <SessionHeader {row} />
    <section class="panel">
      <div class="row ctl">
        <h2>Prediction</h2>
        <span class="spacer"></span>
        <label class="row">
          <span class="faint">QC strip</span>
          <select value={app.measure} onchange={(e) => app.setMeasure(e.currentTarget.value as MeasureName)}>
            {#each MEASURES as m (m.name)}<option value={m.name}>{m.label}</option>{/each}
          </select>
        </label>
        {#if refState === "loading"}<span class="faint">loading reference…</span>{/if}
        {#if refState === "failed"}<span class="badge warn">reference could not be loaded</span>{/if}
      </div>
      <div class="sniff faint">
        {#if !row.raw}
          No raw session id: cannot look for a sniff sensor.
        {:else if !sniff || sniff.state === "loading"}
          Looking for a sniff sensor in the processed behavior asset…
        {:else if sniff.state === "no-asset"}
          No processed behavior asset in DocDB for this session.
        {:else if sniff.state === "no-sensor"}
          No sniff sensor in <span class="mono">{sniff.asset}</span> (animal not implanted).
        {:else if sniff.state === "failed"}
          <span class="badge warn">sniff sensor could not be loaded</span> {sniff.error}
        {:else if sniff.state === "ready"}
          Sniff sensor from <a class="mono" href={sniff.url} download>{sniff.asset}/sniffing.parquet</a>
        {/if}
      </div>
      {#if sniff?.state === "ready"}
        <div class="notice warn-align">
          <strong>Sniff sensor alignment is approximate.</strong> The prediction is in video time and the sensor on the Harp
          clock, and neither file links the two: both are lined up at their first sample. Expect a constant offset (and slow
          drift) between the sensor and the predicted trace; compare shapes and rates, not exact timing.
        </div>
      {/if}
      {#if error}
        <div class="notice error">{error}</div>
      {:else if !pred || !qc}
        <div class="empty">Loading trace…</div>
      {:else}
        <TraceStack
          {pred}
          windows={qc.windows}
          {pcts}
          measure={app.measure}
          threshold={qc.head_threshold}
          sniff={sniffValues}
          rateWindow={app.rateWindow}
        />
      {/if}
    </section>
    {#if qc}
      <section class="panel">
        <div class="row ctl wrap">
          <h2>Compared with the network's validation windows</h2>
          <span class="spacer"></span>
          {#if ref}
            <label class="row">
              <span class="faint">Split reference by</span>
              <select value={app.truth} onchange={(e) => app.setSplit(e.currentTarget.value as TruthName, app.threshold)}>
                {#each TRUTHS as t (t.name)}<option value={t.name}>{t.label}</option>{/each}
              </select>
              <span class="faint">{truthBetter === "higher" ? "≥" : "≤"}</span>
              <input
                class="th"
                type="number"
                step="0.05"
                value={app.threshold}
                onchange={(e) => {
                  const v = Number(e.currentTarget.value);
                  if (Number.isFinite(v)) app.setSplit(app.truth, v);
                }}
                aria-label="Threshold"
              />
            </label>
          {/if}
        </div>
        {#if ref}
          <div class="legend row faint">
            <span><i class="sw" style:background="var(--series-good)"></i> reference windows predicted well ({split.good.length})</span>
            <span><i class="sw" style:background="var(--series-poor)"></i> predicted poorly ({split.poor.length})</span>
            <span><i class="sw" style:background="var(--series-session)"></i> this session's 30-s windows ({qc.windows.length}) · dashed = its median</span>
          </div>
        {:else if refState === "loading"}
          <div class="faint">Loading the network's reference…</div>
        {:else}
          <div class="notice">
            No reference for this network{refState === "failed" ? " (it could not be loaded)" : ""}: values are shown without
            percentiles or validation windows.
          </div>
        {/if}
        <div class="grid">
          {#each MEASURES as m (m.name)}
            <MeasureCompare measure={m} windows={qc.windows} {pcts} good={split.good} poor={split.poor} hasReference={!!ref} />
          {/each}
          {#if ref?.onset_calibration}
            <CalibrationPlot cal={ref.onset_calibration} version={ref.zephyr_version} />
          {/if}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .view {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .panel {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .ctl {
    margin-bottom: 6px;
  }
  .sniff {
    font-size: 12px;
    margin-bottom: 6px;
  }
  .warn-align {
    font-size: 12px;
    margin-bottom: 8px;
    border-left: 3px solid var(--sniff);
  }
  .wrap {
    flex-wrap: wrap;
  }
  .th {
    width: 70px;
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .legend {
    flex-wrap: wrap;
    gap: 16px;
    font-size: 12px;
    margin: 4px 0 10px;
  }
  .sw {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    vertical-align: -1px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 10px;
  }
</style>
