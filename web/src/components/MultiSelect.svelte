<script lang="ts">
  let {
    label,
    options,
    selected,
    onchange,
  }: { label: string; options: string[]; selected: string[]; onchange: (next: string[]) => void } = $props();

  let open = $state(false);
  let query = $state("");
  let root = $state<HTMLDivElement | null>(null);

  const shown = $derived(options.filter((o) => o.toLowerCase().includes(query.trim().toLowerCase())));

  function toggle(o: string) {
    onchange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  }

  $effect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) open = false;
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  });
</script>

<div class="ms" bind:this={root}>
  <button class="chip" class:on={selected.length > 0} onclick={() => (open = !open)} aria-expanded={open}>
    {label}{#if selected.length === 1}: <span class="mono">{selected[0]}</span>{:else if selected.length > 1}: {selected.length}{/if}
    <span class="caret" aria-hidden="true">▾</span>
  </button>
  {#if open}
    <div class="pop card" role="listbox" aria-multiselectable="true" aria-label={label}>
      {#if options.length > 8}
        <input type="search" placeholder="Search {label.toLowerCase()}…" bind:value={query} aria-label="Search {label}" />
      {/if}
      <ul>
        {#each shown as o (o)}
          <li>
            <label>
              <input type="checkbox" checked={selected.includes(o)} onchange={() => toggle(o)} />
              <span class="mono">{o}</span>
            </label>
          </li>
        {:else}
          <li class="faint none">No values</li>
        {/each}
      </ul>
      {#if selected.length}
        <button class="small ghost clear" onclick={() => onchange([])}>Clear</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ms {
    position: relative;
  }
  .caret {
    color: var(--text-3);
    font-size: 10px;
  }
  .pop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    min-width: 200px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px;
    box-shadow: var(--shadow);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
  }
  label {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 4px;
    border-radius: 4px;
    cursor: pointer;
  }
  label:hover {
    background: var(--surface-2);
  }
  .none {
    padding: 6px;
  }
  .clear {
    align-self: flex-end;
  }
</style>
