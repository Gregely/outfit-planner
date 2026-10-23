/**
 * SVG <defs> for fabric patterns, textures and shading. Every value interpolated into
 * markup is either a number or a hex colour that has been normalised, so the output
 * can't carry injected markup.
 */
import type { Pattern } from "@/lib/domain";
import { hexToHsl, luminance, mix, normaliseHex, shade } from "@/lib/colours";

export type Texture =
  | "smooth"
  | "denim"
  | "knit"
  | "cable"
  | "rib"
  | "corduroy"
  | "leather"
  | "suede"
  | "tweed"
  | "quilted"
  | "linen"
  | "fleece"
  | "canvas";

export const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** Deterministic PRNG so the same garment always draws the same tweed flecks. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A second colour that reads against the base when the user gave only one. */
export function contrastFor(base: string) {
  const { l } = hexToHsl(base);
  return l > 0.55 ? shade(base, -0.45) : shade(base, 0.55);
}

export function outlineFor(base: string) {
  return mix(shade(base, -0.55), "#2a2420", 0.45);
}

export function patternDef(
  id: string,
  pattern: Pattern,
  base: string,
  second: string,
  third: string,
  vertical: boolean,
): string | null {
  const b = normaliseHex(base);
  const s = normaliseHex(second);
  const t = normaliseHex(third);
  const rot = vertical ? "" : ` patternTransform="rotate(90)"`;
  switch (pattern) {
    case "stripes":
      return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"${rot}><rect width="12" height="12" fill="${b}"/><rect width="4" height="12" fill="${s}"/></pattern>`;
    case "pinstripe":
      return `<pattern id="${id}" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="${b}"/><rect width="0.9" height="9" fill="${s}" opacity="0.8"/></pattern>`;
    case "gingham":
      return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${b}"/><rect width="6" height="12" fill="${s}" opacity="0.5"/><rect width="12" height="6" fill="${s}" opacity="0.5"/></pattern>`;
    case "check":
      return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${b}"/><rect width="16" height="1.4" y="7" fill="${s}" opacity="0.75"/><rect width="1.4" height="16" x="7" fill="${s}" opacity="0.75"/></pattern>`;
    case "plaid":
      return `<pattern id="${id}" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="${b}"/><rect width="10" height="28" x="4" fill="${s}" opacity="0.45"/><rect width="28" height="10" y="4" fill="${s}" opacity="0.45"/><rect width="1.4" height="28" x="20" fill="${t}" opacity="0.8"/><rect width="28" height="1.4" y="20" fill="${t}" opacity="0.8"/></pattern>`;
    case "houndstooth":
      return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${b}"/><path d="M0 0h5v5H0zM5 5l2.5-2.5L10 5 7.5 7.5zM0 5l2.5 2.5L0 10zM5 0l2.5 0-2.5 2.5z" fill="${s}"/></pattern>`;
    case "herringbone":
      return `<pattern id="${id}" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="4" fill="${b}"/><path d="M0 4L3 0M3 0l3 4" stroke="${s}" stroke-width="0.6" opacity="0.22" fill="none"/></pattern>`;
    case "polka-dot":
      return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill="${b}"/><circle cx="3.5" cy="3.5" r="2" fill="${s}"/><circle cx="10.5" cy="10.5" r="2" fill="${s}"/></pattern>`;
    case "floral":
      return `<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${b}"/>${flower(7, 7, s, t)}${flower(18, 17, s, t)}<path d="M10 9q4 4 6 6" stroke="${t}" stroke-width="0.8" fill="none" opacity="0.6"/></pattern>`;
    case "paisley":
      return `<pattern id="${id}" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="${b}"/><path d="M8 4c6 0 8 8 3 12-3 2-6 0-5-3 1-2 4-1 3 1" fill="none" stroke="${s}" stroke-width="1.4"/><path d="M19 15c5 0 6 7 2 9-2 1-4 0-4-2" fill="none" stroke="${t}" stroke-width="1.2"/></pattern>`;
    case "fair-isle":
      return `<pattern id="${id}" width="16" height="20" patternUnits="userSpaceOnUse"><rect width="16" height="20" fill="${b}"/><path d="M8 2l4 4-4 4-4-4z" fill="${s}"/><rect y="13" width="16" height="2" fill="${t}" opacity="0.8"/><circle cx="2" cy="17.5" r="1" fill="${s}"/><circle cx="10" cy="17.5" r="1" fill="${s}"/></pattern>`;
    case "camo":
      return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${b}"/><path d="M2 6c6-4 12 0 10 6s-10 6-12 0zM22 20c8-3 14 3 10 8s-12 4-12-2zM6 28c5-2 9 2 6 6s-9 2-8-2z" fill="${s}"/><path d="M26 4c4-1 7 2 5 5s-7 2-6-1zM14 18c3-1 5 2 3 4s-5 1-4-1z" fill="${t}"/></pattern>`;
    default:
      return null;
  }
}

