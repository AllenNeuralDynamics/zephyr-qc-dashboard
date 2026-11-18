<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { fileUrl, type IndexRow } from "../lib/index-types";
  import { MEASURES, type MeasureName } from "../lib/measures";
  import { windowPercentiles, type QcReport, type Reference } from "../lib/qc";
  import { loadPrediction, loadQc, loadReference, type Prediction } from "../lib/session";
  import SessionHeader from "./SessionHeader.svelte";
  import TraceStack from "./TraceStack.svelte";

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

  const pcts = $derived(qc ? qc.windows.map((w) => windowPercentiles(w, ref)) : []);
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
      {#if error}
        <div class="notice error">{error}</div>
      {:else if !pred || !qc}
        <div class="empty">Loading trace…</div>
      {:else}
        <TraceStack {pred} windows={qc.windows} {pcts} measure={app.measure} threshold={qc.head_threshold} />
      {/if}
    </section>
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
</style>
