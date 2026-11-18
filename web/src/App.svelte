<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "./lib/app.svelte";
  import { route, sessionIdFromPath } from "./lib/router.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import CommandPalette from "./components/CommandPalette.svelte";
  import FilterBar from "./components/FilterBar.svelte";
  import SessionTable from "./components/SessionTable.svelte";
  import SessionView from "./components/SessionView.svelte";
  import { filterRows } from "./lib/filter";

  const sessionId = $derived(sessionIdFromPath(route.current.path));
  const filtered = $derived(filterRows(app.rows, app.filters));


  onMount(() => {
    app.applyTheme();
    app.load();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        app.paletteOpen = !app.paletteOpen;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<div class="shell">
  <Sidebar />
  <main>
    {#if app.error}
      <div class="notice error banner">{app.error} <button class="small" onclick={() => app.load()}>Retry</button></div>
    {:else if !app.index}
      <div class="empty">Loading sessions…</div>
    {:else if sessionId}
      {#key sessionId}<SessionView id={sessionId} />{/key}
    {:else}
      <FilterBar shown={filtered.length} total={app.rows.length} />
      <SessionTable rows={filtered} />
    {/if}
  </main>
</div>
<CommandPalette />

<style>
  .shell {
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    height: 100%;
  }
  main {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .banner {
    margin: 12px;
  }
</style>
