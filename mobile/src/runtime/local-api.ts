import { afterRender } from "./hooks";

/**
 * The app's API, served in-process. Requests the UI makes to `/api/...` are dispatched to the
 * very same Next.js route handlers the web app uses (they take a standard Request and return a
 * standard Response), so validation, hard constraints and error handling are identical.
 */

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

const modules = import.meta.glob<RouteModule>("../../../src/app/api/**/route.ts");

const routes = Object.entries(modules)
  .map(([file, load]) => {
    const segments = file.replace(/^.*\/src\/app/, "").replace(/\/route\.ts$/, "").split("/").filter(Boolean);
    const keys: string[] = [];
    const parts = segments.map((s) => {
      const m = /^\[(\w+)\]$/.exec(s);
      if (m) {
        keys.push(m[1]);
        return "([^/]+)";
      }
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    const score = segments.reduce((n, s) => n * 2 + (s.startsWith("[") ? 0 : 1), 1);
    return { pattern: new RegExp(`^/${parts.join("/")}/?$`), keys, score, load };
  })
  .sort((a, b) => b.score - a.score);

export async function localFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, location.origin);
  const method = (init.method ?? "GET").toUpperCase() as keyof RouteModule;
  for (const route of routes) {
    const m = route.pattern.exec(url.pathname);
    if (!m) continue;
    const mod = await route.load();
    const handler = mod[method];
    if (!handler) return Response.json({ error: `${method} isn't supported here.` }, { status: 405 });
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const headers = new Headers(init.headers);
    // same-origin by construction; mirror what the web app's proxy checks
    headers.set("origin", location.origin);
    try {
      return await handler(new Request(url, { ...init, headers }), { params: Promise.resolve(params) });
    } finally {
      afterRender();
    }
  }
  return Response.json({ error: "Not found." }, { status: 404 });
}
