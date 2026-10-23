/**
 * Locally rendered, deterministic garment illustrations.
 *
 * Every garment is drawn in a 200×240 tile from its saved attributes: category and
 * subcategory pick a silhouette, fit / details adjust proportions, colours and pattern
 * fill it, and materials pick a fabric texture. Inputs are sanitised here so the
 * output is always safe markup.
 */
import type { Category, Fit, GarmentDetails, LayeringRole, Pattern } from "@/lib/domain";
import { CATEGORIES, PATTERNS } from "@/lib/domain";
import { normaliseHex, shade, type Colour } from "@/lib/colours";
import {
  contrastFor,
  hashString,
  n,
  outlineFor,
  patternDef,
  shadeDef,
  textureDef,
  textureFromMaterials,
  type Texture,
} from "./fabric";

export const RENDERER_VERSION = 3;

export type IllustrationInput = {
  name?: string | null;
  category: Category;
  subcategory?: string | null;
  colours?: Colour[] | null;
  pattern?: Pattern | null;
  materials?: string[] | null;
  fit?: Fit | null;
  layeringRole?: LayeringRole | null;
  details?: GarmentDetails | null;
};

export type Template =
  | "tee"
  | "polo"
  | "henley"
  | "tank"
  | "sweatshirt"
  | "hoodie"
  | "shirt"
  | "overshirt"
  | "jumper"
  | "turtleneck"
  | "quarter-zip"
  | "cardigan"
  | "vest"
  | "waistcoat"
  | "blazer"
  | "overcoat"
  | "trench"
  | "peacoat"
  | "parka"
  | "puffer"
  | "bomber"
  | "denim-jacket"
  | "leather-jacket"
  | "field-jacket"
  | "harrington"
  | "trousers"
  | "jeans"
  | "shorts"
  | "skirt"
  | "dress"
  | "suit"
  | "sneaker"
  | "loafer"
  | "oxford"
  | "chelsea"
  | "boot"
  | "sandal"
  | "scarf"
  | "beanie"
  | "cap"
  | "hat"
  | "belt"
  | "tie"
  | "bag"
  | "watch"
  | "glasses"
  | "gloves"
  | "jewellery";

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

export function templateFor(input: IllustrationInput): Template {
  const sub = `${input.subcategory ?? ""} ${input.name ?? ""}`.toLowerCase();
  switch (input.category) {
    case "tops":
      if (has(sub, "hood")) return "hoodie";
      if (has(sub, "sweatshirt", "crewneck sweat", "sweat")) return "sweatshirt";
      if (has(sub, "polo", "rugby")) return "polo";
      if (has(sub, "henley")) return "henley";
      if (has(sub, "tank", "vest top", "singlet", "camisole")) return "tank";
      return "tee";
    case "shirts":
      if (has(sub, "overshirt", "shacket", "shirt jacket")) return "overshirt";
      return "shirt";
    case "knitwear":
      if (has(sub, "cardigan")) return "cardigan";
      if (has(sub, "vest", "tank", "slipover")) return "vest";
      if (has(sub, "turtle", "roll", "polo neck")) return "turtleneck";
      if (has(sub, "zip")) return "quarter-zip";
      return "jumper";
    case "outerwear":
      if (has(sub, "blazer", "sport coat", "sports coat", "suit jacket", "tweed jacket")) return "blazer";
      if (has(sub, "trench", "mac")) return "trench";
      if (has(sub, "pea", "reefer")) return "peacoat";
      if (has(sub, "puffer", "down", "quilted")) return "puffer";
      if (has(sub, "parka", "anorak", "rain", "cagoule", "shell", "windbreaker", "waterproof")) return "parka";
      if (has(sub, "gilet", "body warmer", "bodywarmer")) return "puffer";
      if (has(sub, "track jacket", "track top", "zip-up", "fleece")) return "harrington";
      if (has(sub, "bomber", "flight", "varsity")) return "bomber";
      if (has(sub, "denim", "trucker", "jean jacket")) return "denim-jacket";
      if (has(sub, "leather", "biker", "moto")) return "leather-jacket";
      if (has(sub, "harrington", "coach")) return "harrington";
      if (has(sub, "field", "chore", "work", "barn", "m-65", "utility")) return "field-jacket";
      if (has(sub, "overcoat", "topcoat", "coat", "chesterfield", "duffle", "duster")) return "overcoat";
      return "field-jacket";
    case "trousers":
      if (has(sub, "jean", "denim")) return "jeans";
      return "trousers";
    case "shorts":
      return "shorts";
    case "skirts":
      return "skirt";
    case "dresses":
      return "dress";
    case "formalwear":
      if (has(sub, "waistcoat", "vest")) return "waistcoat";
      if (has(sub, "trouser", "pant")) return "trousers";
      if (has(sub, "dinner jacket", "blazer")) return "blazer";
      return "suit";
    case "footwear":
      if (has(sub, "chelsea", "jodhpur")) return "chelsea";
      if (has(sub, "boot")) return "boot";
      if (has(sub, "sandal", "slide", "flip", "espadrille")) return "sandal";
      if (has(sub, "sneaker", "trainer", "running", "canvas", "plimsoll", "tennis", "gym", "sport", "athletic", "basketball", "skate", "hiking shoe")) return "sneaker";
      if (has(sub, "loafer", "boat", "moccasin", "slipper", "mule", "flat", "ballet", "heel", "pump", "court shoe", "mary jane", "stiletto", "kitten")) return "loafer";
      if (has(sub, "oxford", "derby", "brogue", "dress shoe", "monk")) return "oxford";
      return "sneaker";
    case "accessories":
      if (has(sub, "scarf", "muffler", "shawl")) return "scarf";
      if (has(sub, "beanie", "watch cap", "toque")) return "beanie";
      if (has(sub, "baseball", "flat cap", "newsboy", "cap")) return "cap";
      if (has(sub, "fedora", "hat", "trilby", "bucket")) return "hat";
      if (has(sub, "belt")) return "belt";
      if (has(sub, "tie", "cravat", "pocket square")) return "tie";
      if (has(sub, "bag", "tote", "backpack", "satchel", "briefcase", "rucksack")) return "bag";
      if (has(sub, "watch")) return "watch";
      if (has(sub, "glasses", "sunglasses", "spectacles")) return "glasses";
      if (has(sub, "glove", "mitten")) return "gloves";
      return "jewellery";
  }
}

/* ------------------------------------------------------------------ */
/* Drawing context                                                     */
/* ------------------------------------------------------------------ */

type Ctx = {
  uid: string;
  base: string;
  second: string;
  third: string;
  outline: string;
  inner: string;
  hardware: string;
  stitch: string;
  fill: string;
  texture: Texture;
  texFill: string | null;
  shadeFill: string;
  defs: string[];
  parts: string[];
  details: GarmentDetails;
  fit: Fit | null;
  sub: string;
  pattern: Pattern;
  seed: number;
};

type Bounds = [number, number];

function shape(ctx: Ctx, d: string, opts: { fill?: string; plain?: boolean; width?: number; extraShade?: number } = {}) {
  const fill = opts.fill ?? ctx.fill;
  ctx.parts.push(`<path d="${d}" fill="${fill}"/>`);
  if (!opts.plain && ctx.texFill) ctx.parts.push(`<path d="${d}" fill="${ctx.texFill}"/>`);
  if (!opts.plain) ctx.parts.push(`<path d="${d}" fill="${ctx.shadeFill}"/>`);
  if (opts.extraShade) ctx.parts.push(`<path d="${d}" fill="#000" opacity="${opts.extraShade}"/>`);
  ctx.parts.push(
    `<path d="${d}" fill="none" stroke="${ctx.outline}" stroke-width="${opts.width ?? 2}" stroke-linejoin="round" stroke-linecap="round"/>`,
  );
}

function line(ctx: Ctx, d: string, opts: { stroke?: string; width?: number; dash?: string; opacity?: number } = {}) {
  ctx.parts.push(
    `<path d="${d}" fill="none" stroke="${opts.stroke ?? ctx.outline}" stroke-width="${opts.width ?? 1.4}"${
      opts.dash ? ` stroke-dasharray="${opts.dash}"` : ""
    }${opts.opacity !== undefined ? ` opacity="${opts.opacity}"` : ""} stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

function stitch(ctx: Ctx, d: string) {
  line(ctx, d, { stroke: ctx.stitch, width: 0.9, dash: "2.2 2", opacity: 0.85 });
}

function dot(ctx: Ctx, x: number, y: number, r: number, fill?: string) {
  ctx.parts.push(
    `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill ?? ctx.hardware}" stroke="${ctx.outline}" stroke-width="0.7"/>`,
  );
}

function plainFill(ctx: Ctx, d: string, fill: string, opacity = 1) {
  ctx.parts.push(`<path d="${d}" fill="${fill}"${opacity < 1 ? ` opacity="${opacity}"` : ""}/>`);
}

const P = (pts: [number, number][], close = true) =>
  "M" + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join("L") + (close ? "Z" : "");
const M = (x: number) => 200 - x;
/** Mirror a right-hand path segment of absolute points onto the left. */
const mirrorPts = (pts: [number, number][]): [number, number][] => pts.map(([x, y]) => [M(x), y]);

/* ------------------------------------------------------------------ */
/* Torso geometry (tops, knitwear, jackets, coats)                     */
/* ------------------------------------------------------------------ */

type Sleeve = "sleeveless" | "short" | "three-quarter" | "long";
type Neck = "crew" | "v" | "deep" | "scoop" | "high" | "open";

type TorsoSpec = {
  top: number;
  hem: number;
  half: number;
  hemHalf?: number;
  sleeve: Sleeve;
  neck: Neck;
  neckHalf?: number;
  depth?: number;
  structured?: boolean;
  tail?: boolean;
  puff?: number;
};

type TorsoGeo = {
  d: string;
  cuffs: string[];
  seams: string[];
  cx: number;
  top: number;
  hem: number;
  half: number;
  hemHalf: number;
  neckHalf: number;
  depth: number;
};

function fitWidth(fit: Fit | null, base: number) {
  switch (fit) {
    case "skinny":
      return base - 6;
    case "slim":
    case "tailored":
      return base - 3;
    case "relaxed":
      return base + 3;
    case "boxy":
      return base + 5;
    case "oversized":
      return base + 8;
    default:
      return base;
  }
}

