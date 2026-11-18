<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { DASH, formatDate, formatDuration } from "../lib/format";
  import { fileUrl, type IndexRow } from "../lib/index-types";
  import { href } from "../lib/router.svelte";

  let { row }: { row: IndexRow } = $props();
  let zoom = $state(false);
  const network = $derived(app.networkLabel(row.n));
  const time = $derived(row.t ? row.t.slice(11, 16) + " UTC" : "");
</script>

<header class="head">
  <div class="title">
    <a class="back" href={href([])} aria-label="Back to sessions">←</a>
    <h1 class="mono">{row.raw ?? row.id}</h1>
    <span class="badge accent">{row.c ?? "camera ?"}</span>
  </div>
  <dl class="facts">
    <div><dt>Animal</dt><dd class="mono">{row.s ?? DASH}</dd></div>
    <div><dt>Date</dt><dd class="mono">{formatDate(row.t)} <span class="faint">{time}</span></dd></div>
    <div><dt>Rig</dt><dd class="mono">{row.r ?? DASH}</dd></div>
    <div><dt>Experimenter</dt><dd>{row.e.length ? row.e.join(", ") : DASH}</dd></div>
    <div><dt>Duration</dt><dd class="mono">{formatDuration(row.d)}</dd></div>
    <div>
      <dt>Network</dt>
      <dd class="mono">
        {#if network}{network}{:else}<span class="badge warn" title={row.n ?? ""}>no reference for this network</span>{/if}
      </dd>
    </div>
    <div><dt>Files</dt><dd><a href={row.b} target="_blank" rel="noreferrer">asset folder ↗</a></dd></div>
  </dl>
  {#if row.err}
    <div class="notice error">Could not read this session: {row.err}</div>
  {/if}
  {#if row.png}
    <button class="thumb" onclick={() => (zoom = true)} title="First frame as the network saw it (green box = crop)">
      <img src={fileUrl(row, "_network_input.png")} alt="Network input with the crop box" />
    </button>
    {#if zoom}
      <div class="backdrop" role="presentation" onclick={() => (zoom = false)}>
        <img class="big" src={fileUrl(row, "_network_input.png")} alt="Network input with the crop box" />
      </div>
    {/if}
  {/if}
</header>

<style>
  .head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px 16px;
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 10px;
    grid-column: 1;
  }
  .back {
    font-size: 16px;
    color: var(--text-2);
  }
  .facts {
    grid-column: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 24px;
    margin: 0;
  }
  .facts div {
    display: flex;
    flex-direction: column;
  }
  dt {
    font-size: 11px;
    color: var(--text-3);
  }
  dd {
    margin: 0;
  }
  .notice {
    grid-column: 1;
  }
  .thumb {
    grid-column: 2;
    grid-row: 1 / span 3;
    height: auto;
    padding: 2px;
  }
  .thumb img {
    height: 72px;
    display: block;
  }
  .big {
    max-width: 90vw;
    max-height: 80vh;
    image-rendering: pixelated;
  }
</style>
