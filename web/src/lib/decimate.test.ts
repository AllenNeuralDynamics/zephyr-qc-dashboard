import { describe, expect, it } from "vitest";
import { decimate, visibleRange } from "./decimate";

describe("decimate", () => {
  const n = 432_000; // 2 h at 60 Hz
  const x = Float64Array.from({ length: n }, (_, i) => i / 60);
  const y = Float64Array.from({ length: n }, (_, i) => Math.sin(i / 7) + (i === 200_000 ? 9 : 0) - (i === 300_001 ? 9 : 0));

  it("keeps at most two points per bucket", () => {
    const out = decimate(x, y, 0, n, 1000);
    expect(out.x.length).toBeLessThanOrEqual(2000);
    expect(out.x.length).toBe(out.y.length);
  });
  it("preserves the extremes", () => {
    const out = decimate(x, y, 0, n, 1000);
    const max = (a: Float64Array) => a.reduce((m, v) => Math.max(m, v), -Infinity);
    const min = (a: Float64Array) => a.reduce((m, v) => Math.min(m, v), Infinity);
    expect(max(out.y)).toBe(max(y));
    expect(min(out.y)).toBe(min(y));
  });
  it("keeps time order", () => {
    const out = decimate(x, y, 0, n, 500);
    for (let i = 1; i < out.x.length; i++) expect(out.x[i]).toBeGreaterThanOrEqual(out.x[i - 1]);
  });
  it("returns short ranges unchanged", () => {
    const out = decimate(x, y, 100, 1100, 1000);
    expect(out.x.length).toBe(1000);
    expect(out.x[0]).toBe(x[100]);
    expect(out.y[999]).toBe(y[1099]);
  });
});

describe("visibleRange", () => {
  const x = Float64Array.from([0, 1, 2, 3, 4, 5]);
  it("finds the index range covering [min, max] with one sample of margin", () =>
    expect(visibleRange(x, 1.5, 3.5)).toEqual([1, 5]));
  it("clamps to the data", () => expect(visibleRange(x, -10, 100)).toEqual([0, 6]));
});