function torso(spec: TorsoSpec): TorsoGeo {
  const cx = 100;
  const t = spec.top;
  const half = spec.half + (spec.puff ?? 0);
  const hemHalf = (spec.hemHalf ?? spec.half) + (spec.puff ?? 0);
  const nh = spec.neckHalf ?? 13;
  const R = (x: number) => cx + x;
  const sh: [number, number] = spec.structured ? [R(half + 9), t + 3] : [R(half + 6), t + 7];
  let sleeveR: [number, number][] = [];
  const cuffs: string[] = [];
  const armpitY = t + 50;
  switch (spec.sleeve) {
    case "long": {
      const len = Math.min(142, spec.hem - t - 4);
      sleeveR = [
        [R(half + 25), t + 72],
        [R(half + 33), t + len],
        [R(half + 16), t + len + 3],
        [R(half + 7), t + 82],
        [R(half), armpitY],
      ];
      cuffs.push(P([[R(half + 31.5), t + len - 12], [R(half + 15), t + len - 9]], false));
      break;
    }
    case "three-quarter":
      sleeveR = [
        [R(half + 25), t + 72],
        [R(half + 30), t + 106],
        [R(half + 14), t + 109],
        [R(half + 6), t + 78],
        [R(half), armpitY],
      ];
      break;
    case "short":
      sleeveR = [
        [R(half + 31), t + 42],
        [R(half + 19), t + 58],
        [R(half), armpitY - 2],
      ];
      cuffs.push(P([[R(half + 28.5), t + 38], [R(half + 16.5), t + 54]], false));
      break;
    case "sleeveless":
      break;
  }
  const depth =
    spec.depth ??
    { crew: 9, v: 30, deep: 70, scoop: 18, high: 4, open: 26 }[spec.neck];
  let neck: string;
  if (spec.neck === "v" || spec.neck === "deep" || spec.neck === "open") neck = `L${n(cx)} ${n(t + depth)}L${n(R(nh))} ${n(t)}`;
  else neck = `Q${n(cx)} ${n(t + depth * 2)} ${n(R(nh))} ${n(t)}`;

  let right: string;
  let left: string;
  if (spec.sleeve === "sleeveless") {
    const s: [number, number] = [R(half - 7), t + 2];
    right = `L${n(s[0])} ${n(s[1])}Q${n(R(half - 9))} ${n(t + 38)} ${n(R(half))} ${n(armpitY)}`;
    left = `L${n(M(R(half)))} ${n(armpitY)}Q${n(M(R(half - 9)))} ${n(t + 38)} ${n(M(s[0]))} ${n(s[1])}`;
  } else {
    right = "L" + [sh, ...sleeveR].map(([x, y]) => `${n(x)} ${n(y)}`).join("L");
    left = "L" + mirrorPts([...sleeveR].reverse()).concat([[M(sh[0]), sh[1]]]).map(([x, y]) => `${n(x)} ${n(y)}`).join("L");
  }
  const hem = spec.tail
    ? `L${n(R(hemHalf))} ${n(spec.hem - 8)}Q${n(R(hemHalf - 6))} ${n(spec.hem + 6)} ${n(cx)} ${n(spec.hem + 6)}Q${n(M(R(hemHalf - 6)))} ${n(spec.hem + 6)} ${n(M(R(hemHalf)))} ${n(spec.hem - 8)}`
    : `L${n(R(hemHalf))} ${n(spec.hem)}Q${n(cx)} ${n(spec.hem + 3)} ${n(M(R(hemHalf)))} ${n(spec.hem)}`;
  const d = `M${n(M(R(nh)))} ${n(t)}${neck}${right}${hem}${left}Z`;
  const seams =
    spec.sleeve === "sleeveless"
      ? []
      : [
          `M${n(sh[0])} ${n(sh[1])}Q${n(R(half + 2))} ${n(t + 28)} ${n(R(half))} ${n(armpitY)}`,
          `M${n(M(sh[0]))} ${n(sh[1])}Q${n(M(R(half + 2)))} ${n(t + 28)} ${n(M(R(half)))} ${n(armpitY)}`,
        ];
  const mirroredCuffs = cuffs.map((c) => mirrorPath(c));
  return {
    d,
    cuffs: [...cuffs, ...mirroredCuffs],
    seams,
    cx,
    top: t,
    hem: spec.hem,
    half,
    hemHalf,
    neckHalf: nh,
    depth,
  };
}

/** Mirror a simple absolute "M x y L x y ..." path around x = 100. */
function mirrorPath(d: string) {
  return d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_m, c: string, x: string, y: string) => `${c}${n(200 - Number(x))} ${y}`);
}

function sleeveFor(ctx: Ctx, fallback: Sleeve): Sleeve {
  return ctx.details.sleeve ?? fallback;
}

function backNeck(ctx: Ctx, g: TorsoGeo, lift = 5) {
  const { cx, top: t, neckHalf: nh } = g;
  plainFill(
    ctx,
    `M${n(cx - nh)} ${n(t)}Q${n(cx)} ${n(t - lift)} ${n(cx + nh)} ${n(t)}Q${n(cx)} ${n(t + g.depth * 2)} ${n(cx - nh)} ${n(t)}Z`,
    ctx.inner,
  );
}

function ribNeck(ctx: Ctx, g: TorsoGeo, width = 4) {
  const { cx, top: t, neckHalf: nh, depth } = g;
  const d = `M${n(cx - nh)} ${n(t)}Q${n(cx)} ${n(t + depth * 2)} ${n(cx + nh)} ${n(t)}L${n(cx + nh + width * 0.4)} ${n(t - 1)}Q${n(cx)} ${n(t + depth * 2 + width * 1.6)} ${n(cx - nh - width * 0.4)} ${n(t - 1)}Z`;
  shape(ctx, d, { width: 1.2, extraShade: 0.08 });
}

function vNeckBand(ctx: Ctx, g: TorsoGeo, w = 4) {
  const { cx, top: t, neckHalf: nh, depth } = g;
  const d = P([
    [cx - nh, t],
    [cx, t + depth],
    [cx + nh, t],
    [cx + nh + w, t + 1],
    [cx, t + depth + w * 1.6],
    [cx - nh - w, t + 1],
  ]);
  shape(ctx, d, { width: 1.2, extraShade: 0.08 });
}

function ribBand(ctx: Ctx, x1: number, x2: number, y: number, h: number) {
  const d = P([
    [x1, y],
    [x2, y],
    [x2, y + h],
    [x1, y + h],
  ]);
  shape(ctx, d, { width: 1.4, extraShade: 0.06 });
  const ribs: string[] = [];
  for (let x = x1 + 3; x < x2 - 1; x += 3.5) ribs.push(`M${n(x)} ${n(y + 1.5)}V${n(y + h - 1.5)}`);
  line(ctx, ribs.join(""), { width: 0.6, opacity: 0.35 });
}

function hemBand(ctx: Ctx, g: TorsoGeo, h = 10) {
  ribBand(ctx, g.cx - g.hemHalf, g.cx + g.hemHalf, g.hem - h, h + 1.5);
}

function cuffBands(ctx: Ctx, g: TorsoGeo) {
  for (const c of g.cuffs) line(ctx, c, { width: 1.3 });
}

function collarPoints(ctx: Ctx, g: TorsoGeo, kind: "point" | "button-down" | "spread" | "band" | "camp" | "none") {
  const { cx, top: t, neckHalf: nh } = g;
  if (kind === "none") return;
  // stand behind the neck
  plainFill(ctx, `M${n(cx - nh)} ${n(t)}Q${n(cx)} ${n(t - 7)} ${n(cx + nh)} ${n(t)}Q${n(cx)} ${n(t + 4)} ${n(cx - nh)} ${n(t)}Z`, ctx.inner);
  if (kind === "band") {
    shape(ctx, `M${n(cx - nh - 1)} ${n(t + 1)}Q${n(cx)} ${n(t + 10)} ${n(cx + nh + 1)} ${n(t + 1)}L${n(cx + nh)} ${n(t - 6)}Q${n(cx)} ${n(t + 2)} ${n(cx - nh)} ${n(t - 6)}Z`, {
      width: 1.4,
    });
    return;
  }
  const spread = kind === "spread" ? 6 : 0;
  const camp = kind === "camp";
  const right: [number, number][] = camp
    ? [
        [cx + nh, t - 3],
        [cx + nh + 12, t + 14],
        [cx + 6, t + 24],
        [cx + 2, t + 22],
      ]
    : [
        [cx + nh, t - 4],
        [cx + nh + 4 + spread, t + 15 - spread * 0.4],
        [cx + 3, t + 21],
        [cx + 1, t + 6],
      ];
  shape(ctx, P(right), { width: 1.5 });
  shape(ctx, P(mirrorPts(right)), { width: 1.5 });
  if (kind === "button-down") {
    dot(ctx, cx + nh + 1, t + 13, 1.2);
    dot(ctx, cx - nh - 1, t + 13, 1.2);
  }
}

function placket(ctx: Ctx, g: TorsoGeo, from: number, to: number, buttons: number, offset = 0) {
  const x = g.cx + offset;
  line(ctx, `M${n(x - 3)} ${n(from)}V${n(to)}M${n(x + 3)} ${n(from)}V${n(to)}`, { width: 0.9, opacity: 0.7 });
  const step = (to - from - 6) / Math.max(1, buttons - 1);
  for (let i = 0; i < buttons; i++) dot(ctx, x, from + 4 + i * step, 1.7);
}

function patchPocket(ctx: Ctx, x: number, y: number, w: number, h: number, flap = false, button = false) {
  shape(ctx, P([[x, y], [x + w, y], [x + w, y + h - 3], [x + w / 2, y + h], [x, y + h - 3]]), { width: 1.2 });
  stitch(ctx, P([[x + 2, y + 2], [x + w - 2, y + 2], [x + w - 2, y + h - 4], [x + w / 2, y + h - 1.5], [x + 2, y + h - 4]]));
  if (flap) {
    shape(ctx, P([[x - 1, y - 1], [x + w + 1, y - 1], [x + w + 1, y + 6], [x + w / 2, y + 9], [x - 1, y + 6]]), { width: 1.2, extraShade: 0.06 });
    if (button) dot(ctx, x + w / 2, y + 6, 1.5);
  }
}

function weltPocket(ctx: Ctx, x: number, y: number, w: number, slant = 0) {
  shape(ctx, P([[x, y], [x + w, y - slant], [x + w, y - slant + 4], [x, y + 4]]), { width: 1.1, extraShade: 0.1 });
}

function flapPocket(ctx: Ctx, x: number, y: number, w: number) {
  line(ctx, `M${n(x)} ${n(y)}H${n(x + w)}`, { width: 1.2 });
  shape(ctx, P([[x, y], [x + w, y], [x + w + 1, y + 9], [x - 1, y + 9]]), { width: 1.2, extraShade: 0.05 });
}

/* ------------------------------------------------------------------ */
/* Tailoring: lapels, buttons                                          */
/* ------------------------------------------------------------------ */