function flower(x: number, y: number, petal: string, centre: string) {
  const petals = [0, 72, 144, 216, 288]
    .map((deg) => {
      const r = (deg * Math.PI) / 180;
      return `<circle cx="${n(x + Math.cos(r) * 2.4)}" cy="${n(y + Math.sin(r) * 2.4)}" r="1.7" fill="${petal}"/>`;
    })
    .join("");
  return `${petals}<circle cx="${x}" cy="${y}" r="1.1" fill="${centre}"/>`;
}

export function textureDef(id: string, texture: Texture, base: string, seed: number): string | null {
  const dark = luminance(base) < 0.12;
  const ink = dark ? "#ffffff" : "#000000";
  const light = "#ffffff";
  switch (texture) {
    case "denim":
      return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 4L4 0" stroke="${light}" stroke-width="0.6" opacity="0.28"/><path d="M-1 1L1 -1M3 5L5 3" stroke="${light}" stroke-width="0.6" opacity="0.28"/></pattern>`;
    case "knit":
      return `<pattern id="${id}" width="6" height="5" patternUnits="userSpaceOnUse"><path d="M0 0l3 3 3-3" stroke="${ink}" stroke-width="0.6" fill="none" opacity="0.16"/></pattern>`;
    case "cable":
      return `<pattern id="${id}" width="18" height="16" patternUnits="userSpaceOnUse"><path d="M5 0c4 4 4 4 0 8s-4 4 0 8M9 0c-4 4-4 4 0 8s4 4 0 8" stroke="${ink}" stroke-width="1.1" fill="none" opacity="0.2"/><path d="M15 0v16" stroke="${ink}" stroke-width="0.6" opacity="0.16"/></pattern>`;
    case "rib":
      return `<pattern id="${id}" width="3.5" height="10" patternUnits="userSpaceOnUse"><rect width="1" height="10" fill="${ink}" opacity="0.14"/></pattern>`;
    case "corduroy":
      return `<pattern id="${id}" width="4" height="10" patternUnits="userSpaceOnUse"><rect width="1.5" height="10" fill="${ink}" opacity="0.18"/><rect x="2" width="0.8" height="10" fill="${light}" opacity="0.1"/></pattern>`;
    case "leather":
      return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.35" stop-color="#fff" stop-opacity="0.02"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.12"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></linearGradient>`;
    case "suede":
    case "fleece": {
      const r = prng(seed);
      const dots = Array.from({ length: 14 }, () => `<circle cx="${n(r() * 12)}" cy="${n(r() * 12)}" r="${n(0.3 + r() * 0.4)}" fill="${r() > 0.5 ? ink : light}" opacity="0.18"/>`).join("");
      return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse">${dots}</pattern>`;
    }
    case "tweed": {
      const r = prng(seed);
      const flecks = Array.from({ length: 22 }, () => {
        const x = r() * 16;
        const y = r() * 16;
        const len = 0.8 + r() * 1.6;
        const col = r() > 0.6 ? "#d9c7a0" : r() > 0.5 ? ink : "#7b3b2a";
        return `<path d="M${n(x)} ${n(y)}l${n(len)} ${n(len * 0.4)}" stroke="${col}" stroke-width="0.7" opacity="0.32"/>`;
      }).join("");
      return `<pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse">${flecks}</pattern>`;
    }
    case "quilted":
      return `<pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0L14 14M14 0L0 14" stroke="${ink}" stroke-width="0.7" opacity="0.18"/></pattern>`;
    case "linen":
      return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1.5h6M1.5 0v6" stroke="${ink}" stroke-width="0.4" opacity="0.1"/><path d="M0 4.5h3" stroke="${light}" stroke-width="0.5" opacity="0.18"/></pattern>`;
    case "canvas":
      return `<pattern id="${id}" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 1.5h3M1.5 0v3" stroke="${ink}" stroke-width="0.3" opacity="0.12"/></pattern>`;
    default:
      return null;
  }
}

export function shadeDef(id: string) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="0.75" stop-color="#000" stop-opacity="0.04"/><stop offset="1" stop-color="#000" stop-opacity="0.16"/></linearGradient>`;
}

export function textureFromMaterials(materials: string[], name: string, subcategory: string): Texture {
  const text = `${materials.join(" ")} ${name} ${subcategory}`.toLowerCase();
  if (/denim|jean/.test(text)) return "denim";
  if (/cord/.test(text)) return "corduroy";
  if (/suede|nubuck/.test(text)) return "suede";
  if (/leather|patent/.test(text)) return "leather";
  if (/tweed|harris|donegal|boucl/.test(text)) return "tweed";
  if (/cable|aran|fisherman/.test(text)) return "cable";
  if (/puffer|quilt|down/.test(text)) return "quilted";
  if (/linen/.test(text)) return "linen";
  if (/fleece|sherpa|teddy/.test(text)) return "fleece";
  if (/canvas|duck/.test(text)) return "canvas";
  if (/rib/.test(text)) return "rib";
  if (/knit|wool jumper|cashmere|merino|lambswool|mohair|jumper|sweater|cardigan|turtleneck/.test(text)) return "knit";
  return "smooth";
}
