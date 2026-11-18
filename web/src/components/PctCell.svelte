<script lang="ts">
  import { formatPct, formatValue } from "../lib/format";
  import type { Measure } from "../lib/measures";
  import { atypicality, shadeMix } from "../lib/shade";

  let { measure, value, pct }: { measure: Measure; value: number | null | undefined; pct: number | null | undefined } = $props();
  const mix = $derived(shadeMix(atypicality(pct, measure.better)));
  const title = $derived(
    `${measure.label}: median ${formatValue(value)}` +
      (pct === null || pct === undefined ? " (no reference percentile)" : `, ${formatPct(pct)}th percentile of the network's validation windows`),
  );
</script>

<td class="num cell" style:--mix="{mix}%" {title}>
  <span class="v">{formatValue(value)}</span>
  <span class="p faint">{formatPct(pct)}</span>
</td>

<style>
  .cell {
    background: color-mix(in oklab, var(--atyp) var(--mix), transparent);
  }
  .v {
    display: inline-block;
    min-width: 42px;
  }
  .p {
    display: inline-block;
    min-width: 22px;
    font-size: 11px;
  }
</style>
