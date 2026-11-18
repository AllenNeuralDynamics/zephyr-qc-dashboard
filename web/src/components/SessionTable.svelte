<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { sortRows, type SortKey } from "../lib/filter";
  import { formatDate, DASH } from "../lib/format";
  import type { IndexRow } from "../lib/index-types";
  import { MEASURE_BY_NAME, MEASURES } from "../lib/measures";
  import { navigate, sessionPath } from "../lib/router.svelte";
  import PctCell from "./PctCell.svelte";

  let { rows }: { rows: IndexRow[] } = $props();

  const ROW_H = 30;
  const OVERSCAN = 10;

  let sortKey = $state<SortKey>("date");
  let sortBy = $state<"value" | "pct">("value");
  let sortDir = $state<"asc" | "desc">("desc");
  let scrollTop = $state(0);
  let viewH = $state(600);

  const sorted = $derived(sortRows(rows, sortKey, sortBy, sortDir));
  const first = $derived(Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN));
  const last = $derived(Math.min(sorted.length, Math.ceil((scrollTop + viewH) / ROW_H) + OVERSCAN));
  const visible = $derived(sorted.slice(first, last));
  // the highlighted measure comes first so it is always in view
  const judged = $derived(
    [...MEASURES.filter((m) => m.better !== null)].sort((a, b) => Number(b.name === app.measure) - Number(a.name === app.measure)),
  );

  function sortOn(key: SortKey) {
    if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortKey = key;
      // measures: start with the worse side first (low pct for higher-is-better, high pct otherwise)
      sortBy = key === "date" ? "value" : "pct";
      sortDir = key === "date" ? "desc" : MEASURE_BY_NAME[key].better === "higher" ? "asc" : "desc";
    }
  }
  const arrow = (key: SortKey) => (sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "");
  const open = (r: IndexRow) => navigate(sessionPath(r.id));
</script>

<div class="wrap" bind:clientHeight={viewH} onscroll={(e) => (scrollTop = e.currentTarget.scrollTop)}>
  <table class="dense">
    <thead>
      <tr>
        <th class="sortable" onclick={() => sortOn("date")}>Date{arrow("date")}</th>
        <th>Animal</th>
        <th>Rig</th>
        <th>Experimenter</th>
        <th>Raw session</th>
        <th>Camera</th>
        <th>Network</th>
        {#each judged as m (m.name)}
          <th
            class="sortable num"
            class:hl={m.name === app.measure}
            onclick={() => sortOn(m.name)}
            title="{m.label}: median over 30-s windows, and its median percentile among the network's validation windows ({m.better} is better). Click to sort."
          >
            {m.short}{arrow(m.name)}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if first > 0}<tr class="pad" style:height="{first * ROW_H}px"><td colspan="99"></td></tr>{/if}
      {#each visible as r (r.id)}
        <tr class="clickable" onclick={() => open(r)} onkeydown={(e) => e.key === "Enter" && open(r)} tabindex="0">
          <td class="mono">{formatDate(r.t)}</td>
          <td class="mono">{r.s ?? DASH}</td>
          <td class="mono">{r.r ?? DASH}</td>
          <td class="ellipsis" title={r.e.join(", ")}>{r.e.length ? r.e.join(", ") : DASH}</td>
          <td class="mono raw" title={r.raw ?? ""}>
            {#if r.err}<span class="err" title={r.err} aria-label="Error: {r.err}">⚠</span>{/if}
            {r.raw ?? DASH}
          </td>
          <td>{r.c ?? DASH}</td>
          <td class="mono ellipsis" title={app.networkLabel(r.n) ?? r.n ?? ""}>
            {#if app.networkLabel(r.n)}{app.networkLabel(r.n)}{:else}<span class="faint" title="No reference for this network">{r.n ? r.n.slice(0, 8) : DASH}</span>{/if}
          </td>
          {#each judged as m (m.name)}
            <PctCell measure={m} value={r.m[m.name]?.[0]} pct={r.m[m.name]?.[1]} />
          {/each}
        </tr>
      {/each}
      {#if last < sorted.length}<tr class="pad" style:height="{(sorted.length - last) * ROW_H}px"><td colspan="99"></td></tr>{/if}
    </tbody>
  </table>
  {#if !rows.length}<div class="empty">No sessions match these filters.</div>{/if}
</div>

<style>
  .wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  th.hl {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .ellipsis {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .raw {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .err {
    color: var(--danger);
    margin-right: 4px;
  }
  tr.pad td {
    border: none;
    padding: 0;
  }
</style>
