import { Component, createElement, startTransition, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { resolveNode } from "./rsc";
import { commitLocation, NotFoundSignal, RedirectSignal, navigate, refresh, setRenderer } from "./router-store";
import { afterRender } from "./hooks";

/**
 * The app shell: matches the URL against the same `src/app/**​/page.tsx` files the web app
 * uses, renders the page inside the root layout, and swaps it in once it's ready.
 */

type PageModule = { default: ComponentType<Record<string, unknown>>; metadata?: { title?: string } };
type Route = { pattern: RegExp; keys: string[]; score: number; load: () => Promise<PageModule> };

const pages = import.meta.glob<PageModule>("../../../src/app/**/page.tsx");
const layoutModule = import.meta.glob<{ default: ComponentType<{ children: ReactNode }> }>("../../../src/app/layout.tsx", { eager: true });
const notFoundModule = import.meta.glob<{ default: ComponentType }>("../../../src/app/not-found.tsx", { eager: true });
const errorModule = import.meta.glob<{ default: ComponentType<{ error: Error; reset: () => void }> }>("../../../src/app/error.tsx", { eager: true });

const Layout = Object.values(layoutModule)[0].default;
const NotFound = Object.values(notFoundModule)[0].default;
const ErrorPage = Object.values(errorModule)[0].default;

export const routes: Route[] = Object.entries(pages)
  .map(([file, load]) => {
    const segments = file.replace(/^.*\/src\/app/, "").replace(/\/page\.tsx$/, "").split("/").filter(Boolean);
    const keys: string[] = [];
    const parts = segments.map((s) => {
      const m = /^\[(\w+)\]$/.exec(s);
      if (m) {
        keys.push(m[1]);
        return "([^/]+)";
      }
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    // static segments outrank dynamic ones (/wardrobe/new before /wardrobe/[id])
    const score = segments.reduce((n, s) => n * 2 + (s.startsWith("[") ? 0 : 1), 1);
    return { pattern: new RegExp(`^/${parts.join("/")}/?$`), keys, score, load };
  })
  .sort((a, b) => b.score - a.score || b.keys.length - a.keys.length);

export function matchRoute(pathname: string) {
  for (const route of routes) {
    const m = route.pattern.exec(pathname);
    if (m) return { route, params: Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function setTitle(title?: string) {
  document.title = title ? `${title} · Wardrobe Studio` : "Wardrobe Studio";
}

async function buildPage(url: URL): Promise<{ tree: ReactNode; params: Record<string, string> }> {
  const match = matchRoute(url.pathname);
  const wrap = (child: ReactNode) => createElement(Layout, null, child);
  if (!match) {
    setTitle("Not found");
    return { tree: await resolveNode(wrap(createElement(NotFound))), params: {} };
  }
  const mod = await match.route.load();
  const searchParams: Record<string, string | string[]> = {};
  for (const [k, v] of new URLSearchParams(url.search)) {
    const prev = searchParams[k];
    searchParams[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  const props = { params: Promise.resolve(match.params), searchParams: Promise.resolve(searchParams) };
  try {
    const tree = await resolveNode(wrap(createElement(mod.default, props)));
    setTitle(mod.metadata?.title);
    return { tree, params: match.params };
  } catch (err) {
    if (err instanceof RedirectSignal) throw err;
    if (err instanceof NotFoundSignal) {
      setTitle("Not found");
      return { tree: await resolveNode(wrap(createElement(NotFound))), params: match.params };
    }
    console.error("[app] page failed", err);
    setTitle("Something went wrong");
    const error = err instanceof Error ? err : new Error(String(err));
    return { tree: await resolveNode(wrap(createElement(ErrorPage, { error, reset: () => void refresh() }))), params: match.params };
  }
}

class Boundary extends Component<{ children: ReactNode; resetKey: number }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: number }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] render failed", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16">
          <ErrorPage error={this.state.error} reset={() => this.setState({ error: null })} />
        </div>
      );
    }
    return this.props.children;
  }
}

export function App({ splash }: { splash: ReactNode }) {
  const [view, setView] = useState<{ tree: ReactNode; version: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let latest = 0;
    setRenderer(async (url, opts) => {
      const token = ++latest;
      const slow = setTimeout(() => setBusy(true), 120);
      try {
        const { tree, params } = await buildPage(url);
        if (token !== latest) return;
        startTransition(() => {
          commitLocation(url, params);
          setView((v) => ({ tree, version: (v?.version ?? 0) + (opts.reason === "refresh" ? 0 : 1) }));
        });
        if (opts.scroll && opts.reason === "navigate") requestAnimationFrame(() => window.scrollTo({ top: 0 }));
      } catch (err) {
        if (err instanceof RedirectSignal) {
          void navigate(err.url, { replace: true });
          return;
        }
        throw err;
      } finally {
        clearTimeout(slow);
        if (token === latest) setBusy(false);
        afterRender();
      }
    });
    void refresh();
  }, []);

  return (
    <>
      <div aria-hidden className={`route-progress ${busy ? "is-busy" : ""}`} />
      {view ? <Boundary resetKey={view.version}>{view.tree}</Boundary> : splash}
    </>
  );
}
