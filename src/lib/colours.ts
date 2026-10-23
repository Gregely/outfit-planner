/** Colour vocabulary, parsing and harmony helpers. Pure functions, safe on client and server. */

export type Colour = { name: string; hex: string };

export const NAMED_COLOURS: Record<string, string> = {
  black: "#1c1b1a",
  "jet black": "#141414",
  charcoal: "#36383b",
  graphite: "#45474b",
  slate: "#5b6470",
  grey: "#8a8c8e",
  gray: "#8a8c8e",
  "light grey": "#c3c4c4",
  "heather grey": "#a7a8aa",
  silver: "#b9bcbf",
  white: "#f7f6f2",
  "off-white": "#efebe1",
  ivory: "#f1ead8",
  cream: "#ece2c8",
  ecru: "#e3d9bf",
  oatmeal: "#d8cbb0",
  bone: "#ddd3bf",
  stone: "#bfb39b",
  sand: "#cdb98f",
  beige: "#d2bf9d",
  khaki: "#b2a174",
  tan: "#b98b5c",
  camel: "#b98a52",
  caramel: "#a86b34",
  cognac: "#94512a",
  rust: "#a1491f",
  terracotta: "#b25a3c",
  brown: "#6b4a32",
  "dark brown": "#43301f",
  "chocolate brown": "#3f2a1d",
  chocolate: "#3f2a1d",
  "mid brown": "#7a5638",
  taupe: "#8b7d6b",
  mocha: "#6e5444",
  espresso: "#2f221b",
  walnut: "#5d4130",
  oxblood: "#5a1a1b",
  burgundy: "#6a1f2b",
  maroon: "#5f1c24",
  wine: "#64212f",
  claret: "#7a2232",
  red: "#a8302c",
  brick: "#8f3b2c",
  coral: "#d9725d",
  pink: "#d9a3a8",
  "dusty pink": "#c79b98",
  rose: "#b86b77",
  mauve: "#9d7b8b",
  plum: "#583246",
  aubergine: "#3f2537",
  purple: "#5b3f78",
  lavender: "#b4a6cc",
  orange: "#cf6d2c",
  mustard: "#c49a2a",
  ochre: "#b7852c",
  gold: "#c7a14a",
  yellow: "#e2c34a",
  butter: "#ecd99a",
  olive: "#5f6136",
  "olive green": "#5f6136",
  sage: "#93a083",
  moss: "#5b6b3c",
  "forest green": "#2f4a33",
  "bottle green": "#1f3d2c",
  "racing green": "#1d3a2a",
  "hunter green": "#2f4b37",
  green: "#3f6b45",
  emerald: "#2d6a4f",
  teal: "#2c6e6c",
  petrol: "#24505a",
  navy: "#1f2a44",
  "midnight blue": "#1a2238",
  "dark navy": "#171f33",
  indigo: "#2d3a63",
  "denim blue": "#3f5f87",
  denim: "#3f5f87",
  "raw denim": "#26324d",
  "light wash": "#8aa4c2",
  "mid blue": "#4a6fa0",
  blue: "#3a5f95",
  cobalt: "#2f50a0",
  "royal blue": "#2b4a9b",
  "light blue": "#a9c1dc",
  "sky blue": "#9fc0e0",
  "powder blue": "#b9cde2",
  "pale blue": "#c5d6e8",
  "steel blue": "#5a7894",
};

const MODIFIERS: Record<string, (hex: string) => string> = {
  dark: (h) => shade(h, -0.28),
  deep: (h) => shade(h, -0.22),
  light: (h) => shade(h, 0.3),
  pale: (h) => shade(h, 0.38),
  washed: (h) => desaturate(shade(h, 0.15), 0.3),
  faded: (h) => desaturate(shade(h, 0.18), 0.35),
  muted: (h) => desaturate(h, 0.3),
  dusty: (h) => desaturate(h, 0.35),
};

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

export function normaliseHex(value: string | null | undefined, fallback = "#8a8c8e"): string {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (HEX_RE.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return fallback;
}

function clamp(n: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, n));
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normaliseHex(hex);
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(clamp(v, 0, 255))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number] = [0, 0, 0];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

