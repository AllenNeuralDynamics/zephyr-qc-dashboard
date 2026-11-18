import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, facetValues, filterRows, searchRows, sortRows } from "./filter";
import type { IndexRow } from "./index-types";

const row = (id: string, over: Partial<IndexRow> = {}): IndexRow => ({
  id, b: "", st: "video", raw: `${id}-raw`, s: "A", r: "13A", e: ["x.y"], t: "2025-12-09T19:10:07Z",
  c: "Face", n: null, d: 1, w: 1, m: {}, png: false, ...over,
});

const rows = [
  row("1", { s: "A", r: "13A", e: ["ann"], t: "2025-12-01T10:00:00Z", m: { peak_prob: [0.9, 10] } }),
  row("2", { s: "B", r: "13A", e: ["bob", "ann"], t: "2025-12-02T23:59:00Z", m: { peak_prob: [0.8, 50] } }),
  row("3", { s: "A", r: "13B", e: [], t: "2025-12-03T00:00:00Z", m: { peak_prob: [null, null] } }),
  row("4", { s: null, r: null, e: ["bob"], t: null, m: {} }),
];
const ids = (rs: IndexRow[]) => rs.map((r) => r.id);

describe("filterRows", () => {
  it("passes everything with no filters", () => expect(filterRows(rows, EMPTY_FILTERS).length).toBe(4));
  it("intersects animal and rig", () =>
    expect(ids(filterRows(rows, { ...EMPTY_FILTERS, subject: ["A"], rig: ["13A"] }))).toEqual(["1"]));
  it("matches any experimenter of a session", () =>
    expect(ids(filterRows(rows, { ...EMPTY_FILTERS, experimenter: ["ann"] }))).toEqual(["1", "2"]));
  it("treats dates as inclusive days and drops undated sessions", () =>
    expect(ids(filterRows(rows, { ...EMPTY_FILTERS, from: "2025-12-02", to: "2025-12-02" }))).toEqual(["2"]));
});

describe("sortRows", () => {
  it("puts missing values last ascending", () =>
    expect(ids(sortRows(rows, "peak_prob", "pct", "asc"))).toEqual(["1", "2", "3", "4"]));
  it("puts missing values last descending", () =>
    expect(ids(sortRows(rows, "peak_prob", "pct", "desc"))).toEqual(["2", "1", "3", "4"]));
  it("orders sessions without a percentile by value, after those with one", () => {
    const noRef = [
      row("a", { m: { peak_prob: [0.7, null] } }),
      row("b", { m: { peak_prob: [0.5, 20] } }),
      row("c", { m: { peak_prob: [0.9, null] } }),
      row("d", { m: {} }),
    ];
    expect(ids(sortRows(noRef, "peak_prob", "pct", "asc"))).toEqual(["b", "a", "c", "d"]);
    expect(ids(sortRows(noRef, "peak_prob", "pct", "desc"))).toEqual(["b", "c", "a", "d"]);
  });
  it("sorts by date", () => expect(ids(sortRows(rows, "date", "value", "desc"))).toEqual(["3", "2", "1", "4"]));
  it("does not mutate its input", () => {
    const copy = [...rows];
    sortRows(rows, "date", "value", "asc");
    expect(rows).toEqual(copy);
  });
});

describe("facetValues", () => {
  it("lists unique sorted values, skipping missing", () =>
    expect(facetValues(rows)).toEqual({ subject: ["A", "B"], rig: ["13A", "13B"], experimenter: ["ann", "bob"] }));
});

describe("searchRows", () => {
  it("matches id, raw session and animal, case-insensitively", () => {
    expect(ids(searchRows(rows, "2-RAW"))).toEqual(["2"]);
    expect(ids(searchRows(rows, "b")).includes("2")).toBe(true);
  });
  it("caps the number of results", () => expect(searchRows(rows, "", 2).length).toBe(2));
});
