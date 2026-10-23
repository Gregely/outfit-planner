/**
 * Factual garment knowledge shared by the import paths: brands, sportswear cues, and typical
 * warmth / formality by garment type. This describes what a garment *is*; it deliberately
 * knows nothing about anyone's taste. Estimates are always flagged for review.
 */
import type { Category } from "./domain";

/** Common brands, matched as whole words (case-insensitive) and stored with this spelling. */
export const BRANDS = [
  "Nike", "Adidas", "Puma", "Reebok", "New Balance", "Asics", "Under Armour", "Lululemon", "Gymshark", "Fila", "Hoka",
  "On Running", "Salomon", "Columbia", "The North Face", "North Face", "Patagonia", "Arc'teryx", "Converse", "Vans",
  "Dr. Martens", "Dr Martens", "Timberland", "Birkenstock", "Crocs", "UGG", "Clarks", "Levi's", "Levis", "Wrangler",
  "Carhartt", "Dickies", "Uniqlo", "Zara", "H&M", "Arket", "Primark", "Marks & Spencer", "Ralph Lauren", "Tommy Hilfiger",
  "Lacoste", "Fred Perry", "Barbour", "Burberry", "Gucci", "Prada", "Supreme", "Stüssy", "Stussy", "Hollister", "Abercrombie",
  "Superdry", "Calvin Klein", "Hugo Boss", "Diesel", "Everlane",
] as const;

const SPORT_BRANDS = /\b(nike|adidas|puma|reebok|new balance|asics|under armour|lululemon|gymshark|fila|hoka|on running|salomon)\b/;
const SPORT_WORDS =
  /\b(athletic|athletics|sport|sports|sporty|gym|training|workout|running|runner|jogging|basketball|football|soccer|tennis|cycling|yoga|track|activewear|sportswear|performance|dri-?fit|climalite|moisture-wicking|compression)\b/;
const TECHNICAL_FABRICS = /\b(mesh|spandex|lycra|elastane|dri-?fit)\b/;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The brand named in a piece of text, if any. */
export function detectBrand(text: string): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const b of [...BRANDS].sort((a, z) => z.length - a.length)) {
    if (new RegExp(`[^a-z]${escape(b.toLowerCase())}(?=[^a-z])`).test(t)) {
      return b === "Levis" ? "Levi's" : b === "North Face" ? "The North Face" : b === "Dr Martens" ? "Dr. Martens" : b === "Stussy" ? "Stüssy" : b;
    }
  }
  return null;
}

/** True when the description points to sportswear (a sport word, a sports brand, or technical fabric). */
export function isAthletic(text: string): boolean {
  const t = text.toLowerCase();
  return SPORT_WORDS.test(t) || SPORT_BRANDS.test(t) || TECHNICAL_FABRICS.test(t);
}

type Traits = { warmth: number; formality: number };

/** [pattern over "subcategory name materials", warmth, formality] – first match wins. */
const TYPE_TRAITS: [RegExp, number | null, number | null][] = [
  [/\b(tuxedo|dinner suit|ball ?gown|evening gown)\b/, 3, 5],
  [/\b(suit|waistcoat|bow tie|tie)\b/, null, 5],
  [/\b(sports bra|leggings|bike shorts|cycling shorts)\b/, 1, 1],
  [/\b(athletic|running|gym|track|training|basketball|football|tennis) (shorts|top|tee|t-shirt|tank)\b/, 1, 1],
  [/\b(track ?(pants|suit|jacket|top)|sweatpants|joggers|tracksuit)\b/, 2, 1],
  [/\b(hoodie|sweatshirt)\b/, 3, 1],
  [/\b(flip-?flops|slides|swim)\b/, 1, 1],
  [/\b(puffer|down jacket|parka)\b/, 5, 2],
  [/\b(overcoat|wool coat|peacoat|pea coat|duffle)\b/, 5, 4],
  [/\b(trench|raincoat|rain jacket|mac)\b/, 3, 3],
  [/\b(blazer|sport coat|sports jacket)\b/, 3, 4],
  [/\b(fleece|windbreaker|anorak|gilet)\b/, 3, 2],
  [/\b(denim jacket|bomber|harrington|field jacket|chore|leather jacket)\b/, 3, 2],
  [/\b(dress shirt|tailored trousers|dress trousers|pencil skirt|heels|pumps|oxford shoes|derby|brogues)\b/, 2, 4],
  [/\b(shorts)\b/, 1, 2],
  [/\b(tank|camisole|crop top|vest top)\b/, 1, 2],
  [/\b(t-shirt|tee)\b/, 1, 2],
  [/\b(jeans|denim)\b/, 3, 2],
  [/\b(cargo|canvas|sneakers|trainers|baseball cap|beanie)\b/, null, 2],
  [/\b(sandals)\b/, 1, 2],
  [/\b(linen)\b/, 1, null],
  [/\b(cable|chunky|cashmere|wool jumper|wool sweater)\b/, 4, 3],
  [/\b(boots)\b/, 4, null],
  [/\b(scarf|gloves|mittens)\b/, 3, null],
];

const CATEGORY_TRAITS: Record<Category, Traits> = {
  tops: { warmth: 2, formality: 2 },
  shirts: { warmth: 2, formality: 3 },
  knitwear: { warmth: 3, formality: 3 },
  trousers: { warmth: 3, formality: 3 },
  shorts: { warmth: 1, formality: 2 },
  skirts: { warmth: 2, formality: 3 },
  dresses: { warmth: 2, formality: 3 },
  outerwear: { warmth: 4, formality: 3 },
  footwear: { warmth: 2, formality: 3 },
  accessories: { warmth: 1, formality: 3 },
  formalwear: { warmth: 3, formality: 5 },
};

/** Typical warmth and formality for a garment type, used only when the description doesn't say. */
export function estimateTraits(g: { category: Category; subcategory?: string | null; name?: string | null; materials?: string[] }): Traits {
  const text = `${g.subcategory ?? ""} ${g.name ?? ""} ${(g.materials ?? []).join(" ")}`.toLowerCase();
  const base = { ...CATEGORY_TRAITS[g.category] };
  let warmth: number | null = null;
  let formality: number | null = null;
  for (const [re, w, f] of TYPE_TRAITS) {
    if (!re.test(text)) continue;
    if (warmth === null && w !== null) warmth = w;
    if (formality === null && f !== null) formality = f;
    if (warmth !== null && formality !== null) break;
  }
  if (formality === null && isAthletic(text)) formality = 1;
  return { warmth: warmth ?? base.warmth, formality: formality ?? base.formality };
}
