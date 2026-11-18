import { describe, expect, it } from "vitest";
import { latestProcessed, loadSniff, processedAsset, processedStamp, resample, sniffUrl } from "./behavior";
import { fakeFetch } from "./fixtures/fake-fetch";

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

describe("processedAsset", () => {
  it("asks DocDB for the session's vr-foraging packaging outputs and takes the latest", async () => {
    const f = fakeFetch(() =>
      JSON.stringify([
        { name: "788731_2025-12-09_19-10-07_processed_2025-12-20_19-38-54", location: "s3://aind-open-data/old" },
        { name: "788731_2025-12-09_19-10-07_processed_2026-09-23_00-25-50", location: "s3://aind-open-data/new" },
      ]),
    );
    expect((await processedAsset("788731_2025-12-09_19-10-07", f))?.location).toBe("s3://aind-open-data/new");
    const filter = JSON.parse(new URL(f.calls[0]).searchParams.get("filter")!);
    expect(filter).toEqual({
      "data_description.source_data": "788731_2025-12-09_19-10-07",
      "processing.data_processes.name": "primary-nwb-packaging-vr-foraging",
    });
  });
});

describe("sniffUrl", () => {
  it("points at sniffing.parquet over https", () =>
    expect(sniffUrl("s3://aind-open-data/x_processed_2026-09-23_00-25-50")).toBe(
      "https://aind-open-data.s3.us-west-2.amazonaws.com/x_processed_2026-09-23_00-25-50/sniffing.parquet",
    ));
});

describe("loadSniff", () => {
  const PROC = "s3://aind-open-data/r_processed_2026-09-23_00-25-50";
  const deps = (opts: { processed?: boolean; sniff?: boolean } = {}) => {
    const f = fakeFetch((url) => {
      if (url.startsWith("https://api.allenneuraldynamics.org"))
        return JSON.stringify(opts.processed === false ? [] : [{ name: "r_processed_2026-09-23_00-25-50", location: PROC }]);
      if (url.endsWith("sniffing.parquet")) return opts.sniff === false ? { status: 404, body: "" } : "";
      return { status: 404, body: "" };
    });
    // the sensor on its own clock (starts at 5000 s): a ramp, so a value tells the time it was read at
    const readSniff = async () => ({ time: Float64Array.from([5000, 5010]), value: Float64Array.from([0, 1000]) });
    return { f, readSniff };
  };
  // the prediction's time starts at 0 (video time)
  const pred = { time: Float64Array.from([0, 0.5, 1, 20]) };

  it("aligns both at their first sample and resamples onto the prediction's times", async () => {
    const { f, readSniff } = deps();
    const s = await loadSniff("r", pred, { fetch: f, readSniff });
    expect(s.state).toBe("ready");
    if (s.state !== "ready") return;
    expect(s.asset).toBe("r_processed_2026-09-23_00-25-50");
    expect(s.values[0]).toBeCloseTo(0);
    expect(s.values[1]).toBeCloseTo(50);
    expect(s.values[2]).toBeCloseTo(100);
    expect(s.values[3]).toBeNaN(); // past the sensor's end
  });

  it("never reads the camera's metadata.csv", async () => {
    const { f, readSniff } = deps();
    await loadSniff("r", pred, { fetch: f, readSniff });
    expect(f.calls.some((u) => u.includes("metadata.csv"))).toBe(false);
  });

  it("says when there is no processed asset", async () => {
    const { f, readSniff } = deps({ processed: false });
    expect((await loadSniff("r", pred, { fetch: f, readSniff })).state).toBe("no-asset");
  });

  it("says when the processed asset has no sniff sensor", async () => {
    const { f, readSniff } = deps({ sniff: false });
    expect(await loadSniff("r", pred, { fetch: f, readSniff })).toEqual({ state: "no-sensor", asset: "r_processed_2026-09-23_00-25-50" });
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
