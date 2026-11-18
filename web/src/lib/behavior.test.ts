import { describe, expect, it } from "vitest";
import {
  behaviorAssets,
  clockFromEdges,
  latestProcessed,
  loadSniff,
  parseClockCsv,
  parseClockEdges,
  processedStamp,
  resample,
  sniffUrl,
} from "./behavior";
import { fakeFetch } from "./fixtures/fake-fetch";

const HEADER = "ReferenceTime,CameraFrameNumber,CameraFrameTime\n";

describe("processedStamp", () => {
  it("reads the processing time from either naming form", () => {
    expect(processedStamp("878046_2026-11-17_20-59-45_processed-behavior_2026-11-18_08-58-19")).toBe("2026-11-18_08-58-19");
    expect(processedStamp("788731_2025-12-09_19-10-07_processed_2026-09-23_00-25-50")).toBe("2026-09-23_00-25-50");
  });
  it("is null for a name without one", () => expect(processedStamp("788731_2025-12-09_19-10-07")).toBeNull());
});

describe("latestProcessed", () => {
  it("picks the most recently processed asset", () => {
    const recs = [
      { name: "867422_2026-09-03_15-37-37_processed_2026-09-04_11-16-18", location: "s3://b/old" },
      { name: "867422_2026-09-03_15-37-37_processed-behavior_2026-11-18_08-58-19", location: "s3://b/new" },
      { name: "867422_2026-09-03_15-37-37_processed_2026-09-23_05-06-43", location: "s3://b/mid" },
    ];
    expect(latestProcessed(recs)?.location).toBe("s3://b/new");
  });
  it("is null when there is none", () => expect(latestProcessed([])).toBeNull());
});

describe("behaviorAssets", () => {
  it("finds the raw asset and its latest behavior-processed asset in one query", async () => {
    const f = fakeFetch(() =>
      JSON.stringify([
        { name: "788731_2025-12-09_19-10-07", location: "s3://aind-open-data/788731_2025-12-09_19-10-07" },
        { name: "788731_2025-12-09_19-10-07_processed_2025-12-20_19-38-54", location: "s3://aind-open-data/old" },
        { name: "788731_2025-12-09_19-10-07_processed_2026-09-23_00-25-50", location: "s3://aind-open-data/new" },
      ]),
    );
    const a = await behaviorAssets("788731_2025-12-09_19-10-07", f);
    expect(a.raw).toBe("s3://aind-open-data/788731_2025-12-09_19-10-07");
    expect(a.processed?.location).toBe("s3://aind-open-data/new");
    expect(f.calls.length).toBe(1);
    const filter = JSON.parse(new URL(f.calls[0]).searchParams.get("filter")!);
    expect(JSON.stringify(filter)).toContain("primary-nwb-packaging-vr-foraging");
  });
});

describe("sniffUrl", () => {
  it("points at sniffing.parquet over https", () =>
    expect(sniffUrl("s3://aind-open-data/x_processed_2026-09-23_00-25-50")).toBe(
      "https://aind-open-data.s3.us-west-2.amazonaws.com/x_processed_2026-09-23_00-25-50/sniffing.parquet",
    ));
});

describe("camera clock", () => {
  const head = HEADER + "1000.0,500,1\n1000.004,501,2\n1000.0";
  const tail = "4,509,9\n1000.04,510,10\n";
  it("reads the first and last frame from a head and a tail range", () =>
    expect(parseClockEdges(head, tail)).toEqual({ t0: 1000, f0: 500, t1: 1000.04, f1: 510 }));

  it("maps a video frame to Harp time linearly when the frame count fits", () => {
    const clock = clockFromEdges({ t0: 1000, f0: 500, t1: 1000.04, f1: 510 }, 4)!;
    expect(clock(0)).toBeCloseTo(1000);
    expect(clock(5)).toBeCloseTo(1000.02);
  });

  it("refuses the linear clock when the prediction runs past the clock", () =>
    expect(clockFromEdges({ t0: 1000, f0: 500, t1: 1000.04, f1: 510 }, 11)).toBeNull());

  it("refuses the linear clock when frames were dropped (the counter outruns the video)", () =>
    expect(clockFromEdges({ t0: 1000, f0: 0, t1: 1100, f1: 24000 }, 20000)).toBeNull());

  it("parses the full metadata.csv into per-row Harp times", () =>
    expect(Array.from(parseClockCsv(HEADER + "1.5,1,0\n2.5,2,0\n"))).toEqual([1.5, 2.5]));
});

