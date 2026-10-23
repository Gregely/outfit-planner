/** Minimal stand-ins for the parts of `next/server` the route handlers and pages use. */

/** Next uses this to opt out of prerendering; in the app every render is already at request time. */
export async function connection(): Promise<void> {}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new Response(JSON.stringify(body), { ...init, headers });
  }
  /** Same marker header Next.js uses for "continue to the route". */
  static next() {
    return new Response(null, { status: 200, headers: { "x-middleware-next": "1" } });
  }
}

export type NextRequest = Request;
export const NextRequest = Request;
