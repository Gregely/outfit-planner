import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "./device";
import { isOnline as online } from "./network";

/**
 * On Android, provider requests go through Capacitor's native HTTP stack instead of the
 * WebView's fetch: no CORS restrictions (so any OpenAI-compatible server works, including one
 * on your local network) and normal Android TLS validation. Responses are buffered, which the
 * SDKs handle the same way as a streamed body.
 */
async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  let data: unknown;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    const isJson = /application\/json/i.test(headers["content-type"] ?? "");
    data = text && isJson ? JSON.parse(text) : text || undefined;
  }
  let res;
  try {
    res = await CapacitorHttp.request({
      url: req.url,
      method: req.method,
      headers,
      data,
      responseType: "text",
      connectTimeout: 30_000,
      readTimeout: 10 * 60_000,
    });
  } catch (err) {
    // Surface as a fetch-style network error so the SDKs report "couldn't be reached".
    throw new TypeError(`fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
  const outHeaders = new Headers();
  for (const [k, v] of Object.entries(res.headers ?? {})) outHeaders.set(k, String(v));
  return new Response(res.status === 204 || res.status === 304 ? null : body, { status: res.status, headers: outHeaders });
}

export function providerFetch(): typeof fetch {
  return isNative ? (nativeFetch as typeof fetch) : globalThis.fetch.bind(globalThis);
}

export function isOnline(): boolean {
  return online();
}
