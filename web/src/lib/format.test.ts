import { describe, expect, it } from "vitest";
import { formatCount, formatDate, formatLocalTime, formatPct, formatValue } from "./format";

describe("formatPct", () => {
  it("shows a dash for a missing percentile", () => expect(formatPct(null)).toBe("—"));
  it("rounds to a whole percent", () => expect(formatPct(7.06)).toBe("7"));
});

describe("formatValue", () => {
  it("shows a dash for NaN", () => expect(formatValue(NaN)).toBe("—"));
  it("shows a dash for null", () => expect(formatValue(null)).toBe("—"));
  it("keeps three significant digits", () => expect(formatValue(0.92896)).toBe("0.929"));
});

describe("formatCount", () => {
  it("groups thousands", () => expect(formatCount(257350)).toBe("257,350"));
  it("shows a dash for a missing count", () => expect(formatCount(undefined)).toBe("—"));
});

describe("formatLocalTime", () => {
  it("shows the time in the viewer's zone with its abbreviation", () =>
    expect(formatLocalTime("2025-12-09T19:10:07Z", "America/Los_Angeles")).toBe("11:10 PST"));
  it("adds the local date when it differs from the UTC date", () =>
    expect(formatLocalTime("2025-12-10T03:30:00Z", "America/Los_Angeles")).toBe("19:30 PST, Dec 9"));
  it("shows a dash for a missing time", () => expect(formatLocalTime(null, "UTC")).toBe("—"));
});

describe("formatDate", () => {
  it("reads DocDB's space-separated format", () =>
    expect(formatDate("2025-12-09 19:10:07.997150+00:00")).toBe("2025-12-09"));
  it("reads ISO with Z", () => expect(formatDate("2025-12-09T19:10:07.997150Z")).toBe("2025-12-09"));
  it("shows a dash for null", () => expect(formatDate(null)).toBe("—"));
});
