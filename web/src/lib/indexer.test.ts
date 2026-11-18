import { describe, expect, it } from "vitest";
import { buildIndex, type IndexDeps } from "./indexer";
import type { Index, SessionRef } from "./index-types";
import type { Network } from "./networks";
import { parseQcReport, parseReference, type QcReport } from "./qc";
import { qcFixture, referenceFixture } from "./fixtures/load";

const SHA = "4e03b281768e0f0f42adde829e0d74db803547831e48bb73f62be2016c9e256c";
const UNKNOWN = "f".repeat(64);
const qc = parseQcReport(qcFixture());
const qcNoPct = { ...qc, windows: qc.windows.map((w) => ({ ...w, percentiles: undefined })) };
const ref = parseReference(referenceFixture());
const network: Network = { sha: SHA, prefix: "p/all-cameras/cv_0/seed-17/", label: "all-cameras/cv_0/seed-17", referenceUrl: "https://ref/a" };

const session = (id: string, over: Partial<SessionRef> = {}): SessionRef => ({
  id,
  base: `https://b/${id}/`,
  stem: "video",
  asset: id,
  location: `s3://b/${id}`,
  subject: "788731",
  rig: "13A",
  experimenters: ["jason.lee"],
  date: `2025-12-0${id.length % 9}T19:10:07Z`,
  rawSession: "788731_2025-12-09_19-10-07",
  camera: "FaceCamera",
  sha: null,
  failed: false,
  ...over,
});

function deps(over: Partial<IndexDeps> = {}) {
  const calls = { qc: [] as string[], ref: [] as string[] };
  const d: IndexDeps = {
    networks: { [SHA]: network },
    loadQc: async (url) => {
      calls.qc.push(url);
      return qcNoPct;
    },
    loadRef: async (url) => {
      calls.ref.push(url);
      return ref;
    },
    exists: async () => false,
    ...over,
  };
  return { d, calls };
}

const opts = { full: false, source: "test" };

describe("buildIndex", () => {
  it("indexes sessions with medians and percentiles from the matched reference", async () => {
    const { d, calls } = deps();
    const idx = await buildIndex([session("a"), session("bb")], null, d, opts);
    expect(idx.sessions.length).toBe(2);
    const row = idx.sessions.find((r) => r.id === "a")!;
    expect(typeof row.m.head_trace_f1?.[1]).toBe("number");
    expect(row.n).toBe(SHA);
    expect(row.w).toBe(97);
    expect(row.raw).toBe("788731_2025-12-09_19-10-07");
    expect(idx.networks[SHA]).toEqual({ label: "all-cameras/cv_0/seed-17", ref: "https://ref/a" });
    expect(calls.ref).toEqual(["https://ref/a"]); // one reference load for two sessions
    expect(calls.qc).toEqual(["https://b/a/video.qc.json", "https://b/bb/video.qc.json"]);
  });

  it("keeps values but no percentiles when the network has no reference", async () => {
    const { d } = deps({ loadQc: async () => ({ ...qcNoPct, checkpoint_sha256: UNKNOWN }) as QcReport });
    const [row] = (await buildIndex([session("a")], null, d, opts)).sessions;
    expect(row.err).toBeUndefined();
    expect(typeof row.m.head_trace_f1?.[0]).toBe("number");
    expect(row.m.head_trace_f1?.[1]).toBeNull();
    expect(row.n).toBe(UNKNOWN);
  });

  it("keeps a row with the error when the QC report cannot be read", async () => {
    const { d } = deps({ loadQc: async () => { throw new Error("404 https://b/a/video.qc.json"); } });
    const [row] = (await buildIndex([session("a", { failed: true })], null, d, opts)).sessions;
    expect(row.err).toContain("404");
    expect(row.w).toBe(0);
    expect(row.m).toEqual({});
    expect(row.s).toBe("788731");
  });

  it("reuses previous rows, retries errors, drops vanished sessions", async () => {
    const prev: Index = {
      v: 1,
      generated: "x",
      source: "test",
      networks: {},
      sessions: [
        { id: "a", b: "https://b/a/", st: "video", raw: null, s: "1", r: null, e: [], t: null, c: null, n: SHA, d: 1, w: 5, m: {}, png: false },
        { id: "bb", b: "https://b/bb/", st: "video", raw: null, s: "1", r: null, e: [], t: null, c: null, n: null, d: null, w: 0, m: {}, png: false, err: "boom" },
        { id: "gone", b: "https://b/gone/", st: "video", raw: null, s: "1", r: null, e: [], t: null, c: null, n: null, d: null, w: 0, m: {}, png: false },
      ],
    };
    const { d, calls } = deps();
    const idx = await buildIndex([session("a"), session("bb")], prev, d, opts);
    expect(calls.qc).toEqual(["https://b/bb/video.qc.json"]);
    expect(idx.sessions.map((r) => r.id).sort()).toEqual(["a", "bb"]);
    expect(idx.sessions.find((r) => r.id === "a")!.w).toBe(5); // reused as is
    expect(idx.sessions.find((r) => r.id === "bb")!.err).toBeUndefined();

    const full = deps();
    await buildIndex([session("a"), session("bb")], prev, full.d, { ...opts, full: true });
    expect(full.calls.qc.length).toBe(2);
  });

  it("prefers the metadata's checkpoint hash over the report's", async () => {
    const { d } = deps({ loadQc: async () => ({ ...qcNoPct, checkpoint_sha256: UNKNOWN }) as QcReport });
    const [row] = (await buildIndex([session("a", { sha: SHA })], null, d, opts)).sessions;
    expect(row.n).toBe(SHA);
    expect(typeof row.m.head_trace_f1?.[1]).toBe("number");
  });

  it("records whether the network-input image exists", async () => {
    const { d } = deps({ exists: async (url) => url.endsWith("video_network_input.png") });
    const [row] = (await buildIndex([session("a")], null, d, opts)).sessions;
    expect(row.png).toBe(true);
  });

  it("sorts newest first", async () => {
    const { d } = deps();
    const idx = await buildIndex(
      [session("a", { date: "2025-01-01T00:00:00Z" }), session("bb", { date: "2026-01-01T00:00:00Z" })],
      null,
      d,
      opts,
    );
    expect(idx.sessions.map((r) => r.id)).toEqual(["bb", "a"]);
  });
});
