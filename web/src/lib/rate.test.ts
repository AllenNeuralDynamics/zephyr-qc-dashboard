import { describe, expect, it } from "vitest";
import { autoRateWindow, breathingRate } from "./rate";

describe("autoRateWindow", () => {
  it("is instantaneous when zoomed in to a few breaths", () => {
    expect(autoRateWindow(5)).toBe(0);
    expect(autoRateWindow(20)).toBe(0);
  });
  it("grows with the visible span, on round steps", () => {
    expect(autoRateWindow(60)).toBe(0.5);
    expect(autoRateWindow(300)).toBe(2);
    expect(autoRateWindow(600)).toBe(5);
    expect(autoRateWindow(3000)).toBe(30);
  });
  it("caps at a minute", () => expect(autoRateWindow(1e6)).toBe(60));
});

const on = (...t: number[]) => Float64Array.from(t);

describe("breathingRate", () => {
  it("window 0: each inter-onset interval as a step starting at its first onset", () => {
    const r = breathingRate(on(0, 0.5, 0.75, 1.0), 0);
    expect(Array.from(r.t)).toEqual([0, 0.5, 0.75, 1.0]);
    // 2 Hz, 4 Hz, 4 Hz, and the last step held to the last onset
    expect(Array.from(r.hz)).toEqual([2, 4, 4, 4]);
  });

  it("breaks the line over a pause longer than maxGap (no breaths detected)", () => {
    const r = breathingRate(on(0, 0.5, 5, 5.5), 0, 2);
    expect(r.hz[1]).toBeNaN();
    expect(r.hz[2]).toBe(2);
  });

  it("window > 0: rolling mean of the rates whose interval midpoint is within ±window/2", () => {
    // intervals: [0,0.5] 2 Hz mid 0.25, [0.5,0.75] 4 Hz mid 0.625, [0.75,1] 4 Hz mid 0.875, [1,2] 1 Hz mid 1.5
    const r = breathingRate(on(0, 0.5, 0.75, 1, 2), 1);
    expect(Array.from(r.t)).toEqual([0.25, 0.625, 0.875, 1.5]);
    // at 0.25: mids in [-0.25, 0.75] → 2, 4 → 3
    expect(r.hz[0]).toBeCloseTo(3);
    // at 0.875: mids in [0.375, 1.375] → 4, 4 → 4
    expect(r.hz[2]).toBeCloseTo(4);
    // at 1.5: mids in [1, 2] → 1
    expect(r.hz[3]).toBeCloseTo(1);
  });

  it("is empty for fewer than two onsets", () => {
    expect(breathingRate(on(1), 0).t.length).toBe(0);
    expect(breathingRate(on(), 3).t.length).toBe(0);
  });
});
