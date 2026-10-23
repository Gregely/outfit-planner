import { describe, expect, it } from "vitest";
import { illustrationKey, renderGarmentSvg, templateFor, type IllustrationInput } from "@/lib/illustration/render";
import { CATEGORIES, PATTERNS, SUBCATEGORIES } from "@/lib/domain";

const base = (over: Partial<IllustrationInput>): IllustrationInput => ({
  name: "Test",
  category: "tops",
  subcategory: "t-shirt",
  colours: [{ name: "navy", hex: "#1f2a44" }],
  ...over,
});

function wellFormed(svg: string) {
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
  expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  // tags nest properly
  const stack: string[] = [];
  for (const [tag] of svg.matchAll(/<\/?[a-zA-Z][^>]*>/g)) {
    const name = tag.match(/^<\/?([a-zA-Z]+)/)![1];
    if (tag.startsWith("</")) expect(stack.pop()).toBe(name);
    else if (!tag.endsWith("/>")) stack.push(name);
  }
  expect(stack).toEqual([]);
}

/** extract the drawn outline geometry (path data) for comparing silhouettes */
const paths = (svg: string) => (svg.match(/ d="[^"]+"/g) ?? []).join("");

describe("SVG garment illustrations", () => {
  it("renders well-formed SVG for every suggested subcategory and pattern", () => {
    for (const category of CATEGORIES) {
      for (const subcategory of SUBCATEGORIES[category]) {
        wellFormed(renderGarmentSvg(base({ category, subcategory })));
      }
    }
    for (const pattern of PATTERNS) wellFormed(renderGarmentSvg(base({ category: "shirts", subcategory: "oxford shirt", pattern, colours: [{ name: "a", hex: "#aa3322" }, { name: "b", hex: "#eeeeee" }] })));
  });

  it("distinguishes silhouettes that matter", () => {
    const wide = renderGarmentSvg(base({ category: "trousers", subcategory: "wool trousers", details: { leg: "wide" } }));
    const slim = renderGarmentSvg(base({ category: "trousers", subcategory: "wool trousers", details: { leg: "slim" } }));
    expect(paths(wide)).not.toBe(paths(slim));
    expect(templateFor(base({ category: "outerwear", subcategory: "overcoat" }))).toBe("overcoat");
    expect(templateFor(base({ category: "outerwear", subcategory: "blazer" }))).toBe("blazer");
    expect(templateFor(base({ category: "footwear", subcategory: "chelsea boots" }))).toBe("chelsea");
    expect(templateFor(base({ category: "footwear", subcategory: "loafers" }))).toBe("loafer");
    expect(templateFor(base({ category: "footwear", subcategory: "combat boots" }))).toBe("boot");
    const coat = renderGarmentSvg(base({ category: "outerwear", subcategory: "overcoat" }));
    const blazer = renderGarmentSvg(base({ category: "outerwear", subcategory: "blazer" }));
    expect(paths(coat)).not.toBe(paths(blazer));
  });

  it("is deterministic and keyed on drawing attributes only", () => {
    const a = base({});
    expect(renderGarmentSvg(a)).toBe(renderGarmentSvg({ ...a }));
    expect(illustrationKey(a)).toBe(illustrationKey({ ...a }));
    expect(illustrationKey(a)).not.toBe(illustrationKey({ ...a, colours: [{ name: "red", hex: "#aa0000" }] }));
  });

  it("uses the garment's colours and sanitises hostile input", () => {
    const svg = renderGarmentSvg(
      base({
        name: '<script>alert(1)</script>"',
        subcategory: '"/><script>',
        colours: [{ name: "x", hex: 'red" onload="alert(1)' }],
        pattern: "<b>" as never,
        materials: ["<img src=x>"],
        details: { sleeve: '"><script>' as never },
      }),
    );
    wellFormed(svg);
    expect(svg).not.toMatch(/<script|onload|<img|<b>/i);
    expect(renderGarmentSvg(base({ colours: [{ name: "rust", hex: "#a1491f" }] }))).toContain("#a1491f");
  });
});
