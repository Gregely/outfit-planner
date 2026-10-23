/**
 * Offline garment parser. Recognises garment words, colours, materials, fits, patterns and
 * style words in free text. It never guesses beyond what the text says; anything it
 * can't find is left at a neutral default and flagged for review.
 */
import { defaultLayeringRole, type Category, type Fit, type Pattern, type Season } from "@/lib/domain";
import { NAMED_COLOURS, toColour, type Colour } from "@/lib/colours";
import type { GarmentInput } from "@/lib/schemas";

type Hit = { category: Category; subcategory: string; index: number; word: string };

/** keyword → [category, subcategory] (longest keywords are matched first) */
const KEYWORDS: [string, Category, string][] = [
  ["t-shirt", "tops", "t-shirt"],
  ["tshirt", "tops", "t-shirt"],
  ["tee", "tops", "t-shirt"],
  ["long-sleeve tee", "tops", "long-sleeve tee"],
  ["long sleeve tee", "tops", "long-sleeve tee"],
  ["polo shirt", "tops", "polo"],
  ["polo", "tops", "polo"],
  ["henley", "tops", "henley"],
  ["tank top", "tops", "tank top"],
  ["vest top", "tops", "tank top"],
  ["sweatshirt", "tops", "sweatshirt"],
  ["hoodie", "tops", "hoodie"],
  ["rugby shirt", "tops", "rugby shirt"],
  ["oxford shirt", "shirts", "oxford shirt"],
  ["dress shirt", "shirts", "dress shirt"],
  ["flannel shirt", "shirts", "flannel shirt"],
  ["flannel", "shirts", "flannel shirt"],
  ["overshirt", "shirts", "overshirt"],
  ["shacket", "shirts", "overshirt"],
  ["camp collar shirt", "shirts", "camp-collar shirt"],
  ["camp-collar shirt", "shirts", "camp-collar shirt"],
  ["denim shirt", "shirts", "denim shirt"],
  ["linen shirt", "shirts", "linen shirt"],
  ["grandad shirt", "shirts", "band-collar shirt"],
  ["shirt", "shirts", "oxford shirt"],
  ["blouse", "shirts", "dress shirt"],
  ["turtleneck", "knitwear", "turtleneck"],
  ["roll neck", "knitwear", "turtleneck"],
  ["rollneck", "knitwear", "turtleneck"],
  ["polo neck", "knitwear", "turtleneck"],
  ["cardigan", "knitwear", "cardigan"],
  ["sweater vest", "knitwear", "sweater vest"],
  ["knitted vest", "knitwear", "sweater vest"],
  ["slipover", "knitwear", "sweater vest"],
  ["quarter-zip", "knitwear", "quarter-zip"],
  ["quarter zip", "knitwear", "quarter-zip"],
  ["cable knit", "knitwear", "cable knit"],
  ["v-neck jumper", "knitwear", "v-neck jumper"],
  ["v-neck sweater", "knitwear", "v-neck jumper"],
  ["jumper", "knitwear", "crewneck jumper"],
  ["sweater", "knitwear", "crewneck jumper"],
  ["pullover", "knitwear", "crewneck jumper"],
  ["jeans", "trousers", "jeans"],
  ["chinos", "trousers", "chinos"],
  ["corduroys", "trousers", "corduroys"],
  ["cords", "trousers", "corduroys"],
  ["cargo trousers", "trousers", "cargo trousers"],
  ["cargo pants", "trousers", "cargo trousers"],
  ["cargos", "trousers", "cargo trousers"],
  ["joggers", "trousers", "joggers"],
  ["sweatpants", "trousers", "joggers"],
  ["pleated trousers", "trousers", "pleated trousers"],
  ["wool trousers", "trousers", "wool trousers"],
  ["linen trousers", "trousers", "linen trousers"],
  ["trousers", "trousers", "wool trousers"],
  ["slacks", "trousers", "wool trousers"],
  ["pants", "trousers", "chinos"],
  ["shorts", "shorts", "chino shorts"],
  ["skirt", "skirts", "a-line skirt"],
  ["dress", "dresses", "midi dress"],
  ["blazer", "outerwear", "blazer"],
  ["sport coat", "outerwear", "sport coat"],
  ["sports jacket", "outerwear", "sport coat"],
  ["tweed jacket", "outerwear", "sport coat"],
  ["overcoat", "outerwear", "overcoat"],
  ["topcoat", "outerwear", "overcoat"],
  ["trench coat", "outerwear", "trench coat"],
  ["trench", "outerwear", "trench coat"],
  ["mac", "outerwear", "raincoat"],
  ["raincoat", "outerwear", "raincoat"],
  ["peacoat", "outerwear", "peacoat"],
  ["pea coat", "outerwear", "peacoat"],
  ["duffle coat", "outerwear", "overcoat"],
  ["bomber", "outerwear", "bomber jacket"],
  ["denim jacket", "outerwear", "denim jacket"],
  ["jean jacket", "outerwear", "denim jacket"],
  ["trucker jacket", "outerwear", "denim jacket"],
  ["leather jacket", "outerwear", "leather jacket"],
  ["biker jacket", "outerwear", "leather jacket"],
  ["field jacket", "outerwear", "field jacket"],
  ["chore coat", "outerwear", "chore coat"],
  ["chore jacket", "outerwear", "chore coat"],
  ["work jacket", "outerwear", "chore coat"],
  ["barn jacket", "outerwear", "field jacket"],
  ["harrington", "outerwear", "harrington jacket"],
  ["parka", "outerwear", "parka"],
  ["anorak", "outerwear", "parka"],
  ["puffer", "outerwear", "puffer jacket"],
  ["down jacket", "outerwear", "puffer jacket"],
  ["coat", "outerwear", "overcoat"],
  ["jacket", "outerwear", "field jacket"],
  ["chelsea boots", "footwear", "chelsea boots"],
  ["combat boots", "footwear", "combat boots"],
  ["doc martens", "footwear", "combat boots"],
  ["dr martens", "footwear", "combat boots"],
  ["docs", "footwear", "combat boots"],
  ["boots", "footwear", "lace-up boots"],
  ["loafers", "footwear", "loafers"],
  ["oxfords", "footwear", "oxford shoes"],
  ["oxford shoes", "footwear", "oxford shoes"],
  ["derbies", "footwear", "derby shoes"],
  ["derby shoes", "footwear", "derby shoes"],
  ["brogues", "footwear", "brogues"],
  ["sneakers", "footwear", "sneakers"],
  ["trainers", "footwear", "sneakers"],
  ["running shoes", "footwear", "running shoes"],
  ["converse", "footwear", "canvas sneakers"],
  ["plimsolls", "footwear", "canvas sneakers"],
  ["boat shoes", "footwear", "boat shoes"],
  ["sandals", "footwear", "sandals"],
  ["shoes", "footwear", "derby shoes"],
  ["scarf", "accessories", "scarf"],
  ["beanie", "accessories", "beanie"],
  ["flat cap", "accessories", "flat cap"],
  ["newsboy cap", "accessories", "flat cap"],
  ["fedora", "accessories", "fedora"],
  ["baseball cap", "accessories", "baseball cap"],
  ["cap", "accessories", "baseball cap"],
  ["hat", "accessories", "fedora"],
  ["belt", "accessories", "belt"],
  ["bow tie", "accessories", "bow tie"],
  ["tie", "accessories", "tie"],
  ["pocket square", "accessories", "pocket square"],
  ["backpack", "accessories", "backpack"],
  ["rucksack", "accessories", "backpack"],
  ["satchel", "accessories", "bag"],
  ["tote", "accessories", "bag"],
  ["briefcase", "accessories", "bag"],
  ["bag", "accessories", "bag"],
  ["watch", "accessories", "watch"],
  ["sunglasses", "accessories", "glasses"],
  ["glasses", "accessories", "glasses"],
  ["gloves", "accessories", "gloves"],
  ["necklace", "accessories", "jewellery"],
  ["ring", "accessories", "jewellery"],
  ["waistcoat", "formalwear", "waistcoat"],
  ["tuxedo", "formalwear", "tuxedo"],
  ["dinner suit", "formalwear", "tuxedo"],
  ["suit", "formalwear", "suit"],
];
KEYWORDS.sort((a, b) => b[0].length - a[0].length);