function lapels(ctx: Ctx, g: TorsoGeo, opts: { style: "notch" | "peak" | "shawl" | "none"; breakY: number; width: number; satin?: boolean }) {
  const { cx, top: t, neckHalf: nh } = g;
  // inside of garment visible in the V
  plainFill(ctx, P([[cx - nh, t], [cx + nh, t], [cx, opts.breakY]]), ctx.inner);
  // collar band behind neck
  shape(ctx, `M${n(cx - nh - 1)} ${n(t + 1)}Q${n(cx)} ${n(t - 9)} ${n(cx + nh + 1)} ${n(t + 1)}L${n(cx + nh - 3)} ${n(t + 7)}Q${n(cx)} ${n(t + 1)} ${n(cx - nh + 3)} ${n(t + 7)}Z`, {
    width: 1.4,
    extraShade: 0.1,
  });
  if (opts.style === "none") return;
  const w = opts.width;
  let right: string;
  if (opts.style === "shawl") {
    right = `M${n(cx + nh - 1)} ${n(t - 1)}Q${n(cx + nh + w + 6)} ${n(t + 34)} ${n(cx + 1)} ${n(opts.breakY)}L${n(cx + nh - 5)} ${n(t + 12)}Z`;
  } else if (opts.style === "peak") {
    right = P([
      [cx + nh - 1, t - 1],
      [cx + nh + w * 0.45, t + 22],
      [cx + nh + w * 0.35, t + 27],
      [cx + nh + w + 4, t + 18],
      [cx + nh + w - 2, t + 36],
      [cx + 1, opts.breakY],
      [cx + nh - 5, t + 12],
    ]);
  } else {
    right = P([
      [cx + nh - 1, t - 1],
      [cx + nh + w * 0.55, t + 22],
      [cx + nh + w * 0.4, t + 28],
      [cx + nh + w, t + 32],
      [cx + 1, opts.breakY],
      [cx + nh - 5, t + 12],
    ]);
  }
  const fill = opts.satin ? shade(ctx.base, -0.35) : undefined;
  shape(ctx, right, { width: 1.5, extraShade: opts.satin ? 0 : 0.07, fill });
  shape(ctx, mirrorPath(right).replace(/Q(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/, (_m, a, b, c, d) => `Q${n(200 - Number(a))} ${b} ${n(200 - Number(c))} ${d}`), {
    width: 1.5,
    extraShade: opts.satin ? 0 : 0.07,
    fill,
  });
  if (opts.satin) {
    line(ctx, right, { stroke: "#ffffff", width: 0.6, opacity: 0.25 });
  }
}

function frontButtons(ctx: Ctx, g: TorsoGeo, from: number, count: number, step: number, double = false) {
  if (double) {
    for (let i = 0; i < count; i++) {
      dot(ctx, g.cx - 11, from + i * step, 2.6);
      dot(ctx, g.cx + 11, from + i * step, 2.6);
    }
  } else {
    for (let i = 0; i < count; i++) dot(ctx, g.cx - 3, from + i * step, 2.6);
  }
}

function frontEdge(ctx: Ctx, g: TorsoGeo, from: number, offset = 0, curve = true) {
  const x = g.cx + offset;
  if (curve) line(ctx, `M${n(x)} ${n(from)}V${n(g.hem - 10)}Q${n(x)} ${n(g.hem)} ${n(x + 10)} ${n(g.hem + 1)}`, { width: 1.4 });
  else line(ctx, `M${n(x)} ${n(from)}V${n(g.hem + 1)}`, { width: 1.4 });
}

function zip(ctx: Ctx, x: number, from: number, to: number) {
  line(ctx, `M${n(x)} ${n(from)}V${n(to)}`, { width: 1.6 });
  line(ctx, `M${n(x)} ${n(from)}V${n(to)}`, { stroke: ctx.hardware, width: 0.9, dash: "1 1.2" });
  ctx.parts.push(`<rect x="${n(x - 1.8)}" y="${n(from + 1)}" width="3.6" height="6" rx="1" fill="${ctx.hardware}" stroke="${ctx.outline}" stroke-width="0.6"/>`);
}

/* ------------------------------------------------------------------ */
/* Templates: tops & knitwear                                          */
/* ------------------------------------------------------------------ */

function drawTee(ctx: Ctx, kind: "tee" | "polo" | "henley" | "tank" | "sweatshirt"): Bounds {
  const sleeveDefault: Sleeve = kind === "tank" ? "sleeveless" : kind === "sweatshirt" ? "long" : ctx.sub.includes("long") ? "long" : "short";
  const sleeve = sleeveFor(ctx, sleeveDefault);
  const neck: Neck = ctx.details.neckline === "v-neck" ? "v" : kind === "tank" || ctx.details.neckline === "scoop" ? "scoop" : "crew";
  const hem = kind === "sweatshirt" ? 178 : 184;
  const g = torso({ top: 46, hem, half: fitWidth(ctx.fit, 37), sleeve, neck, neckHalf: kind === "tank" ? 16 : 13 });
  backNeck(ctx, g);
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 0.9, opacity: 0.45 });
  if (neck === "v") vNeckBand(ctx, g, 3);
  else if (kind !== "polo") ribNeck(ctx, g, kind === "sweatshirt" ? 6 : 3.5);
  if (kind === "polo") {
    collarPoints(ctx, g, "point");
    placket(ctx, g, g.top + 8, g.top + 36, 2);
  }
  if (kind === "henley") placket(ctx, g, g.top + 9, g.top + 44, 3);
  if (kind === "sweatshirt") {
    hemBand(ctx, g, 11);
    cuffBands(ctx, g);
    line(ctx, `M${n(g.cx - 5)} ${n(g.top + 22)}L${n(g.cx)} ${n(g.top + 30)}L${n(g.cx + 5)} ${n(g.top + 22)}`, { width: 0.9, opacity: 0.5 });
  } else {
    cuffBands(ctx, g);
    stitch(ctx, `M${n(g.cx - g.hemHalf + 2)} ${n(g.hem - 5)}Q${n(g.cx)} ${n(g.hem - 2)} ${n(g.cx + g.hemHalf - 2)} ${n(g.hem - 5)}`);
  }
  if (ctx.pattern === "graphic") {
    ctx.parts.push(
      `<circle cx="100" cy="${n(g.top + 58)}" r="17" fill="${ctx.second}" opacity="0.9"/><path d="M88 ${n(g.top + 62)}l8-10 6 7 4-4 6 7z" fill="${ctx.third}" opacity="0.85"/>`,
    );
  }
  return [g.top - 6, g.hem + 4];
}

function drawHoodie(ctx: Ctx): Bounds {
  const g = torso({ top: 58, hem: 190, half: fitWidth(ctx.fit, 39), sleeve: sleeveFor(ctx, "long"), neck: "v", depth: 26, neckHalf: 15 });
  // hood behind
  shape(ctx, `M${n(g.cx - 24)} ${n(g.top + 6)}C${n(g.cx - 40)} ${n(g.top - 46)} ${n(g.cx + 40)} ${n(g.top - 46)} ${n(g.cx + 24)} ${n(g.top + 6)}Z`, { extraShade: 0.05 });
  plainFill(ctx, `M${n(g.cx - 17)} ${n(g.top + 4)}C${n(g.cx - 28)} ${n(g.top - 32)} ${n(g.cx + 28)} ${n(g.top - 32)} ${n(g.cx + 17)} ${n(g.top + 4)}Z`, ctx.inner);
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 0.9, opacity: 0.45 });
  // hood opening edge
  line(ctx, `M${n(g.cx - 17)} ${n(g.top + 2)}L${n(g.cx)} ${n(g.top + 26)}L${n(g.cx + 17)} ${n(g.top + 2)}`, { width: 2 });
  if (ctx.details.closure === "zip") zip(ctx, g.cx, g.top + 26, g.hem);
  // drawstrings
  line(ctx, `M${n(g.cx - 6)} ${n(g.top + 18)}v26M${n(g.cx + 6)} ${n(g.top + 18)}v22`, { stroke: ctx.second, width: 1.6 });
  dot(ctx, g.cx - 6, g.top + 45, 1.3, ctx.second);
  dot(ctx, g.cx + 6, g.top + 41, 1.3, ctx.second);
  if (ctx.details.closure !== "zip") {
    const y = g.hem - 52;
    shape(ctx, P([[g.cx - 30, y + 36], [g.cx - 22, y], [g.cx + 22, y], [g.cx + 30, y + 36]]), { width: 1.3, extraShade: 0.04 });
  }
  hemBand(ctx, g, 11);
  cuffBands(ctx, g);
  return [g.top - 36, g.hem + 4];
}

function drawShirt(ctx: Ctx, over = false): Bounds {
  const camp = ctx.sub.includes("camp") || ctx.sub.includes("cuban") || ctx.sub.includes("bowling");
  const sleeve = sleeveFor(ctx, camp ? "short" : "long");
  const g = torso({
    top: 46,
    hem: over ? 182 : 186,
    half: fitWidth(ctx.fit, over ? 40 : 37),
    sleeve,
    neck: camp ? "open" : "crew",
    depth: camp ? 26 : 4,
    tail: !over && !camp,
  });
  backNeck(ctx, g, 6);
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 0.9, opacity: 0.45 });
  const collar =
    ctx.details.collar ??
    (camp
      ? "camp"
      : ctx.sub.includes("band") || ctx.sub.includes("grandad")
        ? "band"
        : ctx.sub.includes("oxford")
          ? "button-down"
          : ctx.sub.includes("dress")
            ? "spread"
            : "point");
  collarPoints(ctx, g, collar);
  placket(ctx, g, g.top + (camp ? 26 : 8), g.hem - 4, over ? 5 : 7);
  if (over) {
    patchPocket(ctx, g.cx + 9, g.top + 30, 18, 20, true, true);
    patchPocket(ctx, g.cx - 27, g.top + 30, 18, 20, true, true);
  } else if (ctx.details.pockets !== false && !ctx.sub.includes("dress")) {
    patchPocket(ctx, g.cx - 28, g.top + 32, 17, 19, ctx.sub.includes("denim") || ctx.sub.includes("western"), ctx.sub.includes("denim"));
  }
  if (ctx.sub.includes("denim") || ctx.sub.includes("western")) {
    stitch(ctx, `M${n(g.cx - g.half - 4)} ${n(g.top + 18)}Q${n(g.cx - 16)} ${n(g.top + 24)} ${n(g.cx - 3)} ${n(g.top + 22)}M${n(g.cx + g.half + 4)} ${n(g.top + 18)}Q${n(g.cx + 16)} ${n(g.top + 24)} ${n(g.cx + 3)} ${n(g.top + 22)}`);
  }
  cuffBands(ctx, g);
  return [g.top - 7, g.hem + 7];
}

function drawJumper(ctx: Ctx, kind: "jumper" | "turtleneck" | "quarter-zip" | "vest"): Bounds {
  const isV = ctx.details.neckline === "v-neck" || ctx.sub.includes("v-neck") || ctx.sub.includes("v neck") || (kind === "vest" && ctx.details.neckline !== "crew");
  const g = torso({
    top: kind === "turtleneck" ? 54 : 48,
    hem: 184,
    half: fitWidth(ctx.fit, 38),
    sleeve: kind === "vest" ? "sleeveless" : sleeveFor(ctx, "long"),
    neck: isV ? "v" : kind === "turtleneck" || kind === "quarter-zip" ? "high" : "crew",
    depth: isV ? 34 : undefined,
    neckHalf: kind === "turtleneck" ? 15 : 13,
  });
  if (kind === "turtleneck") {
    const { cx, top: t } = g;
    shape(ctx, P([[cx - 15, t + 2], [cx - 16, t - 20], [cx + 16, t - 20], [cx + 15, t + 2]]), { extraShade: 0.04 });
    plainFill(ctx, `M${n(cx - 16)} ${n(t - 20)}Q${n(cx)} ${n(t - 26)} ${n(cx + 16)} ${n(t - 20)}Q${n(cx)} ${n(t - 14)} ${n(cx - 16)} ${n(t - 20)}Z`, ctx.inner);
    line(ctx, `M${n(cx - 15.5)} ${n(t - 9)}Q${n(cx)} ${n(t - 4)} ${n(cx + 15.5)} ${n(t - 9)}`, { width: 1.3 });
    const ribs: string[] = [];
    for (let x = cx - 13; x <= cx + 13; x += 3.5) ribs.push(`M${n(x)} ${n(t - 18)}V${n(t)}`);
    line(ctx, ribs.join(""), { width: 0.6, opacity: 0.3 });
  } else if (kind === "quarter-zip") {
    const { cx, top: t } = g;
    shape(ctx, P([[cx - 14, t + 3], [cx - 15, t - 12], [cx + 15, t - 12], [cx + 14, t + 3]]), { extraShade: 0.04 });
  } else if (!isV) {
    backNeck(ctx, g);
  } else {
    plainFill(ctx, P([[g.cx - g.neckHalf, g.top], [g.cx + g.neckHalf, g.top], [g.cx, g.top + g.depth]]), ctx.inner);
  }
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 0.9, opacity: 0.4 });
  if (kind === "quarter-zip") zip(ctx, g.cx, g.top - 11, g.top + 44);
  else if (isV) vNeckBand(ctx, g, 4);
  else if (kind === "jumper" || kind === "vest") ribNeck(ctx, g, 5);
  if (kind === "vest") {
    const { cx, top: t, half } = g;
    line(ctx, `M${n(cx + half - 7)} ${n(t + 3)}Q${n(cx + half - 13)} ${n(t + 36)} ${n(cx + half + 1)} ${n(t + 47)}M${n(cx - half + 7)} ${n(t + 3)}Q${n(cx - half + 13)} ${n(t + 36)} ${n(cx - half - 1)} ${n(t + 47)}`, {
      width: 3,
      opacity: 0.25,
    });
  }
  hemBand(ctx, g, 12);
  cuffBands(ctx, g);
  return [g.top - (kind === "turtleneck" ? 24 : 14), g.hem + 4];
}

