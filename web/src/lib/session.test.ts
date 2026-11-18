import { describe, expect, it } from "vitest";
import { parquetWriteBuffer } from "hyparquet-writer";
import { parsePrediction } from "./session";

describe("parsePrediction", () => {
  it("reads Zephyr's prediction columns and the inhale times", async () => {
    const time = Float64Array.from({ length: 10 }, (_, i) => 100 + i / 60);
    const buf = parquetWriteBuffer({
      columnData: [
        { name: "time", data: time, type: "DOUBLE" },
        { name: "frame", data: Array.from({ length: 10 }, (_, i) => BigInt(i)), type: "INT64" },
        { name: "signal", data: Float32Array.from({ length: 10 }, (_, i) => i * 0.5), type: "FLOAT" },
        { name: "onset", data: Float32Array.from({ length: 10 }, (_, i) => i / 10), type: "FLOAT" },
        { name: "inhale", data: Array.from({ length: 10 }, (_, i) => i === 2 || i === 7), type: "BOOLEAN" },
      ],
    });
    const p = await parsePrediction(buf);
    expect(p.time.length).toBe(10);
    expect(p.time[3]).toBeCloseTo(100.05);
    expect(p.signal[4]).toBeCloseTo(2);
    expect(p.onset[9]).toBeCloseTo(0.9);
    expect(Array.from(p.inhaleTimes)).toEqual([time[2], time[7]]);
  });
});
