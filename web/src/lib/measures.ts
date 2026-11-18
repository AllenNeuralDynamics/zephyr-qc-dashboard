// Zephyr's QC measures: names, labels, families and directions copied from
// zephyr/quality_control/metrics.py::MEASURES; help text from docs/guides/quality-control.md.

export type MeasureName =
  | "n_inhales"
  | "rate_hz"
  | "too_fast_frac"
  | "alternation_break_frac"
  | "flat_breath_frac"
  | "head_trace_f1"
  | "peak_prob"
  | "ambiguous_peak_frac"
  | "onset_background"
  | "expected_precision";

export interface Measure {
  name: MeasureName;
  family: "rhythm" | "head";
  label: string;
  /** Column header (full label in the tooltip). */
  short: string;
  /** Which way a better prediction tends to score; `null` for a description. */
  better: "higher" | "lower" | null;
  help: string;
}

export const MEASURES: Measure[] = [
  { name: "n_inhales", short: "Inhales", family: "rhythm", label: "Inhales", better: null, help: "Number of inhales found. A description, not a quality score." },
  { name: "rate_hz", short: "Rate (Hz)", family: "rhythm", label: "Breathing rate (Hz)", better: null, help: "Breathing rate. A description: usual rates change with running, odours and task." },
  { name: "too_fast_frac", short: "Too fast", family: "rhythm", label: "Breaths faster than the ceiling", better: "lower", help: "Fraction of breaths faster than the ceiling (15 Hz), which a mouse cannot do. Better predictions have fewer." },
  { name: "alternation_break_frac", short: "Alt. breaks", family: "rhythm", label: "Alternation breaks", better: "lower", help: "How often inhales and exhales fail to alternate. Better predictions alternate." },
  { name: "flat_breath_frac", short: "Flat", family: "rhythm", label: "Flat breaths", better: "lower", help: "Fraction of stretches where the trace swings less than a quarter of the clip's median breath. Better predictions have few." },
  { name: "head_trace_f1", short: "Head↔trace", family: "head", label: "Head vs trace F1", better: "higher", help: "Agreement between the onset head's inhales and peaks on the network's own trace. Better predictions agree." },
  { name: "peak_prob", short: "Peak height", family: "head", label: "Onset peak height", better: "higher", help: "Height of the onset head's inhale peaks. Better predictions have high, decided peaks." },
  { name: "ambiguous_peak_frac", short: "Ambiguous", family: "head", label: "Ambiguous onset peaks", better: "lower", help: "Fraction of peaks between the ambiguity floor (0.2) and the onset threshold. Better predictions have few." },
  { name: "onset_background", short: "Background", family: "head", label: "Onset background", better: "lower", help: "Inhale probability between inhales. Better predictions keep it low." },
  { name: "expected_precision", short: "Exp. prec.", family: "head", label: "Expected precision", better: "higher", help: "Calibrated chance that the asserted inhales are real (needs the network's calibration). Better predictions score high." },
];

export const MEASURE_BY_NAME: Record<MeasureName, Measure> = Object.fromEntries(
  MEASURES.map((m) => [m.name, m]),
) as Record<MeasureName, Measure>;

export const MEASURE_NAMES: MeasureName[] = MEASURES.map((m) => m.name);

/** Measures with a direction (the ones a percentile can be read as typical/atypical for). */
export const JUDGED: MeasureName[] = MEASURES.filter((m) => m.better !== null).map((m) => m.name);