function drawCardigan(ctx: Ctx): Bounds {
  const g = torso({ top: 48, hem: 186, half: fitWidth(ctx.fit, 39), sleeve: sleeveFor(ctx, "long"), neck: "deep", depth: 62 });
  plainFill(ctx, P([[g.cx - g.neckHalf, g.top], [g.cx + g.neckHalf, g.top], [g.cx, g.top + g.depth]]), ctx.inner);
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 0.9, opacity: 0.4 });
  // button bands
  const band = (side: 1 | -1) =>
    P([
      [g.cx + side * g.neckHalf, g.top],
      [g.cx + side * (g.neckHalf + 4), g.top + 1],
      [g.cx + side * 4, g.top + g.depth + 2],
      [g.cx + side * 4, g.hem + 1],
      [g.cx, g.hem + 1],
      [g.cx, g.top + g.depth],
    ]);
  shape(ctx, band(1), { width: 1.2, extraShade: 0.07 });
  shape(ctx, band(-1), { width: 1.2, extraShade: 0.07 });
  for (let i = 0; i < 5; i++) dot(ctx, g.cx - 2, g.top + g.depth + 6 + i * 13, 2.1);
  if (ctx.details.pockets) {
    patchPocket(ctx, g.cx + 12, g.hem - 44, 20, 20);
    patchPocket(ctx, g.cx - 32, g.hem - 44, 20, 20);
  }
  hemBand(ctx, g, 11);
  cuffBands(ctx, g);
  return [g.top - 6, g.hem + 4];
}

function drawWaistcoat(ctx: Ctx): Bounds {
  const g = torso({ top: 50, hem: 168, half: fitWidth(ctx.fit, 35), sleeve: "sleeveless", neck: "deep", depth: 56, neckHalf: 15 });
  plainFill(ctx, P([[g.cx - g.neckHalf, g.top], [g.cx + g.neckHalf, g.top], [g.cx, g.top + g.depth]]), "#efe9dc");
  // pointed hem
  const d = g.d.replace(/L([\d.]+) 168Q100 171 ([\d.]+) 168/, (_m, a, b) => `L${a} 168L${n(g.cx + 4)} 182L${n(g.cx - 4)} 182L${b} 168`);
  shape(ctx, d);
  frontEdge(ctx, g, g.top + g.depth, 0, false);
  for (let i = 0; i < 5; i++) dot(ctx, g.cx - 3, g.top + g.depth + 4 + i * 12, 2);
  weltPocket(ctx, g.cx + 12, g.top + 76, 16, 2);
  weltPocket(ctx, g.cx - 28, g.top + 78, 16, -2);
  weltPocket(ctx, g.cx + 14, g.top + 34, 12, 2);
  return [g.top - 4, 184];
}

/* ------------------------------------------------------------------ */
/* Templates: jackets & coats                                          */
/* ------------------------------------------------------------------ */

function drawBlazer(ctx: Ctx, opts: { top?: number; hem?: number; satin?: boolean } = {}): Bounds {
  const top = opts.top ?? 42;
  const hem = opts.hem ?? 196;
  const double = ctx.details.closure === "double-breasted" || ctx.sub.includes("double");
  const g = torso({ top, hem, half: fitWidth(ctx.fit, 38), hemHalf: fitWidth(ctx.fit, 40), sleeve: "long", neck: "deep", depth: double ? 66 : 78, structured: true, neckHalf: 13 });
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 1, opacity: 0.5 });
  lapels(ctx, g, { style: ctx.details.lapel ?? (double ? "peak" : opts.satin ? "shawl" : "notch"), breakY: g.top + g.depth, width: double ? 22 : 18, satin: opts.satin });
  frontEdge(ctx, g, g.top + g.depth, 0, !double);
  if (double) frontButtons(ctx, g, g.top + g.depth + 6, 3, 16, true);
  else frontButtons(ctx, g, g.top + g.depth + 8, 2, 20);
  flapPocket(ctx, g.cx + 14, g.hem - 52, 24);
  flapPocket(ctx, g.cx - 38, g.hem - 52, 24);
  weltPocket(ctx, g.cx - 34, g.top + 46, 16, -2);
  // sleeve buttons
  for (let i = 0; i < 3; i++) {
    dot(ctx, g.cx + g.half + 25 - i * 2.2, g.top + 128 - i * 4.5, 1.3);
    dot(ctx, g.cx - g.half - 25 + i * 2.2, g.top + 128 - i * 4.5, 1.3);
  }
  if (ctx.texture === "tweed" || ctx.sub.includes("tweed")) {
    // elbow patch hint on one sleeve
    ctx.parts.push(`<ellipse cx="${n(g.cx + g.half + 21)}" cy="${n(g.top + 92)}" rx="5" ry="9" fill="${shade(ctx.base, -0.4)}" opacity="0.7" transform="rotate(-10 ${n(g.cx + g.half + 21)} ${n(g.top + 92)})"/>`);
  }
  return [g.top - 6, g.hem + 3];
}

function coatLength(ctx: Ctx, fallback: number) {
  switch (ctx.details.length) {
    case "cropped":
    case "waist":
      return 160;
    case "hip":
      return 182;
    case "thigh":
      return 198;
    case "knee":
      return 222;
    case "midi":
    case "calf":
    case "ankle":
    case "full":
      return 232;
    default:
      return fallback;
  }
}

function drawOvercoat(ctx: Ctx, kind: "overcoat" | "trench" | "peacoat"): Bounds {
  const double = kind !== "overcoat" || ctx.details.closure === "double-breasted";
  const hem = coatLength(ctx, kind === "peacoat" ? 186 : 222);
  const top = 30;
  const g = torso({
    top,
    hem,
    half: fitWidth(ctx.fit, 40),
    hemHalf: fitWidth(ctx.fit, kind === "peacoat" ? 42 : 48),
    sleeve: "long",
    neck: "deep",
    depth: kind === "peacoat" ? 50 : 66,
    structured: true,
    neckHalf: 14,
  });
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 1, opacity: 0.5 });
  lapels(ctx, g, { style: ctx.details.lapel ?? (kind === "overcoat" ? "notch" : "peak"), breakY: g.top + g.depth, width: kind === "peacoat" ? 26 : 22 });
  frontEdge(ctx, g, g.top + g.depth, double ? 12 : 0, false);
  if (double) frontButtons(ctx, g, g.top + g.depth + 6, kind === "peacoat" ? 3 : 3, kind === "peacoat" ? 18 : 22, true);
  else frontButtons(ctx, g, g.top + g.depth + 8, 3, 24);
  if (kind === "trench") {
    // storm flap and epaulettes
    shape(ctx, P([[g.cx - g.half - 2, g.top + 10], [g.cx - 16, g.top + 18], [g.cx - 18, g.top + 48], [g.cx - g.half + 2, g.top + 44]]), { width: 1.2, extraShade: 0.06 });
    line(ctx, `M${n(g.cx + g.half + 6)} ${n(g.top + 5)}L${n(g.cx + 18)} ${n(g.top + 8)}M${n(g.cx - g.half - 6)} ${n(g.top + 5)}L${n(g.cx - 18)} ${n(g.top + 8)}`, { width: 3.2, opacity: 0.35 });
    const by = g.top + 92;
    shape(ctx, P([[g.cx - g.half - 2, by], [g.cx + g.half + 2, by], [g.cx + g.half + 3, by + 8], [g.cx - g.half - 3, by + 8]]), { width: 1.3, extraShade: 0.1 });
    ctx.parts.push(`<rect x="${n(g.cx - 7)}" y="${n(by - 1)}" width="14" height="10" rx="1.5" fill="none" stroke="${ctx.hardware}" stroke-width="1.6"/>`);
    line(ctx, `M${n(g.cx + 8)} ${n(by + 8)}l4 22M${n(g.cx + 12)} ${n(by + 8)}l7 18`, { width: 3, opacity: 0.4 });
  } else {
    flapPocket(ctx, g.cx + 16, g.top + 112, 24);
    flapPocket(ctx, g.cx - 40, g.top + 112, 24);
  }
  if (kind !== "trench" && hem > 200) line(ctx, `M${n(g.cx)} ${n(g.hem - 40)}V${n(g.hem + 1)}`, { width: 1, opacity: 0.4 });
  return [g.top - 8, g.hem + 3];
}

