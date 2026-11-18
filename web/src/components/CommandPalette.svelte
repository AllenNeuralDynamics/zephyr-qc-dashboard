<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { searchRows } from "../lib/filter";
  import { formatDate } from "../lib/format";
  import { navigate, sessionPath } from "../lib/router.svelte";
  import type { IndexRow } from "../lib/index-types";

  let query = $state("");
  let active = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  let items: IndexRow[] = $derived(searchRows(app.rows, query, 12));

  $effect(() => {
    if (app.paletteOpen) {
      query = "";
      active = 0;
      queueMicrotask(() => input?.focus());
    }
  });

  function pick(r: IndexRow | undefined) {
    if (!r) return;
    app.paletteOpen = false;
    navigate(sessionPath(r.id));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") (active = Math.min(active + 1, items.length - 1)), e.preventDefault();
    else if (e.key === "ArrowUp") (active = Math.max(active - 1, 0)), e.preventDefault();
    else if (e.key === "Enter") pick(items[active]);
    else if (e.key === "Escape") app.paletteOpen = false;
  }
</script>

{#if app.paletteOpen}
  <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && (app.paletteOpen = false)}>
    <div class="dialog palette" role="dialog" aria-modal="true" aria-label="Jump to session">
      <input
        bind:this={input}
        type="text"
        placeholder="Jump to session: raw session id, animal…"
        bind:value={query}
        oninput={() => (active = 0)}
        onkeydown={onKey}
        aria-label="Jump to session"
      />
      <ul>
        {#each items as r, i (r.id)}
          <li>
            <button class:active={i === active} onmouseenter={() => (active = i)} onclick={() => pick(r)}>
              <span class="mono label">{r.raw ?? r.id}</span>
              <span class="faint hint">{r.c ?? "—"} · {r.s ?? "—"} · {formatDate(r.t)}</span>
            </button>
          </li>
        {:else}
          <li class="faint none">No matches</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}

<style>
  .palette input {
    width: 100%;
    height: 44px;
    border: none;
    border-bottom: 1px solid var(--border);
    border-radius: 8px 8px 0 0;
    padding: 0 14px;
    font-size: 15px;
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 4px;
  }
  li button {
    width: 100%;
    height: 32px;
    border: none;
    background: transparent;
    justify-content: flex-start;
  }
  li button.active {
    background: var(--accent-soft);
  }
  .label {
    text-align: left;
    font-weight: 600;
  }
  .hint {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .none {
    padding: 10px;
  }
</style>
