// Fetch and decode a sniffing.parquet (10–20 MB, 250 Hz voltage + Harp timestamp) off the main
// thread; the two columns come back as transferred Float64Arrays.
import { parquetRead } from "hyparquet";

self.onmessage = async (e: MessageEvent<string>) => {
  try {
    const r = await fetch(e.data);
    if (!r.ok) throw new Error(`${r.status} ${e.data}`);
    const parts: Record<string, ArrayLike<number>[]> = { timestamp: [], voltage: [] };
    await parquetRead({
      file: await r.arrayBuffer(),
      columns: ["timestamp", "voltage"],
      onChunk: (c) => parts[c.columnName]?.push(c.columnData as ArrayLike<number>),
    });
    const join = (xs: ArrayLike<number>[]) => {
      const out = new Float64Array(xs.reduce((n, x) => n + x.length, 0));
      let o = 0;
      for (const x of xs) {
        out.set(x, o);
        o += x.length;
      }
      return out;
    };
    const time = join(parts.timestamp);
    const value = join(parts.voltage);
    (self as unknown as Worker).postMessage({ ok: true, time, value }, [time.buffer, value.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
