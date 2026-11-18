// Fetch and parse a qc-reference.json (1–6 MB) off the main thread; typed-array columns are
// structured-cloned back to the page.
import { parseReference } from "./qc";

self.onmessage = async (e: MessageEvent<string>) => {
  try {
    const r = await fetch(e.data);
    if (!r.ok) throw new Error(`${r.status} ${e.data}`);
    self.postMessage({ ok: true, ref: parseReference(await r.json()) });
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
