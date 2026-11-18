// Minimal hash router (#/path?query), adapted from aind-curriculum-visualizer.
// Routes: #/ (sessions), #/session/<asset>/<stem>. Filters and view settings live in the query
// so every view is shareable by link.

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [p, q = ""] = raw.split("?");
  return { path: p.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export const route = $state<{ current: Route }>({ current: parse() });

window.addEventListener("hashchange", () => {
  route.current = parse();
});
window.addEventListener("popstate", () => {
  route.current = parse();
});

function build(path: string[], query: URLSearchParams): string {
  const q = query.toString();
  return "#/" + path.map(encodeURIComponent).join("/") + (q ? `?${q}` : "");
}

/** Link to `path`, keeping the current query (filters) and applying `updates` ("" or null removes a key). */
export function href(path: string[], updates: Record<string, string | null> = {}): string {
  const q = new URLSearchParams(route.current.query);
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  return build(path, q);
}

export function navigate(path: string[], updates: Record<string, string | null> = {}) {
  history.pushState(null, "", href(path, updates));
  route.current = parse();
}

/** Change query keys in place (no new history entry). */
export function replaceQuery(updates: Record<string, string | null>) {
  const h = href(route.current.path, updates);
  if (h === build(route.current.path, route.current.query)) return;
  history.replaceState(null, "", h);
  route.current = parse();
}

/** Session route id is `<asset>/<stem>`. */
export const sessionPath = (id: string): string[] => ["session", ...id.split("/")];
export const sessionIdFromPath = (path: string[]): string | null =>
  path[0] === "session" && path.length >= 3 ? path.slice(1).join("/") : null;
