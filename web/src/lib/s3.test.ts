import { describe, expect, it } from "vitest";
import { fetchJson, fetchRange, httpsUrl, listPrefix } from "./s3";
import { fakeFetch } from "./fixtures/fake-fetch";

describe("httpsUrl", () => {
  it("turns an s3 URI into a public us-west-2 URL", () =>
    expect(httpsUrl("s3://aind-open-data/a_b/c.json")).toBe(
      "https://aind-open-data.s3.us-west-2.amazonaws.com/a_b/c.json",
    ));
  it("passes https URLs through", () => expect(httpsUrl("https://x/y")).toBe("https://x/y"));
});

const page1 = `<?xml version="1.0"?><ListBucketResult><IsTruncated>true</IsTruncated>
<Contents><Key>p/a&amp;b.json</Key><ETag>&quot;e1&quot;</ETag><Size>10</Size></Contents>
<CommonPrefixes><Prefix>p/sub1/</Prefix></CommonPrefixes>
<NextContinuationToken>t1</NextContinuationToken></ListBucketResult>`;
const page2 = `<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>
<Contents><Key>p/c.json</Key><ETag>"e2"</ETag><Size>20</Size></Contents>
<CommonPrefixes><Prefix>p/sub2/</Prefix></CommonPrefixes></ListBucketResult>`;

describe("listPrefix", () => {
  it("follows continuation tokens and decodes XML entities", async () => {
    const f = fakeFetch((url) => (url.includes("continuation-token=t1") ? page2 : page1));
    const out = await listPrefix("bkt", "p/", { delimiter: "/" }, f);
    expect(out.keys).toEqual([
      { key: "p/a&b.json", etag: "e1", size: 10 },
      { key: "p/c.json", etag: "e2", size: 20 },
    ]);
    expect(out.prefixes).toEqual(["p/sub1/", "p/sub2/"]);
    expect(f.calls[0]).toContain("https://bkt.s3.us-west-2.amazonaws.com/?list-type=2&prefix=p%2F&delimiter=%2F");
  });
});

describe("fetchRange / fetchJson", () => {
  it("asks for the byte range", async () => {
    const f = fakeFetch(() => "abc");
    expect(await fetchRange("https://x/y", 0, 1023, f)).toBe("abc");
    expect(f.headers[0]?.range).toBe("bytes=0-1023"); // Headers lower-cases names
  });
  it("throws with status and URL when not OK", async () => {
    const f = fakeFetch(() => ({ status: 404, body: "" }));
    await expect(fetchJson("https://x/missing", f)).rejects.toThrow("404 https://x/missing");
  });
});
