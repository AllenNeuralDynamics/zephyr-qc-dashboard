// App-wide state: the index, filters/view settings (mirrored in the URL), theme and dialogs.
import { EMPTY_FILTERS, type Filters } from "./filter";
import type { Index, IndexRow } from "./index-types";
import { MEASURE_NAMES, type MeasureName } from "./measures";
import type { TruthName } from "./qc";
import { replaceQuery, route } from "./router.svelte";

export type Theme = "auto" | "light" | "dark";
const THEME_KEY = "zephyr-qc-theme";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch {
    return "auto";
  }
}

const list = (q: URLSearchParams, k: string): string[] => (q.get(k) ? q.get(k)!.split(",").filter(Boolean) : []);

class AppState {
  index = $state<Index | null>(null);
  error = $state<string | null>(null);
  loading = $state(false);
  theme = $state<Theme>(readTheme());
  paletteOpen = $state(false);
  helpOpen = $state(false);

  rows: IndexRow[] = $derived(this.index?.sessions ?? []);
  byId: Map<string, IndexRow> = $derived(new Map(this.rows.map((r) => [r.id, r])));

  filters: Filters = $derived.by(() => {
    const q = route.current.query;
    return {
      ...EMPTY_FILTERS,
      subject: list(q, "s"),
      rig: list(q, "r"),
      experimenter: list(q, "e"),
      from: q.get("from"),
      to: q.get("to"),
    };
  });

  measure: MeasureName = $derived.by(() => {
    const m = route.current.query.get("m") as MeasureName | null;
    return m && MEASURE_NAMES.includes(m) ? m : "head_trace_f1";
  });

  truth: TruthName = $derived((route.current.query.get("truth") as TruthName | null) ?? "truth_inhale_f1");

  threshold: number = $derived.by(() => {
    const v = Number(route.current.query.get("th"));
    return route.current.query.has("th") && Number.isFinite(v) ? v : 0.9;
  });

  /**
   * breathing-rate rolling window in seconds; 0 = instantaneous (each inter-onset interval);
   * null (the default, no `rw` in the URL) = follow the visible span
   */
  rateWindow: number | null = $derived.by(() => {
    const q = route.current.query;
    const v = Number(q.get("rw"));
    return q.has("rw") && Number.isFinite(v) && v >= 0 ? v : null;
  });

  setRateWindow(s: number | null) {
    replaceQuery({ rw: s === null ? null : String(Math.max(0, s)) });
  }

  setFilters(f: Partial<Filters>) {
    const next = { ...this.filters, ...f };
    replaceQuery({
      s: next.subject.join(","),
      r: next.rig.join(","),
      e: next.experimenter.join(","),
      from: next.from,
      to: next.to,
    });
  }

  setMeasure(m: MeasureName) {
    replaceQuery({ m });
  }

  setSplit(truth: TruthName, threshold: number) {
    replaceQuery({ truth, th: String(threshold) });
  }

  networkLabel(sha: string | null): string | null {
    return (sha && this.index?.networks[sha]?.label) || null;
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const r = await fetch("./index.json", { cache: "no-cache" });
      if (!r.ok) throw new Error(`index.json: ${r.status}`);
      this.index = (await r.json()) as Index;
    } catch (e) {
      this.error = `Could not load the session index (${(e as Error).message}).`;
    } finally {
      this.loading = false;
    }
  }

  /** Set the theme attribute right away, so components redrawing on `theme` read the new colors. */
  applyTheme() {
    if (this.theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", this.theme);
  }

  cycleTheme() {
    this.theme = this.theme === "auto" ? "light" : this.theme === "light" ? "dark" : "auto";
    this.applyTheme();
    try {
      localStorage.setItem(THEME_KEY, this.theme);
    } catch {
      /* private mode: theme just won't persist */
    }
  }
}

export const app = new AppState();