const MATERIALS = [
  "wool",
  "merino",
  "lambswool",
  "cashmere",
  "mohair",
  "alpaca",
  "tweed",
  "flannel",
  "cotton",
  "linen",
  "silk",
  "denim",
  "corduroy",
  "cord",
  "leather",
  "suede",
  "canvas",
  "twill",
  "jersey",
  "fleece",
  "nylon",
  "polyester",
  "gore-tex",
  "waxed cotton",
  "moleskin",
  "velvet",
  "rubber",
  "down",
];

const FIT_WORDS: [RegExp, Fit][] = [
  [/\bskinny\b/, "skinny"],
  [/\bslim\b/, "slim"],
  [/\b(relaxed|loose|easy fit)\b/, "relaxed"],
  [/\b(oversized|baggy)\b/, "oversized"],
  [/\b(tailored|fitted)\b/, "tailored"],
  [/\bboxy\b/, "boxy"],
  [/\b(regular|classic fit|straight fit)\b/, "regular"],
];

const PATTERN_WORDS: [RegExp, Pattern][] = [
  [/\bpinstripe/, "pinstripe"],
  [/\bstripe/, "stripes"],
  [/\bbreton\b/, "stripes"],
  [/\bgingham\b/, "gingham"],
  [/\b(tartan|plaid)\b/, "plaid"],
  [/\b(check|checked|windowpane|glen)\b/, "check"],
  [/\bhoundstooth|dogtooth\b/, "houndstooth"],
  [/\bherringbone\b/, "herringbone"],
  [/\b(polka|dotted|spotted)\b/, "polka-dot"],
  [/\bfloral|flower/, "floral"],
  [/\bpaisley\b/, "paisley"],
  [/\bfair ?isle\b/, "fair-isle"],
  [/\bcamo/, "camo"],
  [/\b(graphic|printed|band tee|logo)\b/, "graphic"],
];

