import { describe, expect, it } from "vitest";
import { formatDate, formatPct, formatValue } from "./format";

describe("formatPct", () => {
  it("shows a dash for a missing percentile", () => expect(formatPct(null)).toBe("—"));
  it("rounds to a whole percent", () => expect(formatPct(7.06)).toBe("7"));
});

describe("formatValue", () => {
  it("shows a dash for NaN", () => expect(formatValue(NaN)).toBe("—"));
  it("shows a dash for null", () => expect(formatValue(null)).toBe("—"));
  it("keeps three significant digits", () => expect(formatValue(0.92896)).toBe("0.929"));
});

describe("formatDate", () => {
  it("reads DocDB's space-separated format", () =>
    expect(formatDate("2025-12-09 19:10:07.997150+00:00")).toBe("2025-12-09"));
  it("reads ISO with Z", () => expect(formatDate("2025-12-09T19:10:07.997150Z")).toBe("2025-12-09"));
  it("shows a dash for null", () => expect(formatDate(null)).toBe("—"));
});
