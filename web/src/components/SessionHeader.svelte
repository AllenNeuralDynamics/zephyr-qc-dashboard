<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { DASH, formatDate, formatDuration, formatLocalTime } from "../lib/format";
  import { fileUrl, type IndexRow } from "../lib/index-types";
  import { href } from "../lib/router.svelte";
  import { bucketUrl, listPrefix, s3Location } from "../lib/s3";
  import { NETWORKS_PREFIX } from "../lib/networks";

  let { row }: { row: IndexRow } = $props();
  let zoom = $state(false);
  const network = $derived(app.networkLabel(row.n));
  const time = $derived(row.t ? row.t.slice(11, 16) + " UTC" : "");

  // S3 folder URLs are not browsable: list the asset and link the files that exist
  let files = $state<{ name: string; url: string; size: number }[] | null>(null);
  let filesError = $state<string | null>(null);
  $effect(() => {
    const loc = s3Location(row.b);
    files = null;
    filesError = null;
    if (!loc) return;
    let alive = true;
    listPrefix(loc.bucket, loc.prefix)
      .then(({ keys }) => {
        if (!alive) return;
        files = keys
          .map((k) => ({ name: k.key.slice(loc.prefix.length), url: `${bucketUrl(loc.bucket)}/${k.key}`, size: k.size }))
          .filter((x) => x.name && !x.name.includes("/"));
      })
      .catch((e: Error) => alive && (filesError = e.message));
    return () => {
      alive = false;
    };
  });
  // where the inference results live, for downloading the whole folder
  const s3 = $derived.by(() => {
    const loc = s3Location(row.b);
    if (!loc) return null;
    const uri = `s3://${loc.bucket}/${loc.prefix}`;
    return {
      uri,
      cli: `aws s3 cp --recursive --no-sign-request ${uri} .`,
    };
  });
  // the Zephyr inference asset in the AIND catalog browser. The manuscript's application/ folders
  // are scratch, not catalog assets: they have no link (copy the path instead)
  const CATALOG = "https://allenneuraldynamics.github.io/catalog-browser/browse/";
  const catalog = $derived.by(() => {
    if (row.b.includes(`/${NETWORKS_PREFIX}`)) return null;
    const name = row.id.split("/")[0];
    return name ? { url: `${CATALOG}${encodeURIComponent(name)}/`, title: name } : null;
  });
  let copied = $state<string | null>(null);
  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(() => {
      copied = text;
      setTimeout(() => copied === text && (copied = null), 1500);
    });
  }
  const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
</script>

<header class="head">
  <div class="title">
    <a class="back" href={href([])} aria-label="Back to sessions">←</a>
    <h1 class="mono">{row.raw ?? row.id}</h1>
    <span class="badge accent">{row.c ?? "camera ?"}</span>
  </div>
  <dl class="facts">
    <div><dt>Animal</dt><dd class="mono">{row.s ?? DASH}</dd></div>
    <div>
      <dt>Date (raw session)</dt>
      <dd class="mono">{formatDate(row.t)} <span class="faint">{time}</span>{#if row.t}<span class="local"> · {formatLocalTime(row.t)} local</span>{/if}</dd>
    </div>
    <div><dt>Rig</dt><dd class="mono">{row.r ?? DASH}</dd></div>
    <div><dt>Experimenter</dt><dd>{row.e.length ? row.e.join(", ") : DASH}</dd></div>
    <div><dt>Duration</dt><dd class="mono">{formatDuration(row.d)}</dd></div>
    <div>
      <dt>Network</dt>
      <dd class="mono">
        {#if network}{network}{:else}<span class="badge warn" title={row.n ?? ""}>no reference for this network</span>{/if}
      </dd>
    </div>
  </dl>
  {#if s3}
    <div class="s3 row">
      <span class="faint">Inference results</span>
      <code class="mono" title="S3 location of this session's Zephyr output">{s3.uri}</code>
      <button class="small" onclick={() => copy(s3.uri)}>{copied === s3.uri ? "Copied" : "Copy path"}</button>
      <button class="small" onclick={() => copy(s3.cli)} title={s3.cli}>{copied === s3.cli ? "Copied" : "Copy download command"}</button>
      {#if catalog}
        <a href={catalog.url} target="_blank" rel="noreferrer" title={catalog.title}>See in S3 ↗</a>
      {/if}
    </div>
  {/if}
  <details class="files">
    <summary class="faint">Files in this asset{files ? ` (${files.length})` : ""}</summary>
    {#if filesError}
      <span class="faint">Could not list the asset: {filesError}</span>
    {:else if !files}
      <span class="faint">Listing…</span>
    {:else}
      <ul>
        {#each files as f (f.url)}
          <li><a class="mono" href={f.url} target="_blank" rel="noreferrer" download>{f.name}</a> <span class="faint">{kb(f.size)}</span></li>
        {:else}
          <li class="faint">No files found.</li>
        {/each}
      </ul>
    {/if}
  </details>
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
  .local {
    color: var(--text-2);
  }
  dd {
    margin: 0;
  }
  .notice {
    grid-column: 1;
  }
  .s3 {
    grid-column: 1;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 12px;
  }
  .s3 code {
    padding: 2px 6px;
    border-radius: var(--radius);
    background: var(--surface-2);
    overflow-wrap: anywhere;
  }
  .files {
    grid-column: 1;
    font-size: 12px;
  }
  .files summary {
    cursor: pointer;
  }
  .files ul {
    margin: 4px 0 0;
    padding-left: 16px;
    columns: 2 320px;
  }
  .thumb {
    grid-column: 2;
    grid-row: 1 / span 4;
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