function drawCasualJacket(ctx: Ctx, kind: "bomber" | "denim-jacket" | "leather-jacket" | "field-jacket" | "harrington" | "parka" | "puffer"): Bounds {
  const hemDefault = { bomber: 168, "denim-jacket": 166, "leather-jacket": 166, "field-jacket": 186, harrington: 168, parka: 212, puffer: 176 }[kind];
  const hem = coatLength(ctx, hemDefault);
  const puff = kind === "puffer" ? 6 : kind === "bomber" ? 3 : 0;
  const hood = kind === "parka" || ctx.details.hood === true;
  const g = torso({
    top: hood ? 58 : 46,
    hem,
    half: fitWidth(ctx.fit, 39),
    hemHalf: fitWidth(ctx.fit, kind === "bomber" || kind === "harrington" ? 36 : kind === "parka" ? 44 : 40),
    sleeve: "long",
    neck: kind === "leather-jacket" || kind === "denim-jacket" || kind === "field-jacket" ? "open" : "high",
    depth: kind === "leather-jacket" ? 30 : kind === "denim-jacket" ? 24 : kind === "field-jacket" ? 18 : 5,
    puff,
  });
  if (hood) {
    shape(ctx, `M${n(g.cx - 26)} ${n(g.top + 6)}C${n(g.cx - 42)} ${n(g.top - 48)} ${n(g.cx + 42)} ${n(g.top - 48)} ${n(g.cx + 26)} ${n(g.top + 6)}Z`, { extraShade: 0.05 });
    plainFill(ctx, `M${n(g.cx - 18)} ${n(g.top + 2)}C${n(g.cx - 28)} ${n(g.top - 34)} ${n(g.cx + 28)} ${n(g.top - 34)} ${n(g.cx + 18)} ${n(g.top + 2)}Z`, ctx.inner);
  } else {
    plainFill(ctx, P([[g.cx - g.neckHalf, g.top], [g.cx + g.neckHalf, g.top], [g.cx, g.top + g.depth + 2]]), ctx.inner);
  }
  shape(ctx, g.d);
  for (const s of g.seams) line(ctx, s, { width: 1, opacity: 0.45 });

  switch (kind) {
    case "bomber":
    case "harrington": {
      if (kind === "bomber") ribBand(ctx, g.cx - g.neckHalf - 3, g.cx + g.neckHalf + 3, g.top - 6, 8);
      else collarPoints(ctx, g, "band");
      zip(ctx, g.cx, g.top + 2, g.hem - 8);
      ribBand(ctx, g.cx - g.hemHalf, g.cx + g.hemHalf, g.hem - 10, 11);
      cuffBands(ctx, g);
      weltPocket(ctx, g.cx + 14, g.hem - 44, 16, 6);
      weltPocket(ctx, g.cx - 30, g.hem - 38, 16, -6);
      if (kind === "harrington") {
        // tartan lining hint at the collar
        plainFill(ctx, P([[g.cx - 9, g.top + 1], [g.cx + 9, g.top + 1], [g.cx, g.top + 9]]), "#a33a2b", 0.8);
      }
      break;
    }
    case "denim-jacket": {
      collarPoints(ctx, g, "point");
      placket(ctx, g, g.top + g.depth, g.hem - 8, 5);
      patchPocket(ctx, g.cx + 9, g.top + 30, 18, 18, true, true);
      patchPocket(ctx, g.cx - 27, g.top + 30, 18, 18, true, true);
      stitch(ctx, `M${n(g.cx - g.half)} ${n(g.top + 22)}H${n(g.cx - 3)}M${n(g.cx + 3)} ${n(g.top + 22)}H${n(g.cx + g.half)}`);
      stitch(ctx, `M${n(g.cx - 18)} ${n(g.top + 52)}V${n(g.hem - 10)}M${n(g.cx + 18)} ${n(g.top + 52)}V${n(g.hem - 10)}`);
      ribBand(ctx, g.cx - g.hemHalf, g.cx + g.hemHalf, g.hem - 10, 11);
      cuffBands(ctx, g);
      break;
    }
    case "leather-jacket": {
      // biker: wide collar + asymmetric zip
      const { cx, top: t } = g;
      const r: [number, number][] = [[cx + 12, t - 2], [cx + 32, t + 14], [cx + 26, t + 22], [cx + 12, t + 46], [cx + 3, t + 30]];
      shape(ctx, P(r), { width: 1.5 });
      shape(ctx, P(mirrorPts(r)), { width: 1.5 });
      line(ctx, `M${n(cx + 14)} ${n(t + 46)}L${n(cx + 10)} ${n(g.hem - 10)}`, { width: 1.6 });
      zip(ctx, cx + 12, t + 48, g.hem - 12);
      line(ctx, `M${n(cx - 26)} ${n(t + 56)}l14 -4`, { stroke: ctx.hardware, width: 1.6 });
      ctx.parts.push(`<rect x="${n(g.cx - g.hemHalf)}" y="${n(g.hem - 10)}" width="${n(g.hemHalf * 2)}" height="10" fill="#000" opacity="0.1"/>`);
      ctx.parts.push(`<rect x="${n(g.cx + g.hemHalf - 14)}" y="${n(g.hem - 9)}" width="7" height="8" rx="1" fill="none" stroke="${ctx.hardware}" stroke-width="1.3"/>`);
      cuffBands(ctx, g);
      break;
    }
    case "field-jacket": {
      collarPoints(ctx, g, "point");
      placket(ctx, g, g.top + g.depth, g.hem - 4, 5);
      const chore = ctx.sub.includes("chore") || ctx.sub.includes("work");
      if (!chore) {
        patchPocket(ctx, g.cx + 9, g.top + 32, 20, 22, true, true);
        patchPocket(ctx, g.cx - 29, g.top + 32, 20, 22, true, true);
      } else {
        patchPocket(ctx, g.cx - 28, g.top + 30, 17, 18);
      }
      patchPocket(ctx, g.cx + 9, g.hem - 52, 24, 28, !chore, !chore);
      patchPocket(ctx, g.cx - 33, g.hem - 52, 24, 28, !chore, !chore);
      cuffBands(ctx, g);
      break;
    }
    case "parka": {
      zip(ctx, g.cx, g.top + 6, g.hem - 2);
      shape(ctx, P([[g.cx - 4, g.top + 6], [g.cx + 6, g.top + 6], [g.cx + 6, g.hem], [g.cx - 4, g.hem]]), { width: 1.2, extraShade: 0.06 });
      for (let i = 0; i < 5; i++) dot(ctx, g.cx + 1, g.top + 16 + i * ((g.hem - g.top - 30) / 4), 1.6);
      patchPocket(ctx, g.cx + 12, g.hem - 70, 26, 28, true, true);
      patchPocket(ctx, g.cx - 38, g.hem - 70, 26, 28, true, true);
      line(ctx, `M${n(g.cx - g.half)} ${n(g.top + 98)}Q${n(g.cx)} ${n(g.top + 104)} ${n(g.cx + g.half)} ${n(g.top + 98)}`, { width: 1, dash: "3 2", opacity: 0.6 });
      cuffBands(ctx, g);
      break;
    }
    case "puffer": {
      shape(ctx, P([[g.cx - 15, g.top + 4], [g.cx - 16, g.top - 12], [g.cx + 16, g.top - 12], [g.cx + 15, g.top + 4]]), { extraShade: 0.04 });
      const lines: string[] = [];
      for (let y = g.top + 20; y < g.hem - 4; y += 17) {
        lines.push(`M${n(g.cx - g.half - 2)} ${n(y)}Q${n(g.cx)} ${n(y + 4)} ${n(g.cx + g.half + 2)} ${n(y)}`);
        if (y < g.top + 130) {
          // quilting across the sleeves follows their angle
          const sx = g.cx + g.half + 3 + ((y - g.top) / 142) * 26;
          lines.push(`M${n(sx)} ${n(y + 2)}l12 -1.5M${n(200 - sx)} ${n(y + 2)}l-12 -1.5`);
        }
      }
      line(ctx, lines.join(""), { width: 1.1, opacity: 0.55 });
      zip(ctx, g.cx, g.top - 11, g.hem);
      cuffBands(ctx, g);
      return [g.top - 16, g.hem + 4];
    }
  }
  return [g.top - (hood ? 40 : 10), g.hem + 4];
}

/* ------------------------------------------------------------------ */
/* Templates: bottoms & one-pieces                                     */
/* ------------------------------------------------------------------ */

const LEG_SHAPES: Record<string, { knee: number; hem: number; inner: number; kneeIn: number }> = {
  skinny: { knee: 30, hem: 25, inner: 11, kneeIn: 7 },
  slim: { knee: 34, hem: 30, inner: 9, kneeIn: 5 },
  straight: { knee: 38, hem: 37, inner: 6, kneeIn: 4 },
  tapered: { knee: 37, hem: 30, inner: 10, kneeIn: 4 },
  wide: { knee: 47, hem: 54, inner: 2, kneeIn: 2 },
  flared: { knee: 33, hem: 48, inner: 1, kneeIn: 6 },
  barrel: { knee: 48, hem: 33, inner: 9, kneeIn: 1 },
};

function legShape(ctx: Ctx): keyof typeof LEG_SHAPES {
  if (ctx.details.leg) return ctx.details.leg;
  const s = `${ctx.sub}`;
  if (/wide|palazzo|baggy|sailor/.test(s)) return "wide";
  if (/flare|bootcut|bell/.test(s)) return "flared";
  if (/barrel|balloon/.test(s)) return "barrel";
  if (/skinny|legging|tights/.test(s)) return "skinny";
  if (/slim/.test(s)) return "slim";
  if (/taper|jogger|carrot|track ?pant|sweatpant/.test(s)) return "tapered";
  switch (ctx.fit) {
    case "skinny":
      return "skinny";
    case "slim":
    case "tailored":
      return "slim";
    case "relaxed":
      return "straight";
    case "oversized":
      return "wide";
    default:
      return "straight";
  }
}

const SPORTY_LEGS = /jogger|athletic|sweat|running|gym|track|legging|tights|bike|cycling|sport|training|yoga|lounge|pyjama|swim/;