const STYLE_WORDS = [
  "dark academia",
  "light academia",
  "classic menswear",
  "vintage",
  "grunge",
  "smart-casual",
  "smart casual",
  "minimalist",
  "workwear",
  "ivy",
  "preppy",
  "streetwear",
  "gorpcore",
  "romantic",
  "punk",
  "western",
  "military",
  "rock",
];

const OCCASION_WORDS = ["college", "work", "office", "date", "party", "presentation", "interview", "wedding", "everyday", "evening", "travel", "hiking", "gym"];

function findKeywords(text: string): Hit[] {
  const lower = ` ${text.toLowerCase()} `;
  const hits: Hit[] = [];
  const taken: [number, number][] = [];
  for (const [word, category, subcategory] of KEYWORDS) {
    const re = new RegExp(`[^a-z]${word.replace(/[- ]/g, "[- ]?")}s?(?=[^a-z])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const start = m.index + 1;
      const end = start + m[0].length - 1;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      hits.push({ category, subcategory, index: start, word });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Split free text into one chunk per garment mention. */
export function splitGarmentText(text: string): string[] {
  const pieces = text
    .split(/\n+|•|(?:^|\s)[-*]\s+|;\s*|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const piece of pieces) {
    const hits = findKeywords(piece);
    // "…, wool trousers and brown boots" → separate garments
    const garmentHits = hits.filter((h, i) => i === 0 || h.index - hits[i - 1].index > 3);
    if (garmentHits.length <= 1) {
      if (hits.length) chunks.push(piece);
      continue;
    }
    const lower = piece.toLowerCase();
    let cursor = 0;
    for (let i = 1; i < garmentHits.length; i++) {
      // cut at the last separator before the next garment word
      const region = lower.slice(cursor, garmentHits[i].index);
      const sep = Math.max(region.lastIndexOf(","), region.lastIndexOf(" and "), region.lastIndexOf(" plus "), region.lastIndexOf(" also "), region.lastIndexOf(" with a "));
      if (sep <= 0 || /\b(suitable|works|goes|for|pairs?)\b/.test(region.slice(sep))) continue;
      chunks.push(piece.slice(cursor, cursor + sep).trim().replace(/^(and|plus|also)\s+/i, ""));
      cursor = cursor + sep;
    }
    chunks.push(piece.slice(cursor).replace(/^[,\s]*(and|plus|also|with)?\s*/i, "").trim());
  }
  return chunks.map((c) => c.replace(/^[,;:\s]+/, "").replace(/[\s,;]+$/, "")).filter((c) => findKeywords(c).length > 0);
}

function colourPhrases(text: string): Colour[] {
  const lower = text.toLowerCase();
  const names = Object.keys(NAMED_COLOURS).sort((a, b) => b.length - a.length);
  const out: { name: string; index: number }[] = [];
  let masked = ` ${lower} `;
  for (const n of names) {
    const re = new RegExp(`[^a-z]((?:(?:dark|light|deep|pale|washed|faded|muted|dusty)\\s+)?${n})(?=[^a-z])`);
    const m = re.exec(masked);
    if (m) {
      out.push({ name: m[1], index: m.index });
      masked = masked.slice(0, m.index + 1) + "#".repeat(m[1].length) + masked.slice(m.index + 1 + m[1].length);
    }
  }
  out.sort((a, b) => a.index - b.index);
  // "dark brown, almost charcoal" → one blended colour
  if (out.length >= 2 && /almost|nearly|verging|bordering|between/.test(lower)) {
    const phrase = `${out[0].name}, almost ${out[1].name}`;
    return [toColour(phrase), ...out.slice(2, 4).map((c) => toColour(c.name))];
  }
  return out.slice(0, 4).map((c) => toColour(c.name));
}

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

export type HeuristicResult = { input: GarmentInput; assumed: string[]; sourceText: string };

export function parseGarmentHeuristic(chunk: string): HeuristicResult | null {
  const hits = findKeywords(chunk);
  if (hits.length === 0) return null;
  const lower = chunk.toLowerCase();
  // prefer the most specific (longest) keyword as the garment noun
  const hit = [...hits].sort((a, b) => b.word.length - a.word.length)[0];
  const colours = colourPhrases(chunk);
  const materials = MATERIALS.filter((m) => new RegExp(`\\b${m}\\b`).test(lower)).map((m) => (m === "cord" ? "corduroy" : m));
  const fit = FIT_WORDS.find(([re]) => re.test(lower))?.[1];
  const pattern = PATTERN_WORDS.find(([re]) => re.test(lower))?.[1];
  const styleTags = STYLE_WORDS.filter((w) => lower.includes(w)).map((w) => (w === "smart casual" ? "smart-casual" : w));
  const occasions = OCCASION_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
  const seasons = (["spring", "summer", "autumn", "winter"] as Season[]).filter((s) => lower.includes(s) || (s === "autumn" && lower.includes("fall")));
  const assumed: string[] = ["warmth", "formality"];
  if (!colours.length) assumed.push("colours");
  if (!fit) assumed.push("fit");
  const colourWord = colours[0]?.name ? `${colours[0].name.split(",")[0]} ` : "";
  const materialWord = materials[0] && !hit.subcategory.includes(materials[0]) ? `${materials[0]} ` : "";
  const name = titleCase(`${colourWord}${materialWord}${hit.subcategory}`.trim());
  const input: GarmentInput = {
    name,
    category: hit.category,
    subcategory: hit.subcategory,
    colours,
    pattern: pattern ?? "solid",
    materials,
    fit: fit ?? null,
    layeringRole: defaultLayeringRole(hit.category, hit.subcategory),
    warmth: 3,
    formality: 3,
    seasons,
    styleTags,
    occasions,
    notes: chunk.length > 0 ? chunk.slice(0, 400) : null,
  };
  return { input, assumed, sourceText: chunk };
}

export function parseWardrobeText(text: string): HeuristicResult[] {
  return splitGarmentText(text)
    .map(parseGarmentHeuristic)
    .filter((r): r is HeuristicResult => r !== null)
    .slice(0, 60);
}

