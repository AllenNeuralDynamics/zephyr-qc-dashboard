import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assetMeta, parseDate, queryDocDb, zephyrProcesses } from "./docdb";
import { fakeFetch } from "./fixtures/fake-fetch";

const [r0, r1, r2] = JSON.parse(readFileSync(new URL("./fixtures/docdb-records.json", import.meta.url), "utf8"));

describe("parseDate", () => {
  it("reads both DocDB formats to the same instant", () => {
    expect(parseDate("2025-12-09 19:10:07.997150+00:00")).toBe("2025-12-09T19:10:07Z");
    expect(parseDate("2025-12-09T19:10:07.997150Z")).toBe("2025-12-09T19:10:07Z");
  });
  it("converts offsets to UTC", () => expect(parseDate("2025-12-09T12:10:07-07:00")).toBe("2025-12-09T19:10:07Z"));
  it("is null for missing or garbage", () => {
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate("not a date")).toBeNull();
  });
});

describe("assetMeta", () => {
  it("reads a full derived record", () =>
    expect(assetMeta(r0)).toEqual({
      asset: "788731_2025-12-09_19-10-07_processed_2025-12-20_19-45-53",
      location: "s3://aind-open-data/788731_2025-12-09_19-10-07_processed_2025-12-20_19-45-53",
      subject: "788731",
      rig: "13A",
      experimenters: ["jason.lee"],
      date: "2025-12-09T19:10:07Z",
      rawSession: "788731_2025-12-09_19-10-07",
    }));
  it("falls back when optional fields are missing", () => {
    const m = assetMeta(r1);
    expect(m.subject).toBe("804430");
    expect(m.rig).toBe("13B");
    expect(m.experimenters).toEqual([]);
    expect(m.rawSession).toBeNull();
    expect(m.date).toBe("2025-11-10T23:35:39Z");
  });
  it("prefers acquisition.instrument_id", () => expect(assetMeta(r2).rig).toBe("13A"));
});

describe("zephyrProcesses", () => {
  it("returns one entry per Zephyr video, flagging failures", () => {
    const p = zephyrProcesses(r0);
    expect(p).toEqual([
      { camera: "Face", sha: "4e03b281768e0f0f42adde829e0d74db803547831e48bb73f62be2016c9e256c", qcJson: "FaceCamera_a.qc.json", failed: false },
      { camera: "Face", sha: "4e03b281768e0f0f42adde829e0d74db803547831e48bb73f62be2016c9e256c", qcJson: null, failed: true },
    ]);
  });
  it("is empty for a record without processing", () => expect(zephyrProcesses(r1)).toEqual([]));
});

describe("queryDocDb", () => {
  it("halves the page on 413 and pages until a short page", async () => {
    const f = fakeFetch((url) => {
      const q = new URL(url).searchParams;
      const limit = Number(q.get("limit"));
      const skip = Number(q.get("skip"));
      if (limit > 250) return { status: 413, body: "" };
      const n = skip === 0 ? 250 : 10;
      return JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: `a${skip + i}` })));
    });
    const out = await queryDocDb({ x: 1 }, f);
    expect(out.length).toBe(260);
    expect(f.calls.length).toBe(3);
    const q = new URL(f.calls[1]).searchParams;
    expect(JSON.parse(q.get("filter")!)).toEqual({ x: 1 });
    expect(JSON.parse(q.get("projection")!).location).toBe(1);
    expect(q.get("sort")).toBe('{"_id":1}');
  });
});
