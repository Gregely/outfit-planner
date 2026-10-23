import "server-only";

/**
 * The fetch implementation provider SDKs use. On the web server that's Node's own fetch; the
 * Android app swaps this module for one that can use the native HTTP stack (no CORS, and
 * local-network servers such as Ollama work).
 */
export function providerFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis);
}

/** False only when the platform knows it is offline (the server can't tell, so it says true). */
export function isOnline(): boolean {
  return true;
}
