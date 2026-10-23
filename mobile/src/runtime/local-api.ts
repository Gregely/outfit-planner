import { afterRender, persistNow } from "./hooks";

/**
 * The app's API, served in-process. Requests the UI makes to `/api/...` are dispatched to the
 * very same Next.js route handlers the web app uses (they take a standard Request and return a
 * standard Response), so validation, hard constraints and error handling are identical.
 */

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

const modules = import.meta.glob<RouteModule>("../../../src/app/api/**/route.ts", { eager: true });

const routes = Object.entries(modules)
  .map(([file, module]) => {
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
    return { pattern: new RegExp(`^/${parts.join("/")}/?$`), keys, score, module };
  })
  .sort((a, b) => b.score - a.score);

export async function localFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, location.origin);
  const method = (init.method ?? "GET").toUpperCase() as keyof RouteModule;
  for (const route of routes) {
    const m = route.pattern.exec(url.pathname);
    if (!m) continue;
    const mod = route.module;
    const handler = mod[method];
    if (!handler) return Response.json({ error: `${method} isn't supported here.` }, { status: 405 });
    const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const headers = new Headers(init.headers);
    // same-origin by construction; mirror what the web app's proxy checks
    headers.set("origin", location.origin);
    const res = await handler(new Request(url, { ...init, headers }), { params: Promise.resolve(params) });
    // Write-through: a change is on disk before the UI reports it as done, so closing or
    // killing the app straight afterwards never loses it. Reads only schedule a save (some
    // cache weather forecasts).
    if (method !== "GET") await persistNow();
    else afterRender();
    return res;
  }
  return Response.json({ error: "Not found." }, { status: 404 });
}
