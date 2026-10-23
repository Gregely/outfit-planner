import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment, Suspense, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveNode } from "../../mobile/src/runtime/rsc";
import { seedSample } from "../helpers";

/** The pieces of the Android app that replace Next.js's server: renderer and in-process API. */

describe("server-component renderer", () => {
  const ClientThing = ({ label, children }: { label: string; children?: ReactNode }) => createElement("button", null, label, children);
  (ClientThing as unknown as Record<symbol, boolean>)[Symbol.for("wardrobe.client")] = true;

  async function Server({ n }: { n: number }) {
    await new Promise((r) => setTimeout(r, 1));
    return createElement("p", null, `server ${n}`);
  }
  const Shared = ({ children }: { children: ReactNode }) => createElement("section", null, children);

  it("awaits server components, keeps client components and resolves elements passed into them", async () => {
    const tree = createElement(
      Suspense,
      { fallback: createElement("i", null, "loading") },
      createElement(Shared, null, createElement(ClientThing, { label: "go" }, createElement(Server, { n: 1 })), [1, 2].map((n) => createElement(Server, { key: n, n }))),
    );
    const out = await resolveNode(tree);
    const html = renderToStaticMarkup(out as ReactElement);
    expect(html).toBe("<section><button>go<p>server 1</p></button><p>server 1</p><p>server 2</p></section>");
    // the client component survives as a component, not pre-rendered markup
    const section = ((out as ReactElement<{ children: ReactNode }>).props.children as ReactElement<{ children: ReactNode[] }>).props.children;
    expect(isValidElement(section[0]) && section[0].type).toBe(ClientThing);
  });

  it("keeps keys on lists of server components", async () => {
    const out = (await resolveNode(createElement(Fragment, null, [3, 4].map((n) => createElement(Server, { key: `k${n}`, n }))))) as ReactElement<{ children: ReactElement[][] }>;
    const items = out.props.children.flat();
    expect(items.map((i) => i.key)).toEqual(["k3", "k4"]);
  });
});

describe("in-process API", () => {
  it("dispatches to the same route handlers with path params, and persists writes before answering", async () => {
    vi.stubGlobal("location", new URL("https://localhost/"));
    const { setPersist } = await import("../../mobile/src/runtime/hooks");
    const persisted = vi.fn(async () => {});
    setPersist(persisted);
    const { localFetch } = await import("../../mobile/src/runtime/local-api");
    seedSample();
    const list = await (await localFetch("/api/garments?category=footwear")).json();
    expect(list.garments.length).toBeGreaterThan(0);
    expect(persisted).not.toHaveBeenCalled();
    const id = list.garments[0].id;
    const one = await (await localFetch(`/api/garments/${id}`)).json();
    expect(one.garment.id).toBe(id);
    const res = await localFetch("/api/garments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Grey running shorts", category: "shorts" }) });
    expect(res.status).toBe(200);
    expect(persisted).toHaveBeenCalledTimes(1);
    const bad = await localFetch("/api/garments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "" }) });
    expect(bad.status).toBe(400);
    expect((await localFetch("/api/nope")).status).toBe(404);
    expect((await localFetch(`/api/garments/${id}`, { method: "PUT" })).status).toBe(405);
  });
});
