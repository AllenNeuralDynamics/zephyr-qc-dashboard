import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applicationSource, metadataSource } from "./sources";
import { fakeFetch } from "./fixtures/fake-fetch";

const records = JSON.parse(readFileSync(new URL("./fixtures/docdb-records.json", import.meta.url), "utf8"));
const APP = "vr-foraging/zephyr-manuscript-runs/application/";

describe("applicationSource", () => {
  it("lists folders and takes metadata from the raw session's DocDB record", async () => {
    const f = fakeFetch((url) => {
      if (url.includes("list-type=2"))
        return `<ListBucketResult><IsTruncated>false</IsTruncated>
<CommonPrefixes><Prefix>${APP}804430_2025-11-10_23-35-39_FaceCamera/</Prefix></CommonPrefixes>
<CommonPrefixes><Prefix>${APP}999999_2025-01-01_00-00-00_SideCamera/</Prefix></CommonPrefixes></ListBucketResult>`;
      if (url.startsWith("https://api.allenneuraldynamics.org")) {
        const filter = JSON.parse(new URL(url).searchParams.get("filter")!);
        expect(filter).toEqual({ name: { $in: ["804430_2025-11-10_23-35-39", "999999_2025-01-01_00-00-00"] } });
        return JSON.stringify([records[2]]);
      }
      throw new Error(url);
    });
    const refs = await applicationSource.list(f);
    expect(refs[0]).toMatchObject({
      id: "804430_2025-11-10_23-35-39_FaceCamera/video",
      base: `https://aind-scratch-data.s3.us-west-2.amazonaws.com/${APP}804430_2025-11-10_23-35-39_FaceCamera/`,
      stem: "video",
      camera: "FaceCamera",
      subject: "804430",
      rig: "13A",
      experimenters: ["jason.lee"],
      rawSession: "804430_2025-11-10_23-35-39",
      date: "2025-11-10T23:35:39Z",
      sha: null,
    });
    // a folder without a DocDB record still lists, with unknown metadata
    expect(refs[1]).toMatchObject({ camera: "SideCamera", subject: null, rig: null, rawSession: "999999_2025-01-01_00-00-00" });
  });
});

describe("metadataSource", () => {
  it("makes one session per Zephyr process of each asset", async () => {
    const f = fakeFetch((url) => {
      if (url.startsWith("https://api.allenneuraldynamics.org")) {
        expect(JSON.parse(new URL(url).searchParams.get("filter")!)).toEqual({
          "processing.data_processes.name": "Zephyr breathing prediction",
        });
        return JSON.stringify([records[0]]);
      }
      if (url.includes("list-type=2"))
        return `<ListBucketResult><IsTruncated>false</IsTruncated>
<Contents><Key>788731_2025-12-09_19-10-07_processed_2025-12-20_19-45-53/FaceCamera_b.clip.toml</Key><ETag>"x"</ETag><Size>1</Size></Contents></ListBucketResult>`;
      throw new Error(url);
    });
    const refs = await metadataSource.list(f);
    expect(refs.map((r) => [r.stem, r.failed])).toEqual([
      ["FaceCamera_a", false],
      ["FaceCamera_b", true],
    ]);
    expect(refs[0]).toMatchObject({
      id: "788731_2025-12-09_19-10-07_processed_2025-12-20_19-45-53/FaceCamera_a",
      base: "https://aind-open-data.s3.us-west-2.amazonaws.com/788731_2025-12-09_19-10-07_processed_2025-12-20_19-45-53/",
      camera: "Face",
      sha: "4e03b281768e0f0f42adde829e0d74db803547831e48bb73f62be2016c9e256c",
      rig: "13A",
      rawSession: "788731_2025-12-09_19-10-07",
    });
  });
});
