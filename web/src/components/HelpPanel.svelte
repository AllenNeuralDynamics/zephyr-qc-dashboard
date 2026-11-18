<script lang="ts">
  import { app } from "../lib/app.svelte";
  import { MEASURES } from "../lib/measures";
</script>

{#if app.helpOpen}
  <aside class="help" aria-label="About the QC measures">
    <header class="row">
      <h2>About the QC measures</h2>
      <span class="spacer"></span>
      <button class="small ghost" onclick={() => (app.helpOpen = false)} aria-label="Close">✕</button>
    </header>
    <div class="body">
      <p>
        Zephyr predicts breathing from video. Without a breathing sensor nothing can be scored directly, so its quality
        control measures each prediction from the network's own output: label-free <b>measures</b>, over the whole video
        and per 30-s window.
      </p>
      <p>
        Each network ships a <b>reference</b>: the same measures on its validation windows, where the true breathing was
        known. A <b>percentile</b> is the share of those windows with a lower value. It is a position, not a pass or a
        fail.
      </p>
      <p>
        The comparison splits the reference windows by a true score (default: true inhale F1 ≥ 0.9) into windows the
        network predicted <b>well</b> and <b>poorly</b>, so you can see what good and poor predictions scored.
      </p>
      <p class="faint">
        Measures are proxies: a video unlike the validation windows is different, not necessarily wrong; one like them can
        still be wrong.
      </p>
      <h3>Measures</h3>
      <dl>
        {#each MEASURES as m (m.name)}
          <dt>{m.label} <span class="faint">· {m.better ? `${m.better} is better` : "description"}</span></dt>
          <dd>{m.help}</dd>
        {/each}
      </dl>
      <p class="faint">
        Source: <a href="https://github.com/AllenNeuralDynamics/zephyr" target="_blank" rel="noreferrer">Zephyr</a>,
        docs/guides/quality-control.md.
      </p>
    </div>
  </aside>
{/if}

<style>
  .help {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(420px, 100vw);
    z-index: 40;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
  }
  header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .body {
    padding: 4px 16px 16px;
    overflow: auto;
  }
  dt {
    font-weight: 500;
    margin-top: 8px;
  }
  dd {
    margin: 2px 0 0;
    color: var(--text-2);
  }
  h3 {
    margin-top: 12px;
  }
</style>
