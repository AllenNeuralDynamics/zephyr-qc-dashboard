<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { facetValues } from "../lib/filter";
  import { MEASURES, type MeasureName } from "../lib/measures";
  import MultiSelect from "./MultiSelect.svelte";

  let { shown, total }: { shown: number; total: number } = $props();
  const facets = $derived(facetValues(app.rows));
  const any = $derived(
    app.filters.subject.length + app.filters.rig.length + app.filters.experimenter.length > 0 ||
      !!app.filters.from ||
      !!app.filters.to,
  );
</script>

<div class="bar">
  <MultiSelect label="Animal" options={facets.subject} selected={app.filters.subject} onchange={(v) => app.setFilters({ subject: v })} />
  <MultiSelect label="Rig" options={facets.rig} selected={app.filters.rig} onchange={(v) => app.setFilters({ rig: v })} />
  <MultiSelect
    label="Experimenter"
    options={facets.experimenter}
    selected={app.filters.experimenter}
    onchange={(v) => app.setFilters({ experimenter: v })}
  />
  <label class="date">
    <span class="faint">From</span>
    <input type="date" value={app.filters.from ?? ""} onchange={(e) => app.setFilters({ from: e.currentTarget.value || null })} />
  </label>
  <label class="date">
    <span class="faint">to</span>
    <input type="date" value={app.filters.to ?? ""} onchange={(e) => app.setFilters({ to: e.currentTarget.value || null })} />
  </label>
  {#if any}
    <button class="small ghost" onclick={() => app.setFilters({ subject: [], rig: [], experimenter: [], from: null, to: null })}>Clear filters</button>
  {/if}
  <span class="spacer"></span>
  <label class="measure">
    <span class="faint">Highlight</span>
    <select value={app.measure} onchange={(e) => app.setMeasure(e.currentTarget.value as MeasureName)}>
      {#each MEASURES as m (m.name)}
        <option value={m.name}>{m.label}</option>
      {/each}
    </select>
  </label>
  <span class="faint count">{shown} of {total} sessions</span>
</div>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .date,
  .measure {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input[type="date"] {
    height: 26px;
    padding: 0 6px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
</style>
