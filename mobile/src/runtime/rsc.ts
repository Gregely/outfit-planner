import { cloneElement, createElement, Fragment, isValidElement, Suspense, type ReactElement, type ReactNode } from "react";

/**
 * Renders the app's React Server Components inside the WebView.
 *
 * Next.js pages here are async server components that read the local database and return a
 * tree mixing plain elements, other server components and client components. In the Android
 * app there is no server, so this walks the tree once per navigation: server components are
 * called (and awaited) like functions, client components – tagged at build time from their
 * "use client" directive – are left for React to render. Server components can't use hooks or
 * state (Next enforces that), which is what makes calling them directly safe.
 */

const CLIENT = Symbol.for("wardrobe.client");

export function isClientComponent(type: unknown): boolean {
  return typeof type === "function" && (type as unknown as Record<symbol, unknown>)[CLIENT] === true;
}

const isThenable = (v: unknown): v is PromiseLike<unknown> => !!v && typeof (v as { then?: unknown }).then === "function";

function looksLikeNode(v: unknown): boolean {
  if (isValidElement(v) || isThenable(v)) return true;
  return Array.isArray(v) && v.some(looksLikeNode);
}

function withKey(node: ReactNode, key: string | null): ReactNode {
  if (key === null) return node;
  if (isValidElement(node)) return node.key === null ? cloneElement(node, { key }) : createElement(Fragment, { key }, node);
  return createElement(Fragment, { key }, node);
}

async function resolveProps(props: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) out[k] = looksLikeNode(v) ? await resolveNode(v) : v;
  return out;
}

function rebuild(el: ReactElement, props: Record<string, unknown>) {
  const { children, ...rest } = props;
  if (children === undefined) return cloneElement(el, rest);
  return Array.isArray(children) ? cloneElement(el, rest, ...(children as ReactNode[])) : cloneElement(el, rest, children as ReactNode);
}

/** Root html/body attributes are applied to the real document instead of being rendered. */
function applyDocumentAttrs(target: HTMLElement, props: Record<string, unknown>) {
  if (typeof props.className === "string") target.className = props.className;
  if (typeof props.lang === "string") target.setAttribute("lang", props.lang);
}

export async function resolveNode(node: unknown): Promise<ReactNode> {
  if (node === null || node === undefined || typeof node === "boolean") return node as ReactNode;
  if (typeof node === "string" || typeof node === "number" || typeof node === "bigint") return node as ReactNode;
  if (isThenable(node)) return resolveNode(await node);
  if (Array.isArray(node)) return Promise.all(node.map(resolveNode));
  if (!isValidElement(node)) return node as ReactNode;

  const el = node as ReactElement<Record<string, unknown>>;
  const { type } = el;
  const props = el.props ?? {};

  if (typeof type === "function" && !isClientComponent(type) && !(type.prototype && type.prototype.isReactComponent)) {
    const out = await (type as (p: unknown) => unknown)(props);
    return withKey(await resolveNode(out), el.key);
  }
  if (type === Suspense || type === Fragment) {
    const children = await resolveNode(props.children);
    return createElement(Fragment, { key: el.key ?? undefined }, children);
  }
  if (type === "html" || type === "body") {
    if (typeof document !== "undefined") applyDocumentAttrs(type === "html" ? document.documentElement : document.body, props);
    return createElement(Fragment, { key: el.key ?? undefined }, await resolveNode(props.children));
  }
  // Host elements, client components and React's own exotic types: keep, but resolve any
  // server-rendered elements passed to them (most often `children`).
  return rebuild(el, await resolveProps(props));
}
