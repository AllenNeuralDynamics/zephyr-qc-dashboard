import { describe, expect, it } from "vitest";
import { buildNetworkMap, NETWORKS_PREFIX } from "./networks";
import { fakeFetch } from "./fixtures/fake-fetch";

const SHA = "c65bc2b0a0abb10ae9e2f6b089af79f0b18f8283a6a1ac8228639aaba8488427";
const listing = `<ListBucketResult><IsTruncated>false</IsTruncated>
<Contents><Key>${NETWORKS_PREFIX}face/cv_0/seed-17/qc-reference.json</Key><ETag>"a"</ETag><Size>1</Size></Contents>
<Contents><Key>${NETWORKS_PREFIX}face/cv_0/seed-17/best.pt</Key><ETag>"b"</ETag><Size>1</Size></Contents>
<Contents><Key>${NETWORKS_PREFIX}broken/cv_0/seed-17/qc-reference.json</Key><ETag>"c"</ETag><Size>1</Size></Contents>
</ListBucketResult>`;

describe("buildNetworkMap", () => {
  it("maps each reference's checkpoint hash to its network", async () => {
    const f = fakeFetch((url) => {
      if (url.includes("list-type=2")) return listing;
      if (url.includes("/face/")) return `{\n "checkpoint": "/results/face/cv_0/seed-17/best.pt",\n "checkpoint_sha256": "${SHA}",\n "epoch": 59`;
      return `{\n "checkpoint": "x", "epoch": 1`;
    });
    const map = await buildNetworkMap(f);
    expect(Object.keys(map)).toEqual([SHA]);
    expect(map[SHA].label).toBe("face/cv_0/seed-17");
    expect(map[SHA].referenceUrl).toBe(
      `https://aind-scratch-data.s3.us-west-2.amazonaws.com/${NETWORKS_PREFIX}face/cv_0/seed-17/qc-reference.json`,
    );
    expect(f.calls.filter((u) => u.endsWith("qc-reference.json")).length).toBe(2); // best.pt never fetched
  });
});
