<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { href, route } from "../lib/router.svelte";

  const themeIcon = $derived(app.theme === "light" ? "☀" : app.theme === "dark" ? "☾" : "◐");
  const generated = $derived(app.index ? new Date(app.index.generated).toLocaleString() : null);
</script>

<aside class="sidebar">
  <a class="brand" href={href([], {})} title="All sessions">
    <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="var(--accent)" />
      <path d="M4 18 Q8 6 12 16 T20 16 T28 12" fill="none" stroke="var(--accent-text)" stroke-width="2.5" stroke-linecap="round" />
    </svg>
    <span>Zephyr QC</span>
  </a>
  <button class="jump" onclick={() => (app.paletteOpen = true)}>
    <span class="faint">Jump to session…</span><span class="spacer"></span><span class="kbd">Ctrl K</span>
  </button>
  <nav>
    <a class="navitem" class:on={route.current.path.length === 0} href={href([], {})}>Sessions</a>
    <button class="navitem helpbtn" class:on={app.helpOpen} onclick={() => (app.helpOpen = !app.helpOpen)}>About the QC measures</button>
  </nav>
  <div class="spacer"></div>
  <div class="foot">
    <div class="row">
      <button class="iconbtn" onclick={() => app.cycleTheme()} title="Theme: {app.theme} (click to change)" aria-label="Theme: {app.theme}">
        {themeIcon}
      </button>
      <span class="spacer"></span>
      {#if app.index}<span class="faint small">{app.rows.length} sessions</span>{/if}
    </div>
    {#if generated}<div class="faint small">Index built {generated}</div>{/if}
    <div class="faint small">Read-only · scores, not verdicts</div>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border-right: 1px solid var(--border);
    background: var(--surface);
    min-height: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text);
    font-weight: 600;
    font-size: 15px;
    padding: 2px 4px;
  }
  .brand:hover {
    text-decoration: none;
  }
  .jump {
    width: 100%;
    justify-content: flex-start;
    background: var(--surface-2);
    border-color: var(--border);
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .navitem {
    display: flex;
    align-items: center;
    height: 30px;
    padding: 0 8px;
    border-radius: var(--radius);
    color: var(--text-2);
    border: none;
    background: transparent;
    width: 100%;
    justify-content: flex-start;
  }
  .navitem:hover {
    background: var(--surface-2);
    text-decoration: none;
  }
  .navitem.on {
    background: var(--accent-soft);
    color: var(--text);
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid var(--border);
    padding-top: 8px;
  }
  .iconbtn {
    width: 28px;
    padding: 0;
    justify-content: center;
  }
  .small {
    font-size: 11px;
  }
</style>