function drawLegs(ctx: Ctx, opts: { kind: "trousers" | "jeans" | "shorts"; waistY?: number; hemY?: number; noWaist?: boolean }): Bounds {
  const cx = 100;
  const waistY = opts.waistY ?? 16;
  const shapeKey = opts.kind === "shorts" ? "straight" : legShape(ctx);
  // pull-on sportswear and loungewear: elastic waist, no fly or belt loops
  const elastic = SPORTY_LEGS.test(ctx.sub);
  const sporty = elastic && !/sweat|lounge|pyjama|jogger/.test(ctx.sub);
  const s = LEG_SHAPES[shapeKey];
  const waistHalf = fitWidth(ctx.fit, 35);
  const hipHalf = waistHalf + 5;
  const crotchY = waistY + 70;
  const lengthMap: Record<string, number> = { cropped: 196, ankle: 210, full: 226 };
  let hemY = opts.hemY ?? lengthMap[ctx.details.length ?? "full"] ?? 226;
  let hemOuter = s.hem;
  let hemInner = s.inner;
  let kneeY = (crotchY + hemY) / 2 + 6;
  let knee = s.knee;
  let kneeIn = s.kneeIn;
  if (opts.kind === "shorts") {
    hemY = ctx.details.length === "knee" ? waistY + 118 : waistY + 100;
    hemOuter = hipHalf + 6;
    hemInner = 3;
    kneeY = crotchY;
    knee = hipHalf + 4;
    kneeIn = 1;
  }
  const right: [number, number][] = [
    [cx + waistHalf, waistY],
    [cx + hipHalf, waistY + 34],
    [cx + knee, kneeY],
    [cx + hemOuter, hemY],
    [cx + hemInner, hemY],
    [cx + kneeIn, kneeY],
    [cx, crotchY],
  ];
  const left = mirrorPts([...right].reverse()).slice(1);
  const d = P([...right, ...left]);
  shape(ctx, d);
  // waistband
  if (!opts.noWaist) {
    const wb = P([[cx - waistHalf, waistY], [cx + waistHalf, waistY], [cx + waistHalf + 0.6, waistY + 9], [cx - waistHalf - 0.6, waistY + 9]]);
    if (elastic) {
      ribBand(ctx, cx - waistHalf, cx + waistHalf, waistY, 9);
      line(ctx, `M${n(cx - 4)} ${n(waistY + 8)}q-2 12 -6 16M${n(cx + 4)} ${n(waistY + 8)}q2 12 6 16`, { stroke: ctx.second, width: 1.3 });
    } else {
      shape(ctx, wb, { width: 1.4, extraShade: 0.05 });
      // belt loops
      for (const x of [cx - waistHalf + 8, cx - 12, cx + 12, cx + waistHalf - 8]) {
        ctx.parts.push(`<rect x="${n(x - 1.6)}" y="${n(waistY - 1)}" width="3.2" height="11" fill="${ctx.fill}" stroke="${ctx.outline}" stroke-width="0.8"/>`);
      }
      dot(ctx, cx, waistY + 4.5, 2);
    }
  }
  const jeans = opts.kind === "jeans" || ctx.texture === "denim";
  // fly
  if (!elastic) {
    const fly = `M${n(cx)} ${n(waistY + 9)}V${n(crotchY - 12)}Q${n(cx + 1)} ${n(crotchY - 6)} ${n(cx + 10)} ${n(crotchY - 20)}V${n(waistY + 9)}`;
    if (jeans) stitch(ctx, fly);
    else line(ctx, fly, { width: 1, opacity: 0.55 });
  }
  if (sporty) {
    // side stripe (track pants) or side split (running shorts)
    const top = waistY + 12;
    line(ctx, `M${n(cx + hipHalf - 1)} ${n(top)}L${n(cx + hemOuter - 1.5)} ${n(hemY - 1)}M${n(cx - hipHalf + 1)} ${n(top)}L${n(cx - hemOuter + 1.5)} ${n(hemY - 1)}`, { stroke: ctx.second, width: 2.2, opacity: 0.85 });
    if (opts.kind === "shorts") line(ctx, `M${n(cx + hemOuter - 2)} ${n(hemY)}l-3 -9M${n(cx - hemOuter + 2)} ${n(hemY)}l3 -9`, { width: 1.1 });
  }
  if (/legging|tights|bike|cycling/.test(ctx.sub)) return [waistY - 2, hemY + 2];
  // front pockets
  const pocket = jeans
    ? `M${n(cx + waistHalf - 16)} ${n(waistY + 9)}Q${n(cx + waistHalf - 12)} ${n(waistY + 26)} ${n(cx + hipHalf - 1)} ${n(waistY + 28)}`
    : `M${n(cx + waistHalf - 10)} ${n(waistY + 9)}L${n(cx + hipHalf - 0.5)} ${n(waistY + 30)}`;
  line(ctx, pocket + mirrorPath(pocket.replace(/Q(-?[\d.]+) (-?[\d.]+) /, "L$1 $2L")), { width: 1.2 });
  if (jeans) {
    stitch(ctx, `M${n(cx + waistHalf - 13)} ${n(waistY + 12)}Q${n(cx + waistHalf - 10)} ${n(waistY + 24)} ${n(cx + hipHalf - 3)} ${n(waistY + 25)}`);
    ctx.parts.push(`<rect x="${n(cx + waistHalf - 9)}" y="${n(waistY + 11)}" width="7" height="7" fill="none" stroke="${ctx.stitch}" stroke-width="0.8" stroke-dasharray="1.5 1.3"/>`);
    dot(ctx, cx + hipHalf - 1, waistY + 28, 1.1);
    dot(ctx, cx - hipHalf + 1, waistY + 28, 1.1);
    stitch(ctx, `M${n(cx + hemOuter - 1)} ${n(hemY - 4)}H${n(cx + hemInner + 1)}M${n(cx - hemOuter + 1)} ${n(hemY - 4)}H${n(cx - hemInner - 1)}`);
  }
  const pleated = ctx.sub.includes("pleat");
  if (pleated) line(ctx, `M${n(cx + 14)} ${n(waistY + 9)}v18M${n(cx + 20)} ${n(waistY + 9)}v12M${n(cx - 14)} ${n(waistY + 9)}v18M${n(cx - 20)} ${n(waistY + 9)}v12`, { width: 1, opacity: 0.6 });
  const tailored = /wool|dress|suit|pleat|tailor|flannel/.test(ctx.sub) || ctx.fit === "tailored";
  if (tailored && opts.kind !== "shorts") {
    const mid = (cx + (hemOuter + hemInner) / 2) - cx;
    line(ctx, `M${n(cx + 18)} ${n(waistY + 30)}L${n(cx + mid)} ${n(hemY - 2)}M${n(cx - 18)} ${n(waistY + 30)}L${n(cx - mid)} ${n(hemY - 2)}`, { width: 0.9, opacity: 0.4 });
  }
  if (ctx.sub.includes("cargo")) {
    const y = crotchY + 4;
    patchPocket(ctx, cx + knee - 18, y, 18, 26, true, false);
    patchPocket(ctx, cx - knee, y, 18, 26, true, false);
  }
  if (ctx.details.cuffs || ctx.sub.includes("turn-up")) {
    line(ctx, `M${n(cx + hemOuter - 0.5)} ${n(hemY - 9)}H${n(cx + hemInner + 0.5)}M${n(cx - hemOuter + 0.5)} ${n(hemY - 9)}H${n(cx - hemInner - 0.5)}`, { width: 1.3 });
  }
  if (ctx.sub.includes("jogger")) {
    ribBand(ctx, cx + hemInner, cx + hemOuter, hemY - 10, 10);
    ribBand(ctx, cx - hemOuter, cx - hemInner, hemY - 10, 10);
  }
  return [waistY - 2, hemY + 2];
}

function drawSkirt(ctx: Ctx, waistY = 40): Bounds {
  const cx = 100;
  const pencil = ctx.sub.includes("pencil");
  const long = ctx.sub.includes("midi") || ctx.sub.includes("maxi") || ctx.details.length === "midi" || ctx.details.length === "calf";
  const mini = ctx.sub.includes("mini") || ctx.details.length === "thigh";
  const hemY = mini ? waistY + 92 : long ? waistY + 168 : waistY + 128;
  const waistHalf = fitWidth(ctx.fit, 32);
  const hemHalf = pencil ? waistHalf + 6 : long ? waistHalf + 34 : waistHalf + 28;
  const d = `M${n(cx - waistHalf)} ${n(waistY)}L${n(cx + waistHalf)} ${n(waistY)}L${n(cx + hemHalf)} ${n(hemY)}Q${n(cx)} ${n(hemY + 6)} ${n(cx - hemHalf)} ${n(hemY)}Z`;
  shape(ctx, d);
  shape(ctx, P([[cx - waistHalf, waistY], [cx + waistHalf, waistY], [cx + waistHalf + 0.8, waistY + 9], [cx - waistHalf - 0.8, waistY + 9]]), { width: 1.3, extraShade: 0.06 });
  if (ctx.sub.includes("pleat")) {
    const lines: string[] = [];
    for (let i = -3; i <= 3; i++) lines.push(`M${n(cx + i * (waistHalf / 3.5))} ${n(waistY + 9)}L${n(cx + i * (hemHalf / 3.5))} ${n(hemY + 2)}`);
    line(ctx, lines.join(""), { width: 1, opacity: 0.5 });
  } else if (pencil) {
    line(ctx, `M${n(cx)} ${n(hemY - 22)}V${n(hemY + 2)}`, { width: 1.1 });
  }
  return [waistY - 2, hemY + 5];
}

function drawDress(ctx: Ctx): Bounds {
  const sleeve = sleeveFor(ctx, ctx.sub.includes("slip") ? "sleeveless" : "short");
  const shirt = ctx.sub.includes("shirt");
  const g = torso({ top: 34, hem: 112, half: fitWidth(ctx.fit, 32), hemHalf: 30, sleeve, neck: shirt ? "crew" : ctx.sub.includes("wrap") ? "v" : "scoop", depth: shirt ? 4 : undefined, neckHalf: ctx.sub.includes("slip") ? 18 : 13 });
  const long = ctx.sub.includes("midi") || ctx.sub.includes("maxi");
  const skirtHem = long ? 230 : 206;
  const skirt = `M${n(70)} ${n(108)}L${n(130)} ${n(108)}L${n(152)} ${n(skirtHem)}Q100 ${n(skirtHem + 6)} ${n(48)} ${n(skirtHem)}Z`;
  backNeck(ctx, g);
  shape(ctx, skirt);
  shape(ctx, g.d);
  if (shirt) {
    collarPoints(ctx, g, "point");
    placket(ctx, g, g.top + 8, 108, 5);
  }
  line(ctx, `M70 110Q100 114 130 110`, { width: 1.4 });
  if (ctx.sub.includes("wrap")) line(ctx, `M${n(g.cx + 12)} ${n(g.top)}L${n(g.cx - 26)} 110`, { width: 1.2 });
  cuffBands(ctx, g);
  return [g.top - 6, skirtHem + 4];
}

function drawSuit(ctx: Ctx, tux: boolean): Bounds {
  drawLegs(ctx, { kind: "trousers", waistY: 70, hemY: 232, noWaist: true });
  drawBlazer(ctx, { top: 22, hem: 162, satin: tux });
  if (tux) {
    shape(ctx, P([[90, 18], [100, 22], [110, 18], [110, 28], [100, 24], [90, 28]]), { fill: "#1c1b1a", plain: true, width: 1 });
  }
  return [14, 234];
}

/* ------------------------------------------------------------------ */
/* Templates: footwear (side profile, as a pair)                        */
/* ------------------------------------------------------------------ */

function soleColour(ctx: Ctx, kind: "sneaker" | "dress" | "boot" | "boat"): string {
  if (kind === "sneaker" || kind === "boat") return "#efeae0";
  if (kind === "boot" && /combat|work|hiking|lug/.test(ctx.sub)) return "#2a2320";
  return mix2(shade(ctx.base, -0.45), "#3a2a20");
}

function mix2(a: string, b: string) {
  const ah = normaliseHex(a);
  const bh = normaliseHex(b);
  const avg = (i: number) => Math.round((parseInt(ah.slice(i, i + 2), 16) + parseInt(bh.slice(i, i + 2), 16)) / 2);
  return "#" + [1, 3, 5].map((i) => avg(i).toString(16).padStart(2, "0")).join("");
}

function drawShoe(ctx: Ctx, kind: Template): Bounds {
  const parts = ctx.parts;
  // Back shoe: same drawing, offset up-left and dimmed with a silhouette overlay.
  ctx.parts = [];
  drawOneShoe(ctx, kind);
  const backShoe = ctx.parts.join("");
  ctx.parts = [];
  drawOneShoe(ctx, kind);
  const frontShoe = ctx.parts.join("");
  ctx.parts = parts;
  const silhouette = backShoe.replace(/fill="[^"]*"/g, 'fill="#000"').replace(/stroke="[^"]*"/g, 'stroke="none"');
  parts.push(`<g transform="translate(-16 -14)">${backShoe}<g opacity="0.14">${silhouette}</g></g>`);
  parts.push(`<g>${frontShoe}</g>`);
  const tall = kind === "boot" ? (/combat|hiking|work|lug/.test(ctx.sub) ? 76 : 90) : kind === "chelsea" ? 82 : kind === "sneaker" && /high/.test(ctx.sub) ? 94 : 116;
  return [tall - 16, 190];
}