describe("loadSniff", () => {
  const RAW = "s3://aind-open-data/r";
  const PROC = "s3://aind-open-data/r_processed_2026-09-23_00-25-50";
  const docdb = (withProcessed: boolean) =>
    JSON.stringify([
      { name: "r", location: RAW },
      ...(withProcessed ? [{ name: "r_processed_2026-09-23_00-25-50", location: PROC }] : []),
    ]);
  // the camera clock: frame i at Harp time 1000 + i/240, frames 0..20
  const csv = HEADER + Array.from({ length: 21 }, (_, i) => `${1000 + i / 240},${100 + i},0`).join("\n") + "\n";
  const deps = (opts: { processed?: boolean; sniff?: boolean; csvBody?: string } = {}) => {
    const body = opts.csvBody ?? csv;
    const f = fakeFetch((url, h) => {
      if (url.startsWith("https://api.allenneuraldynamics.org")) return docdb(opts.processed ?? true);
      if (url.endsWith("sniffing.parquet")) return opts.sniff === false ? { status: 404, body: "" } : "";
      if (url.endsWith("metadata.csv")) {
        const m = /bytes=(-?\d+)-?(\d*)/.exec(h.range ?? "");
        if (!m) return body;
        return m[1].startsWith("-") ? body.slice(body.length + Number(m[1])) : body.slice(Number(m[1]), Number(m[2]) + 1);
      }
      return { status: 404, body: "" };
    });
    // the sensor: a ramp in Harp time, so the resampled value tells the time it was read at
    const readSniff = async () => ({ time: Float64Array.from([999, 1001]), value: Float64Array.from([0, 2000]) });
    return { f, readSniff };
  };
  const pred = { frame: Float64Array.from([0, 4, 8, 12]) };

  it("puts the sensor on the prediction's samples through the camera clock", async () => {
    const { f, readSniff } = deps();
    const s = await loadSniff("r", "FaceCamera", pred, { fetch: f, readSniff });
    expect(s.state).toBe("ready");
    if (s.state !== "ready") return;
    expect(s.asset).toBe("r_processed_2026-09-23_00-25-50");
    expect(s.clock).toBe("linear");
    // value = (t - 999) * 1000, t = 1000 + frame/240
    expect(s.values[1]).toBeCloseTo((1 + 4 / 240) * 1000, 1);
    expect(f.calls.some((u) => u.endsWith("FaceCamera/metadata.csv"))).toBe(true);
  });

  it("reads the whole metadata.csv when the linear clock does not fit", async () => {
    const { f, readSniff } = deps();
    const s = await loadSniff("r", "FaceCamera", { frame: Float64Array.from([0, 4, 20]) }, { fetch: f, readSniff });
    // last frame 20 = clock span 20: fits; now one past it
    expect(s.state).toBe("ready");
    const g = deps();
    const t = await loadSniff("r", "FaceCamera", { frame: Float64Array.from([0, 4, 21]) }, { fetch: g.f, readSniff: g.readSniff });
    expect(t.state).toBe("failed");
    // 20 frames dropped after frame 109: rows 0..9 are frames 100..109, rows 10..20 frames 130..140
    const frames = [...Array.from({ length: 10 }, (_, i) => 100 + i), ...Array.from({ length: 11 }, (_, i) => 130 + i)];
    const gapped = HEADER + frames.map((n) => `${1000 + (n - 100) / 240},${n},0`).join("\n") + "\n";
    const dropped = deps({ csvBody: gapped });
    const u = await loadSniff("r", "FaceCamera", { frame: Float64Array.from([0, 4, 12]) }, { fetch: dropped.f, readSniff: dropped.readSniff });
    expect(u.state).toBe("ready");
    if (u.state === "ready") {
      expect(u.clock).toBe("full");
      // row 12 of the gapped file is camera frame 132 → t = 1000 + 32/240
      expect(u.values[2]).toBeCloseTo((1 + 32 / 240) * 1000, 1);
    }
  });

  it("says when there is no processed asset", async () => {
    const { f, readSniff } = deps({ processed: false });
    expect((await loadSniff("r", "FaceCamera", pred, { fetch: f, readSniff })).state).toBe("no-asset");
  });

  it("says when the processed asset has no sniff sensor", async () => {
    const { f, readSniff } = deps({ sniff: false });
    const s = await loadSniff("r", "FaceCamera", pred, { fetch: f, readSniff });
    expect(s).toEqual({ state: "no-sensor", asset: "r_processed_2026-09-23_00-25-50" });
  });
});

describe("resample", () => {
  it("interpolates linearly onto the target times, NaN outside the source", () => {
    const out = resample(Float64Array.from([0, 1, 2]), Float64Array.from([0, 10, 20]), Float64Array.from([-1, 0.5, 1.25, 2, 3]));
    expect(out[0]).toBeNaN();
    expect(out[1]).toBeCloseTo(5);
    expect(out[2]).toBeCloseTo(12.5);
    expect(out[3]).toBeCloseTo(20);
    expect(out[4]).toBeNaN();
  });
});
