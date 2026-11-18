import { describe, expect, it } from "vitest";
import { atypicality, shadeMix } from "./shade";

describe("atypicality", () => {
  it("is 0 on the typical side or at the median", () => {
    expect(atypicality(50, "higher")).toBe(0);
    expect(atypicality(80, "higher")).toBe(0);
    expect(atypicality(20, "lower")).toBe(0);
  });
  it("grows toward the worse tail", () => {
    expect(atypicality(0, "higher")).toBe(1);
    expect(atypicality(100, "lower")).toBe(1);
    expect(atypicality(25, "higher")).toBeCloseTo(0.5);
  });
  it("is 0 for descriptions and missing percentiles", () => {
    expect(atypicality(1, null)).toBe(0);
    expect(atypicality(null, "higher")).toBe(0);
  });
});

describe("shadeMix", () => {
  it("leaves typical cells unshaded", () => expect(shadeMix(0)).toBe(0));
  it("caps the tint so text stays readable", () => expect(shadeMix(1)).toBe(45));
  it("is monotone", () => expect(shadeMix(0.5)).toBeLessThan(shadeMix(0.8)));
});