function drawOneShoe(ctx: Ctx, kind: Template) {
  switch (kind) {
    case "sneaker": {
      const running = /running|trainer|runner/.test(ctx.sub);
      const high = ctx.details.height === "high" || ctx.details.height === "mid" || /high/.test(ctx.sub);
      const upper = high
        ? P([[42, 170], [42, 100], [50, 94], [82, 96], [88, 128], [120, 128], [146, 140], [168, 156], [170, 170]])
        : `M42 170L42 140Q44 128 56 126L70 128Q84 134 96 128Q120 124 142 138Q166 148 170 160L170 170Z`;
      shape(ctx, upper);
      const sole = running
        ? `M36 166L172 162Q178 172 170 184L44 186Q32 184 36 166Z`
        : `M36 168L172 168Q176 176 170 184L40 184Q34 180 36 168Z`;
      shape(ctx, sole, { fill: soleColour(ctx, "sneaker"), plain: true, width: 1.6 });
      line(ctx, running ? "M44 176Q100 170 168 172" : "M40 175H170", { width: 0.9, opacity: 0.5 });
      // toe cap
      shape(ctx, `M146 152Q160 150 170 160L170 168L142 168Q140 158 146 152Z`, { fill: soleColour(ctx, "sneaker"), plain: true, width: 1.2 });
      // laces
      const laces: string[] = [];
      const ly = high ? 100 : 130;
      for (let i = 0; i < (high ? 6 : 4); i++) {
        const x = high ? 84 + i * 6 : 92 + i * 9;
        const y = high ? ly + i * 6 : ly + i * 2.5;
        laces.push(`M${n(x - 3)} ${n(y - 2)}L${n(x + 5)} ${n(y + 3)}M${n(x + 5)} ${n(y - 2)}L${n(x - 3)} ${n(y + 3)}`);
      }
      line(ctx, laces.join(""), { stroke: "#f4f1ea", width: 1.6 });
      line(ctx, laces.join(""), { width: 0.5, opacity: 0.6 });
      // side stripe
      if (!/canvas|plimsoll/.test(ctx.sub)) line(ctx, "M72 160Q100 142 128 150", { stroke: ctx.second, width: 3.2, opacity: 0.9 });
      if (high) dot(ctx, 60, 120, 5, "#efeae0");
      return;
    }
    case "loafer": {
      const boat = /boat|deck/.test(ctx.sub);
      shape(ctx, `M44 172L44 146Q46 138 58 138Q80 142 100 142Q118 132 138 140Q160 148 167 160Q171 168 166 172Z`);
      shape(ctx, `M40 172L170 172Q172 178 166 180L42 180Q38 178 40 172Z`, { fill: soleColour(ctx, boat ? "boat" : "dress"), plain: true, width: 1.4 });
      if (!boat) shape(ctx, `M42 180L42 186L68 186L70 180Z`, { fill: soleColour(ctx, "dress"), plain: true, width: 1.2 });
      stitch(ctx, "M104 143Q128 128 156 152");
      if (boat) {
        line(ctx, "M50 140Q80 146 104 143", { stroke: "#c9a46b", width: 1.6 });
        dot(ctx, 104, 143, 1.6, "#c9a46b");
        line(ctx, "M104 143q6 8 -2 14", { stroke: "#c9a46b", width: 1.4 });
      } else if (/tassel/.test(ctx.sub)) {
        line(ctx, "M112 142q2 10 -2 16M116 141q4 10 2 17", { width: 1.4 });
        dot(ctx, 110, 158, 2);
        dot(ctx, 118, 158, 2);
      } else if (/horsebit|bit/.test(ctx.sub)) {
        line(ctx, "M100 145L126 139", { stroke: ctx.hardware, width: 2.4 });
      } else {
        // penny strap
        shape(ctx, "M96 146L130 138L132 144L98 152Z", { width: 1.2, extraShade: 0.12 });
        ctx.parts.push(`<ellipse cx="114" cy="144.5" rx="5" ry="1.8" fill="${ctx.inner}" transform="rotate(-13 114 144.5)"/>`);
      }
      return;
    }
    case "oxford": {
      const brogue = /brogue|wingtip/.test(ctx.sub);
      const derby = /derby|blucher|gibson/.test(ctx.sub);
      shape(ctx, `M44 172L44 142Q45 132 56 130Q74 134 92 140Q112 128 132 134Q156 142 166 158Q170 168 166 172Z`);
      shape(ctx, `M40 172L170 172Q172 178 166 180L42 180Q38 178 40 172Z`, { fill: soleColour(ctx, "dress"), plain: true, width: 1.4 });
      shape(ctx, `M42 180L42 187L68 187L70 180Z`, { fill: soleColour(ctx, "dress"), plain: true, width: 1.2 });
      // quarter / facing
      line(ctx, derby ? "M78 136Q86 152 112 150" : "M86 140Q92 150 112 146", { width: 1.2 });
      // laces
      const laces: string[] = [];
      for (let i = 0; i < 4; i++) laces.push(`M${n(94 + i * 5)} ${n(136 - i * 1.5)}l6 4`);
      line(ctx, laces.join(""), { stroke: shade(ctx.base, -0.5), width: 1.4 });
      // toe cap
      if (brogue) {
        line(ctx, "M138 136Q132 152 148 164M138 136Q150 150 166 162", { width: 1.1 });
        const dots: string[] = [];
        for (let i = 0; i < 9; i++) dots.push(`<circle cx="${n(137 - i * 0.2 + i * 1.3)}" cy="${n(140 + i * 3)}" r="0.7" fill="${ctx.outline}"/>`);
        ctx.parts.push(dots.join(""));
      } else {
        line(ctx, "M140 136Q146 154 150 172", { width: 1.1 });
      }
      return;
    }
    case "chelsea": {
      shape(ctx, `M46 172L46 98Q48 92 56 92L102 92Q106 94 106 102L108 128Q130 128 150 142Q168 154 168 166L166 172Z`);
      // elastic gusset
      shape(ctx, "M70 92L80 130L92 92Z", { fill: shade(ctx.base, -0.35), plain: true, width: 1.1 });
      line(ctx, "M74 95L80 120M80 94L80 124M86 95L80 120", { width: 0.5, opacity: 0.5 });
      // pull tab
      line(ctx, "M48 92Q48 78 56 82L56 94", { width: 1.6 });
      shape(ctx, `M40 172L172 172Q174 178 168 181L42 181Q38 178 40 172Z`, { fill: soleColour(ctx, "boot"), plain: true, width: 1.4 });
      shape(ctx, `M42 181L42 190L70 190L72 181Z`, { fill: soleColour(ctx, "boot"), plain: true, width: 1.2 });
      return;
    }
    case "boot": {
      const combat = /combat|hiking|work|lug/.test(ctx.sub);
      const top = combat ? 76 : 90;
      shape(ctx, `M46 172L46 ${top + 6}Q48 ${top} 58 ${top}L100 ${top}Q106 ${top + 2} 106 ${top + 10}L110 128Q134 128 152 142Q170 154 170 166L168 172Z`);
      // padded collar
      line(ctx, `M48 ${top + 8}Q74 ${top + 12} 104 ${top + 8}`, { width: 1.2, opacity: 0.6 });
      const eyelets: string[] = [];
      const steps = combat ? 8 : 6;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const x = 100 + t * 12;
        const y = top + 10 + t * (130 - top - 10);
        eyelets.push(`M${n(x - 6)} ${n(y)}L${n(x + 6)} ${n(y + 4)}`);
        ctx.parts.push(`<circle cx="${n(x - 6)}" cy="${n(y)}" r="1.1" fill="${ctx.hardware}"/>`);
      }
      line(ctx, eyelets.join(""), { stroke: shade(ctx.base, -0.5), width: 1.3 });
      line(ctx, "M124 132Q136 154 150 172", { width: 1.1, opacity: 0.6 });
      const sole = soleColour(ctx, "boot");
      shape(ctx, combat ? `M38 170L174 170Q178 180 170 188L42 188Q36 184 38 170Z` : `M40 172L172 172Q174 178 168 181L42 181Q38 178 40 172Z`, {
        fill: sole,
        plain: true,
        width: 1.4,
      });
      if (combat) {
        line(ctx, "M48 188v-5M62 188v-5M76 188v-5M90 188v-5M104 188v-5M118 188v-5M132 188v-5M146 188v-5M160 188v-5", { stroke: "#000", width: 2, opacity: 0.35 });
        stitch(ctx, "M44 174H170");
      } else {
        shape(ctx, `M42 181L42 190L70 190L72 181Z`, { fill: sole, plain: true, width: 1.2 });
      }
      return;
    }
    case "sandal": {
      shape(ctx, `M40 168L168 166Q174 174 166 178L44 180Q36 176 40 168Z`, { fill: "#b98b5c", plain: true, width: 1.4 });
      line(ctx, "M84 168Q96 132 118 166", { width: 9, stroke: ctx.outline });
      line(ctx, "M84 168Q96 132 118 166", { width: 6.5, stroke: ctx.base });
      line(ctx, "M126 166Q140 140 154 166", { width: 9, stroke: ctx.outline });
      line(ctx, "M126 166Q140 140 154 166", { width: 6.5, stroke: ctx.base });
      line(ctx, "M54 168Q48 146 70 148L84 156", { width: 6, stroke: ctx.outline });
      line(ctx, "M54 168Q48 146 70 148L84 156", { width: 3.6, stroke: ctx.base });
      return;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Templates: accessories                                              */
/* ------------------------------------------------------------------ */

function drawAccessory(ctx: Ctx, kind: Template): Bounds {
  switch (kind) {
    case "scarf": {
      shape(ctx, "M64 40Q100 70 136 40L140 54Q104 92 60 54Z", { extraShade: 0.06 });
      shape(ctx, "M76 64L104 70L100 198L74 196Z");
      shape(ctx, "M104 70L130 56L136 186L108 190Z", { extraShade: 0.08 });
      const fringe: string[] = [];
      for (let x = 75; x <= 99; x += 3) fringe.push(`M${n(x)} ${n(196 + (x - 75) * 0.08)}v9`);
      for (let x = 109; x <= 135; x += 3) fringe.push(`M${n(x)} ${n(190 - (x - 109) * 0.15)}v9`);
      line(ctx, fringe.join(""), { stroke: ctx.base, width: 1.4 });
      line(ctx, fringe.join(""), { width: 0.5, opacity: 0.5 });
      return [36, 208];
    }
    case "beanie": {
      shape(ctx, "M52 150Q48 66 100 64Q152 66 148 150Z");
      ribBand(ctx, 48, 152, 136, 32);
      if (/pom|bobble/.test(ctx.sub)) ctx.parts.push(`<circle cx="100" cy="58" r="14" fill="${ctx.second}" stroke="${ctx.outline}" stroke-width="1.6"/>`);
      return [44, 170];
    }
    case "cap": {
      if (/flat|newsboy|baker/.test(ctx.sub)) {
        shape(ctx, "M40 136Q48 92 104 90Q156 92 162 122Q170 136 150 140L60 146Q40 146 40 136Z");
        shape(ctx, "M120 132Q160 128 176 140Q170 150 146 148Z", { extraShade: 0.1 });
        line(ctx, "M60 120Q100 104 150 118", { width: 1, opacity: 0.4 });
        return [86, 152];
      }
      shape(ctx, "M48 150Q46 84 100 82Q150 84 152 146Z");
      shape(ctx, "M120 140Q164 132 184 150Q170 162 132 156Z", { extraShade: 0.1 });
      line(ctx, "M100 84V148M74 92Q84 120 82 148", { width: 1, opacity: 0.5 });
      dot(ctx, 100, 84, 3);
      return [78, 162];
    }
    case "hat": {
      if (/bucket/.test(ctx.sub)) {
        shape(ctx, "M68 132L74 82Q100 74 126 82L132 132Z");
        shape(ctx, "M44 150Q100 120 156 150Q100 162 44 150Z", { extraShade: 0.06 });
        return [76, 160];
      }
      shape(ctx, "M28 150Q100 124 172 150Q160 162 100 162Q40 162 28 150Z", { extraShade: 0.06 });
      shape(ctx, "M64 140L70 88Q84 74 100 84Q116 74 130 88L136 140Q100 148 64 140Z");
      shape(ctx, "M65.5 128Q100 136 134.5 128L135.5 140Q100 148 64.5 140Z", { fill: shade(ctx.base, -0.45), plain: true, width: 1.2 });
      line(ctx, "M88 86Q100 96 112 86", { width: 1.2, opacity: 0.6 });
      return [76, 164];
    }
    case "belt": {
      shape(ctx, "M30 112L170 112L170 132L30 132Z");
      ctx.parts.push(`<rect x="34" y="104" width="30" height="36" rx="4" fill="none" stroke="${ctx.hardware}" stroke-width="5"/><rect x="34" y="104" width="30" height="36" rx="4" fill="none" stroke="${ctx.outline}" stroke-width="0.8"/>`);
      line(ctx, "M48 122H70", { stroke: ctx.hardware, width: 2.4 });
      for (const x of [110, 124, 138, 152]) ctx.parts.push(`<circle cx="${x}" cy="122" r="2" fill="${ctx.inner}"/>`);
      stitch(ctx, "M70 115.5H168M70 128.5H168");
      return [100, 144];
    }
    case "tie": {
      if (/bow/.test(ctx.sub)) {
        shape(ctx, "M100 120L46 92L46 150Z");
        shape(ctx, "M100 120L154 92L154 150Z");
        shape(ctx, "M90 106H110V134H90Z", { extraShade: 0.12 });
        return [88, 154];
      }
      if (/pocket square/.test(ctx.sub)) {
        shape(ctx, "M60 120L80 70L100 104L120 66L140 120Z");
        shape(ctx, "M50 118H150V176H50Z", { fill: "#3a3330", plain: true });
        return [62, 180];
      }
      shape(ctx, "M88 28H112L106 52H94Z", { extraShade: 0.1 });
      shape(ctx, "M94 52H106L124 196L100 220L76 196Z");
      line(ctx, "M80 192L100 212L120 192", { width: 0.8, opacity: 0.4 });
      return [24, 222];
    }
    case "bag": {
      if (/backpack|rucksack/.test(ctx.sub)) {
        shape(ctx, "M50 70Q50 44 100 44Q150 44 150 70L152 200Q100 208 48 200Z");
        shape(ctx, "M64 128H136V188Q100 194 64 188Z", { extraShade: 0.08 });
        shape(ctx, "M56 76Q100 96 144 76L144 100Q100 116 56 100Z", { extraShade: 0.05 });
        line(ctx, "M84 44Q100 26 116 44", { width: 4 });
        return [26, 206];
      }
      if (/tote/.test(ctx.sub)) {
        line(ctx, "M74 92Q74 40 96 40M104 40Q126 40 126 92", { width: 5 });
        shape(ctx, "M48 92H152L160 200H40Z");
        return [36, 202];
      }
      line(ctx, "M58 96Q60 30 100 28Q140 30 142 96", { width: 4 });
      shape(ctx, "M40 96H160V196Q100 204 40 196Z");
      shape(ctx, "M40 96H160V140Q100 150 40 140Z", { extraShade: 0.1 });
      ctx.parts.push(`<rect x="70" y="128" width="12" height="16" rx="2" fill="none" stroke="${ctx.hardware}" stroke-width="2"/><rect x="118" y="128" width="12" height="16" rx="2" fill="none" stroke="${ctx.hardware}" stroke-width="2"/>`);
      return [26, 202];
    }
    case "watch": {
      shape(ctx, "M88 30H112V92H88Z");
      shape(ctx, "M88 148H112V210H88Z");
      ctx.parts.push(
        `<circle cx="100" cy="120" r="34" fill="${ctx.hardware}" stroke="${ctx.outline}" stroke-width="2"/><circle cx="100" cy="120" r="27" fill="#f4efe4" stroke="${ctx.outline}" stroke-width="1"/><path d="M100 120V100M100 120L114 128" stroke="${ctx.outline}" stroke-width="2" stroke-linecap="round"/><rect x="134" y="115" width="5" height="10" rx="1" fill="${ctx.hardware}" stroke="${ctx.outline}" stroke-width="0.8"/>`,
      );
      return [28, 212];
    }
    case "glasses": {
      const round = /round|panto/.test(ctx.sub);
      ctx.parts.push(
        round
          ? `<circle cx="66" cy="120" r="26" fill="#cfe0ea" fill-opacity="0.35" stroke="${ctx.base}" stroke-width="6"/><circle cx="134" cy="120" r="26" fill="#cfe0ea" fill-opacity="0.35" stroke="${ctx.base}" stroke-width="6"/>`
          : `<rect x="34" y="98" width="58" height="42" rx="12" fill="#cfe0ea" fill-opacity="0.35" stroke="${ctx.base}" stroke-width="6"/><rect x="108" y="98" width="58" height="42" rx="12" fill="#cfe0ea" fill-opacity="0.35" stroke="${ctx.base}" stroke-width="6"/>`,
      );
      line(ctx, "M92 114Q100 106 108 114", { stroke: ctx.base, width: 5 });
      line(ctx, "M36 106L16 100M164 106L184 100", { stroke: ctx.base, width: 4 });
      return [92, 148];
    }
    case "gloves": {
      const glove = "M60 200L58 140Q50 120 56 98L58 70Q62 62 68 70L70 100L72 60Q76 52 82 60L82 98L86 56Q90 48 96 56L94 100L100 66Q106 60 110 68L106 120Q118 106 126 112Q130 118 120 132L104 160L102 200Z";
      ctx.parts.push(`<g transform="translate(18 0)">`);
      shape(ctx, glove, { extraShade: 0.1 });
      ctx.parts.push(`</g><g transform="translate(-18 6)">`);
      shape(ctx, glove);
      ribBand(ctx, 58, 102, 186, 14);
      ctx.parts.push(`</g>`);
      return [48, 210];
    }
    default: {
      // jewellery: chain with pendant
      line(ctx, "M50 50Q100 170 150 50", { stroke: ctx.outline, width: 4 });
      line(ctx, "M50 50Q100 170 150 50", { stroke: ctx.hardware, width: 2.4, dash: "3 1.5" });
      ctx.parts.push(`<circle cx="100" cy="122" r="12" fill="${ctx.base}" stroke="${ctx.outline}" stroke-width="1.6"/>`);
      return [44, 140];
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

function sanitise(input: IllustrationInput) {
  const category = (CATEGORIES as readonly string[]).includes(input.category) ? input.category : "tops";
  const colours = (input.colours ?? []).slice(0, 4).map((c) => normaliseHex(c?.hex));
  const pattern = input.pattern && (PATTERNS as readonly string[]).includes(input.pattern) ? input.pattern : "solid";
  const sub = String(input.subcategory ?? "").toLowerCase().slice(0, 80);
  const name = String(input.name ?? "").toLowerCase().slice(0, 120);
  const materials = (input.materials ?? []).map((m) => String(m).toLowerCase().slice(0, 40)).slice(0, 8);
  const details = (input.details && typeof input.details === "object" ? input.details : {}) as GarmentDetails;
  return { category, colours, pattern, sub, name, materials, details, fit: input.fit ?? null, layeringRole: input.layeringRole ?? null };
}

/** Stable key: changes whenever an attribute that affects the drawing changes. */
export function illustrationKey(input: IllustrationInput): string {
  const s = sanitise(input);
  const sig = JSON.stringify([s.category, s.colours, s.pattern, s.sub, s.name, s.materials, s.details, s.fit]);
  return `v${RENDERER_VERSION}-${hashString(sig).toString(36)}`;
}

export function renderGarmentSvg(input: IllustrationInput, opts: { label?: string } = {}): string {
  const s = sanitise(input);
  const key = illustrationKey(input);
  const uid = `w${key.replace(/[^a-z0-9]/gi, "")}`;
  const base = s.colours[0] ?? "#8a8c8e";
  const second = s.colours[1] ?? contrastFor(base);
  const third = s.colours[2] ?? shade(second, 0.25);
  const texture: Texture = (s.details.texture as Texture | undefined) ?? textureFromMaterials(s.materials, s.name, s.sub);
  const template = templateFor({ ...input, category: s.category as Category, subcategory: s.sub, name: s.name });

  const defs: string[] = [shadeDef(`${uid}s`)];
  const verticalPattern = ["shirts", "trousers", "formalwear", "outerwear", "skirts"].includes(s.category);
  const pat = patternDef(`${uid}p`, s.pattern as Pattern, base, second, third, verticalPattern);
  if (pat) defs.push(pat);
  const tex = textureDef(`${uid}t`, texture, base, hashString(key));
  if (tex) defs.push(tex);

  const ctx: Ctx = {
    uid,
    base,
    second,
    third,
    outline: outlineFor(base),
    inner: shade(base, -0.32),
    hardware: s.category === "footwear" || s.category === "accessories" || texture === "leather" ? "#b59a5b" : shade(base, -0.4),
    stitch: texture === "denim" ? "#d39a4a" : shade(base, 0.35),
    fill: pat ? `url(#${uid}p)` : base,
    texture,
    texFill: tex ? `url(#${uid}t)` : null,
    shadeFill: `url(#${uid}s)`,
    defs,
    parts: [],
    details: s.details,
    fit: s.fit,
    sub: `${s.sub} ${s.name}`,
    pattern: s.pattern as Pattern,
    seed: hashString(key),
  };
  if (s.pattern === "colour-block") {
    defs.push(`<linearGradient id="${uid}cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="${base}"/><stop offset="0.5" stop-color="${second}"/></linearGradient>`);
    ctx.fill = `url(#${uid}cb)`;
  }
  if (template === "jewellery" || template === "watch") ctx.hardware = s.colours[0] ?? "#c7a14a";

  let bounds: Bounds;
  switch (template) {
    case "tee":
    case "polo":
    case "henley":
    case "tank":
    case "sweatshirt":
      bounds = drawTee(ctx, template);
      break;
    case "hoodie":
      bounds = drawHoodie(ctx);
      break;
    case "shirt":
      bounds = drawShirt(ctx);
      break;
    case "overshirt":
      bounds = drawShirt(ctx, true);
      break;
    case "jumper":
    case "turtleneck":
    case "quarter-zip":
    case "vest":
      bounds = drawJumper(ctx, template);
      break;
    case "cardigan":
      bounds = drawCardigan(ctx);
      break;
    case "waistcoat":
      bounds = drawWaistcoat(ctx);
      break;
    case "blazer":
      bounds = drawBlazer(ctx);
      break;
    case "overcoat":
    case "trench":
    case "peacoat":
      bounds = drawOvercoat(ctx, template);
      break;
    case "parka":
    case "puffer":
    case "bomber":
    case "denim-jacket":
    case "leather-jacket":
    case "field-jacket":
    case "harrington":
      bounds = drawCasualJacket(ctx, template);
      break;
    case "trousers":
    case "jeans":
      bounds = drawLegs(ctx, { kind: template });
      break;
    case "shorts":
      bounds = drawLegs(ctx, { kind: "shorts", waistY: 60 });
      break;
    case "skirt":
      bounds = drawSkirt(ctx);
      break;
    case "dress":
      bounds = drawDress(ctx);
      break;
    case "suit":
      bounds = drawSuit(ctx, ctx.sub.includes("tux") || ctx.sub.includes("dinner"));
      break;
    case "sneaker":
    case "loafer":
    case "oxford":
    case "chelsea":
    case "boot":
    case "sandal":
      bounds = drawShoe(ctx, template);
      break;
    default:
      bounds = drawAccessory(ctx, template);
  }

  const dy = Math.round((240 - (bounds[0] + bounds[1])) / 2);
  const label = (opts.label ?? input.name ?? template).toString().replace(/[<>&"']/g, "").slice(0, 120);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" role="img" aria-label="${label}">` +
    `<defs>${defs.join("")}</defs>` +
    `<ellipse cx="100" cy="${n(Math.min(236, bounds[1] + dy + 2))}" rx="62" ry="4" fill="#2a2420" opacity="0.08"/>` +
    `<g transform="translate(0 ${dy})">${ctx.parts.join("")}</g></svg>`
  );
}
