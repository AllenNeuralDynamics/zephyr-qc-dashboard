import { describe, expect, it } from "vitest";
import { JUDGED } from "./measures";
import { parseQcReport, parseReference, splitReference, windowPercentiles, windowStats } from "./qc";
import { qcFixture, referenceFixture } from "./fixtures/load";

const report = parseQcReport(qcFixture());
const ref = parseReference(referenceFixture());

describe("parseQcReport", () => {
  it("reads the real report's 30-s windows", () => expect(report.windows.length).toBe(97));
  it("rejects something that is not a report", () => expect(() => parseQcReport({})).toThrow("not a Zephyr QC report"));
});

describe("parseReference", () => {
  it("keeps the checkpoint hash", () => expect(ref.checkpoint_sha256.startsWith("4e03b281")).toBe(true));
  it("prebuilds one finite column per measure", () => expect(ref.columns.head_trace_f1.length).toBeGreaterThan(1000));
  it("rejects something that is not a reference", () => expect(() => parseReference({})).toThrow("not a Zephyr QC reference"));
});

describe("windowPercentiles", () => {
  it("matches the percentiles Zephyr wrote, window by window", () => {
    for (const w of report.windows) {
      const computed = windowPercentiles({ ...w, percentiles: undefined }, ref);
      for (const m of JUDGED) {
        const zephyr = w.percentiles?.[m] ?? null;
        if (zephyr === null) expect(computed[m]).toBeNull();
        else expect(Math.abs((computed[m] as number) - zephyr)).toBeLessThan(1e-9);
      }
    }
  });
  it("prefers percentiles already in the report", () =>
    expect(windowPercentiles({ start: 0, end: 30, peak_prob: 0.5, percentiles: { peak_prob: 42 } }, ref).peak_prob).toBe(42));
  it("is null for a missing value", () =>
    expect(windowPercentiles({ start: 0, end: 30, expected_precision: null }, ref).expected_precision).toBeNull());
  it("is null without a reference", () =>
    expect(windowPercentiles({ start: 0, end: 30, peak_prob: 0.5 }, null).peak_prob).toBeNull());
});

describe("windowStats", () => {
  it("gives medians but no percentiles without a reference", () => {
    const noPct = { ...report, windows: report.windows.map((w) => ({ ...w, percentiles: undefined })) };
    const s = windowStats(noPct, null);
    expect(typeof s.head_trace_f1.median).toBe("number");
    for (const m of JUDGED) expect(s[m].medianPct).toBeNull();
  });
  it("gives median percentiles with a reference", () => {
    const s = windowStats(report, ref);
    expect(s.head_trace_f1.medianPct).toBeGreaterThan(0);
    expect(s.head_trace_f1.medianPct).toBeLessThan(30);
  });
  it("keeps a measure that is null everywhere as null, not 0", () => {
    const nulls = { ...report, windows: report.windows.map((w) => ({ ...w, expected_precision: null, percentiles: undefined })) };
    const s = windowStats(nulls, ref);
    expect(s.expected_precision.median).toBeNull();
    expect(s.expected_precision.medianPct).toBeNull();
  });
});

describe("splitReference", () => {
  it("splits on a true score at or above the threshold", () => {
    const { good, poor } = splitReference(ref, "truth_inhale_f1", 0.9);
    expect(good.length + poor.length).toBeLessThanOrEqual(ref.windows.length);
    expect(good.length).toBeGreaterThan(0);
    expect(poor.length).toBeGreaterThan(0);
    for (const w of good) expect(w.truth_inhale_f1).toBeGreaterThanOrEqual(0.9);
    for (const w of poor) expect(w.truth_inhale_f1).toBeLessThan(0.9);
  });
  it("treats KL of inter-breath intervals as lower-is-better", () => {
    const { good } = splitReference(ref, "truth_kl_ibi", 0.1);
    for (const w of good) expect(w.truth_kl_ibi).toBeLessThanOrEqual(0.1);
  });
});
