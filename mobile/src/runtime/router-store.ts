/**
 * Location state for the in-app router. The shims for `next/navigation` and `next/link` read
 * and drive it; the App component registers the renderer that turns a URL into a page.
 */

export type AppLocation = {
  href: string;
  pathname: string;
  search: string;
  searchParams: URLSearchParams;
  params: Record<string, string>;
};

export class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

export class RedirectSignal extends Error {
  constructor(public url: string) {
    super("NEXT_REDIRECT");
  }
}

type RenderOptions = { scroll: boolean; reason: "navigate" | "refresh" | "pop" };
type Renderer = (url: URL, opts: RenderOptions) => Promise<void>;

const toLocation = (url: URL, params: Record<string, string> = {}): AppLocation => ({
  href: `${url.pathname}${url.search}`,
  pathname: url.pathname,
  search: url.search,
  searchParams: new URLSearchParams(url.search),
  params,
});

let current: AppLocation = toLocation(new URL(typeof location === "undefined" ? "http://localhost/" : location.href));
const listeners = new Set<() => void>();
let renderer: Renderer | null = null;

export function getLocation() {
  return current;
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Called by the renderer when a new page is ready, in the same tick as the tree swap. */
export function commitLocation(url: URL, params: Record<string, string>) {
  current = toLocation(url, params);
  for (const fn of listeners) fn();
}

export function setRenderer(fn: Renderer) {
  renderer = fn;
}

export async function navigate(href: string, opts: { replace?: boolean; scroll?: boolean } = {}) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) {
    window.open(url.href, "_blank", "noopener");
    return;
  }
  if (opts.replace) history.replaceState(null, "", url.href);
  else history.pushState(null, "", url.href);
  await renderer?.(url, { scroll: opts.scroll ?? true, reason: "navigate" });
}

export async function refresh() {
  await renderer?.(new URL(location.href), { scroll: false, reason: "refresh" });
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    void renderer?.(new URL(location.href), { scroll: false, reason: "pop" });
  });
}
