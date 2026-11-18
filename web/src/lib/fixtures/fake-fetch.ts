// Test-only: a fetch stand-in answering by URL, recording calls and request headers.
type Answer = string | { status: number; body: string };

export interface FakeFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  calls: string[];
  headers: Record<string, string>[];
}

export function fakeFetch(answer: (url: string) => Answer): FakeFetch {
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    f.calls.push(url);
    f.headers.push(Object.fromEntries(new Headers(init?.headers).entries()) as Record<string, string>);
    const a = answer(url);
    const { status, body } = typeof a === "string" ? { status: 200, body: a } : a;
    return new Response(body, { status });
  }) as FakeFetch;
  f.calls = [];
  f.headers = [];
  return f;
}