/** Lighten (amount > 0) or darken (amount < 0) a colour. */
export function shade(hex: string, amount: number) {
  const { h, s, l } = hexToHsl(hex);
  const nl = amount >= 0 ? l + (1 - l) * amount : l * (1 + amount);
  return hslToHex(h, s, clamp(nl));
}

export function desaturate(hex: string, amount: number) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, clamp(s * (1 - amount)), l);
}

export function mix(a: string, b: string, t = 0.5) {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex(ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, ra[2] + (rb[2] - ra[2]) * t);
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Best-effort lookup of a colour phrase such as "dark brown, almost charcoal". Returns null if unknown. */
export function resolveColourName(phrase: string): string | null {
  const text = phrase.toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (NAMED_COLOURS[text]) return NAMED_COLOURS[text];
  // Find all known colour names in the phrase, longest first, without overlap.
  const names = Object.keys(NAMED_COLOURS).sort((a, b) => b.length - a.length);
  const found: { name: string; index: number }[] = [];
  let remaining = ` ${text} `;
  for (const name of names) {
    const idx = remaining.indexOf(` ${name} `);
    if (idx >= 0) {
      found.push({ name, index: idx });
      remaining = remaining.slice(0, idx) + " " + "#".repeat(name.length) + " " + remaining.slice(idx + name.length + 2);
    }
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.index - b.index);
  let hex = NAMED_COLOURS[found[0].name];
  // "almost X", "with a hint of X", "verging on X" pull the colour towards the second one.
  if (found.length > 1) {
    const pull = /almost|nearly|verging|bordering|hint|towards|close to|between/.test(text) ? 0.4 : 0.5;
    hex = mix(hex, NAMED_COLOURS[found[1].name], pull);
  }
  for (const [mod, fn] of Object.entries(MODIFIERS)) {
    if (new RegExp(`\\b${mod}\\b`).test(text) && !found[0].name.includes(mod)) {
      hex = fn(hex);
      break;
    }
  }
  return hex;
}

/** Turn a colour name (and optional hex) into a Colour, guessing hex from the name if needed. */
export function toColour(name: string, hex?: string | null): Colour {
  const clean = name.trim().slice(0, 60) || "unspecified";
  const resolved = isHex(hex ?? "") ? normaliseHex(hex) : (resolveColourName(clean) ?? "#8a8c8e");
  return { name: clean, hex: resolved };
}

/** Neutrals combine with anything: blacks, whites, greys, navies, browns, beiges, olive-drab, denim. */
export function isNeutral(hex: string): boolean {
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.18 || l < 0.16 || l > 0.9) return true;
  // earthy browns / camels / khakis
  if (h >= 15 && h <= 50 && s < 0.6 && l < 0.75) return true;
  // navy & denim
  if (h >= 200 && h <= 235 && (l < 0.35 || s < 0.45)) return true;
  // olive / drab greens
  if (h >= 50 && h <= 90 && s < 0.4 && l < 0.5) return true;
  return false;
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Score how well a set of colours sits together (0..1). Neutrals are free; accent colours
 * work best as one hue, an analogous pair, or a complementary pair.
 */
export function harmonyScore(hexes: string[]): number {
  const accents = hexes.filter((h) => !isNeutral(h)).map(hexToHsl);
  if (accents.length <= 1) return 1;
  let score = 1;
  for (let i = 0; i < accents.length; i++) {
    for (let j = i + 1; j < accents.length; j++) {
      const d = hueDistance(accents[i].h, accents[j].h);
      if (d < 30) score -= 0.02; // tonal
      else if (d < 60) score -= 0.05; // analogous
      else if (d > 150) score -= 0.12; // complementary – bold but valid
      else score -= 0.3; // awkward triad-ish clash
      // two saturated, bright accents compete
      if (accents[i].s > 0.6 && accents[j].s > 0.6 && accents[i].l > 0.35 && accents[j].l > 0.35) score -= 0.15;
    }
  }
  if (accents.length > 2) score -= 0.15 * (accents.length - 2);
  return clamp(score);
}

/** Pick a readable text colour for a swatch background. */
export function inkFor(hex: string) {
  return luminance(hex) > 0.4 ? "#1c1b1a" : "#f7f6f2";
}
