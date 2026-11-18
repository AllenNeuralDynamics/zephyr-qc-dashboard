import { describe, expect, it } from "vitest";
import { finite, median, percentile } from "./stats";
import { JUDGED, MEASURES } from "./measures";

describe("median", () => {
  it("skips null and NaN", () => expect(median([3, null, 1, NaN, 2])).toBe(2));
  it("averages the middle pair", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("is null when nothing is known", () => expect(median([null])).toBeNull());
  it("works on typed arrays", () => expect(median(new Float64Array([5, 1, 3]))).toBe(3));
});

describe("percentile (Zephyr's reference.percentiles)", () => {
  it("counts ties as half", () => expect(percentile(2, finite([1, 2, 3]))).toBeCloseTo(50, 12));
  it("is null without a value", () => expect(percentile(null, finite([1]))).toBeNull());
  it("is null for NaN", () => expect(percentile(NaN, finite([1]))).toBeNull());
  it("is null without reference values", () => expect(percentile(1, finite([]))).toBeNull());
  it("is 100 above everything", () => expect(percentile(10, finite([1, 2]))).toBe(100));
  it("is 0 below everything", () => expect(percentile(0, finite([1, 2]))).toBe(0));
});

describe("finite", () => {
  it("drops null, undefined and non-finite", () =>
    expect(Array.from(finite([1, null, undefined, NaN, Infinity, 2]))).toEqual([1, 2]));
});

describe("measure catalogue", () => {
  it("has Zephyr's ten measures in order", () =>
    expect(MEASURES.map((m) => m.name)).toEqual([
      "n_inhales",
      "rate_hz",
      "too_fast_frac",
      "alternation_break_frac",
      "flat_breath_frac",
      "head_trace_f1",
      "peak_prob",
      "ambiguous_peak_frac",
      "onset_background",
      "expected_precision",
    ]));
  it("judges eight of them", () => expect(JUDGED.length).toBe(8));
  it("has a short column label for each", () => {
    for (const m of MEASURES) expect(m.short.length).toBeGreaterThan(0), expect(m.short.length).toBeLessThanOrEqual(12);
  });
  it("copies Zephyr's directions", () => {
    const by = Object.fromEntries(MEASURES.map((m) => [m.name, m.better]));
    expect(by.too_fast_frac).toBe("lower");
    expect(by.head_trace_f1).toBe("higher");
    expect(by.rate_hz).toBeNull();
  });
});
