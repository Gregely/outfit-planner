/**
 * Offline garment parser. Recognises garment types, colours, materials, fits, patterns, brands
 * and style words in free text. Classification is factual: a generic noun stays generic
 * ("shorts" → shorts) and is only refined by words actually in the description ("Nike" or
 * "running" → athletic shorts, "chino" → chino shorts). Nothing is assumed from any aesthetic;
 * anything not stated is left neutral or estimated from the garment type and flagged.
 */
import { defaultLayeringRole, type Category, type Fit, type GarmentDetails, type Pattern, type Season } from "@/lib/domain";
import { NAMED_COLOURS, toColour, type Colour } from "@/lib/colours";
import { detectBrand, estimateTraits, isAthletic } from "@/lib/garment-traits";
import type { GarmentInput } from "@/lib/schemas";

type Hit = { category: Category; subcategory: string; index: number; word: string };

/**
 * keyword → [category, subcategory]. Longest keywords match first. Generic nouns map to the
 * generic type; specific entries only fire when the text names that type.
 */
const KEYWORDS: [string, Category, string][] = [
  // tops
  ["t-shirt", "tops", "t-shirt"],
  ["tshirt", "tops", "t-shirt"],
  ["tee", "tops", "t-shirt"],
  ["long-sleeve tee", "tops", "long-sleeve tee"],
  ["long sleeve top", "tops", "long-sleeve top"],
  ["polo shirt", "tops", "polo"],
  ["polo", "tops", "polo"],
  ["henley", "tops", "henley"],
  ["tank top", "tops", "tank top"],
  ["vest top", "tops", "tank top"],
  ["camisole", "tops", "camisole"],
  ["crop top", "tops", "crop top"],
  ["sports bra", "tops", "sports bra"],
  ["bodysuit", "tops", "bodysuit"],
  ["top", "tops", "top"],
  ["sweatshirt", "tops", "sweatshirt"],
  ["hoodie", "tops", "hoodie"],
  ["rugby shirt", "tops", "rugby shirt"],
  // shirts
  ["oxford shirt", "shirts", "oxford shirt"],
  ["dress shirt", "shirts", "dress shirt"],
  ["flannel shirt", "shirts", "flannel shirt"],
  ["overshirt", "shirts", "overshirt"],
  ["shacket", "shirts", "overshirt"],
  ["camp collar shirt", "shirts", "camp-collar shirt"],
  ["hawaiian shirt", "shirts", "camp-collar shirt"],
  ["denim shirt", "shirts", "denim shirt"],
  ["linen shirt", "shirts", "linen shirt"],
  ["grandad shirt", "shirts", "band-collar shirt"],
  ["button-down", "shirts", "button-down shirt"],
  ["button-up", "shirts", "button-up shirt"],
  ["shirt", "shirts", "shirt"],
  ["blouse", "shirts", "blouse"],
  // knitwear
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
  ["jumper", "knitwear", "jumper"],
  ["sweater", "knitwear", "sweater"],
  ["pullover", "knitwear", "pullover"],
  // trousers
  ["jeans", "trousers", "jeans"],
  ["chinos", "trousers", "chinos"],
  ["corduroys", "trousers", "corduroys"],
  ["cords", "trousers", "corduroys"],
  ["cargo trousers", "trousers", "cargo trousers"],
  ["cargo pants", "trousers", "cargo trousers"],
  ["cargos", "trousers", "cargo trousers"],
  ["joggers", "trousers", "joggers"],
  ["sweatpants", "trousers", "sweatpants"],
  ["track pants", "trousers", "track pants"],
  ["tracksuit bottoms", "trousers", "track pants"],
  ["leggings", "trousers", "leggings"],
  ["trousers", "trousers", "trousers"],
  ["slacks", "trousers", "trousers"],
  ["pants", "trousers", "trousers"],
  // shorts, skirts, dresses
  ["shorts", "shorts", "shorts"],
  ["skort", "skirts", "skort"],
  ["skirt", "skirts", "skirt"],
  ["jumpsuit", "dresses", "jumpsuit"],
  ["playsuit", "dresses", "playsuit"],
  ["romper", "dresses", "playsuit"],
  ["dress", "dresses", "dress"],
  // outerwear
  ["blazer", "outerwear", "blazer"],
  ["sport coat", "outerwear", "sport coat"],
  ["sports jacket", "outerwear", "sport coat"],
  ["overcoat", "outerwear", "overcoat"],
  ["topcoat", "outerwear", "overcoat"],
  ["trench coat", "outerwear", "trench coat"],
  ["trench", "outerwear", "trench coat"],
  ["raincoat", "outerwear", "raincoat"],
  ["rain jacket", "outerwear", "rain jacket"],
  ["peacoat", "outerwear", "peacoat"],
  ["pea coat", "outerwear", "peacoat"],
  ["duffle coat", "outerwear", "duffle coat"],
  ["bomber", "outerwear", "bomber jacket"],
  ["denim jacket", "outerwear", "denim jacket"],
  ["jean jacket", "outerwear", "denim jacket"],
  ["trucker jacket", "outerwear", "denim jacket"],
  ["leather jacket", "outerwear", "leather jacket"],
  ["biker jacket", "outerwear", "leather jacket"],
  ["field jacket", "outerwear", "field jacket"],
  ["chore coat", "outerwear", "chore coat"],
  ["chore jacket", "outerwear", "chore coat"],
  ["track jacket", "outerwear", "track jacket"],
  ["tracksuit top", "outerwear", "track jacket"],
  ["windbreaker", "outerwear", "windbreaker"],
  ["harrington", "outerwear", "harrington jacket"],
  ["parka", "outerwear", "parka"],
  ["anorak", "outerwear", "anorak"],
  ["puffer", "outerwear", "puffer jacket"],
  ["down jacket", "outerwear", "puffer jacket"],
  ["gilet", "outerwear", "gilet"],
  ["body warmer", "outerwear", "gilet"],
  ["fleece jacket", "outerwear", "fleece jacket"],
  ["coat", "outerwear", "coat"],
  ["jacket", "outerwear", "jacket"],
  // footwear
  ["chelsea boots", "footwear", "chelsea boots"],
  ["combat boots", "footwear", "combat boots"],
  ["doc martens", "footwear", "combat boots"],
  ["dr martens", "footwear", "combat boots"],
  ["hiking boots", "footwear", "hiking boots"],
  ["ankle boots", "footwear", "ankle boots"],
  ["boots", "footwear", "boots"],
  ["loafers", "footwear", "loafers"],
  ["oxfords", "footwear", "oxford shoes"],
  ["oxford shoes", "footwear", "oxford shoes"],
  ["derbies", "footwear", "derby shoes"],
  ["derby shoes", "footwear", "derby shoes"],
  ["brogues", "footwear", "brogues"],
  ["running shoes", "footwear", "running shoes"],
  ["sneakers", "footwear", "sneakers"],
  ["trainers", "footwear", "trainers"],
  ["plimsolls", "footwear", "canvas sneakers"],
  ["boat shoes", "footwear", "boat shoes"],
  ["heels", "footwear", "heels"],
  ["pumps", "footwear", "pumps"],
  ["flats", "footwear", "flats"],
  ["mules", "footwear", "mules"],
  ["slides", "footwear", "slides"],
  ["flip flops", "footwear", "flip-flops"],
  ["sandals", "footwear", "sandals"],
  ["shoes", "footwear", "shoes"],
  // accessories
  ["scarf", "accessories", "scarf"],
  ["beanie", "accessories", "beanie"],
  ["flat cap", "accessories", "flat cap"],
  ["bucket hat", "accessories", "bucket hat"],
  ["baseball cap", "accessories", "baseball cap"],
  ["cap", "accessories", "cap"],
  ["fedora", "accessories", "fedora"],
  ["hat", "accessories", "hat"],
  ["belt", "accessories", "belt"],
  ["bow tie", "accessories", "bow tie"],
  ["tie", "accessories", "tie"],
  ["pocket square", "accessories", "pocket square"],
  ["backpack", "accessories", "backpack"],
  ["rucksack", "accessories", "backpack"],
  ["tote", "accessories", "tote bag"],
  ["handbag", "accessories", "handbag"],
  ["bag", "accessories", "bag"],
  ["watch", "accessories", "watch"],
  ["sunglasses", "accessories", "sunglasses"],
  ["glasses", "accessories", "glasses"],
  ["gloves", "accessories", "gloves"],
  ["socks", "accessories", "socks"],
  ["necklace", "accessories", "necklace"],
  ["earrings", "accessories", "earrings"],
  ["bracelet", "accessories", "bracelet"],
  ["ring", "accessories", "ring"],
  // formalwear
  ["waistcoat", "formalwear", "waistcoat"],
  ["tuxedo", "formalwear", "tuxedo"],
  ["dinner suit", "formalwear", "tuxedo"],
  ["tracksuit", "trousers", "track pants"],
  ["suit", "formalwear", "suit"],
];
KEYWORDS.sort((a, b) => b[0].length - a[0].length);

/** Refine a generic type with qualifiers the description actually contains. */
function refineType(category: Category, subcategory: string, text: string): string {
  const t = text.toLowerCase();
  const has = (re: RegExp) => re.test(t);
  const athletic = isAthletic(t);
  switch (subcategory) {
    case "shorts":
      if (has(/\bchino/)) return "chino shorts";
      if (has(/\b(denim|jean)/)) return "denim shorts";
      if (has(/\bcargo/)) return "cargo shorts";
      if (has(/\b(swim|board)\b/)) return "swim shorts";
      if (has(/\b(bike|cycling)\b/)) return "bike shorts";
      if (has(/\brunning\b/)) return "running shorts";
      if (athletic) return "athletic shorts";
      return "shorts";
    case "trousers":
      if (has(/\bchino/)) return "chinos";
      if (has(/\bcargo/)) return "cargo trousers";
      if (has(/\b(track|tracksuit)\b/)) return "track pants";
      if (has(/\bsweat/)) return "sweatpants";
      if (has(/\b(suit|tailored|dress)\b/)) return "tailored trousers";
      if (has(/\bpleat/)) return "pleated trousers";
      if (athletic) return "track pants";
      return "trousers";
    case "t-shirt":
    case "top":
      if (athletic && !has(/\bgraphic|band\b/)) return subcategory === "top" ? "sports top" : "sports t-shirt";
      return subcategory;
    case "shirt":
      if (has(/\boxford\b/)) return "oxford shirt";
      if (has(/\bflannel\b/)) return "flannel shirt";
      if (has(/\bdenim\b/)) return "denim shirt";
      if (has(/\blinen\b/)) return "linen shirt";
      return "shirt";
    case "jacket":
      if (has(/\b(track|tracksuit)\b/)) return "track jacket";
      if (has(/\b(rain|waterproof)\b/)) return "rain jacket";
      if (has(/\b(puffer|down|quilted)\b/)) return "puffer jacket";
      if (has(/\bdenim\b/)) return "denim jacket";
      if (has(/\bleather\b/)) return "leather jacket";
      if (has(/\bfleece\b/)) return "fleece jacket";
      if (has(/\bsuit\b/)) return "suit jacket";
      if (athletic) return "track jacket";
      return "jacket";
    case "coat":
      if (has(/\brain|waterproof\b/)) return "raincoat";
      if (has(/\b(puffer|down|quilted)\b/)) return "puffer coat";
      return "coat";
    case "shoes":
      if (has(/\brunning\b/)) return "running shoes";
      if (athletic) return "trainers";
      return "shoes";
    case "dress": {
      const kind = t.match(/\b(slip|wrap|shirt|knit|sweater|midi|maxi|mini|bodycon|sun|tea|cocktail|evening)[- ]?dress/);
      return kind ? `${kind[1]} dress` : "dress";
    }
    case "skirt": {
      const kind = t.match(/\b(mini|midi|maxi|pencil|pleated|a-line|denim|wrap|slip|tennis)[- ]?skirt/);
      return kind ? `${kind[1]} skirt` : "skirt";
    }
    case "boots":
      if (has(/\bhiking|walking\b/)) return "hiking boots";
      if (has(/\bankle\b/)) return "ankle boots";
      return "boots";
    default:
      void category;
      return subcategory;
  }
}

const MATERIALS = [
  "wool", "merino", "lambswool", "cashmere", "mohair", "alpaca", "tweed", "flannel", "cotton", "organic cotton", "linen", "silk",
  "satin", "chiffon", "lace", "velvet", "denim", "corduroy", "cord", "leather", "faux leather", "vegan leather", "suede", "canvas",
  "twill", "jersey", "fleece", "nylon", "polyester", "recycled polyester", "spandex", "elastane", "lycra", "mesh", "acrylic",
  "viscose", "rayon", "modal", "tencel", "lyocell", "bamboo", "gore-tex", "gabardine", "waxed cotton", "moleskin", "rubber", "down",
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

/** Style words are only recorded when the person uses them – none is implied. */
const STYLE_WORDS = [
  "athleisure", "boho", "business casual", "casual", "classic", "coastal", "cottagecore", "dark academia", "light academia",
  "elegant", "glam", "goth", "gorpcore", "grunge", "hip-hop", "indie", "minimalist", "military", "modest", "preppy", "punk",
  "retro", "romantic", "skater", "smart casual", "smart-casual", "sporty", "streetwear", "techwear", "vintage", "western",
  "workwear", "y2k", "classic menswear", "ivy",
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

const titleCase = (s: string) => s.replace(/(^|[\s-])[a-z]/g, (c) => c.toUpperCase());

export type HeuristicResult = { input: GarmentInput; assumed: string[]; sourceText: string };

const LEG_WORDS: [RegExp, NonNullable<GarmentDetails["leg"]>, string][] = [
  [/\bwide[- ]leg|\bwide\b/, "wide", "wide-leg"],
  [/\bskinny\b/, "skinny", "skinny"],
  [/\bstraight[- ]leg|\bstraight\b/, "straight", "straight-leg"],
  [/\btapered\b/, "tapered", "tapered"],
  [/\b(flared|bootcut|boot-cut)\b/, "flared", "flared"],
  [/\bbarrel\b/, "barrel", "barrel-leg"],
];

export function parseGarmentHeuristic(chunk: string): HeuristicResult | null {
  const hits = findKeywords(chunk);
  if (hits.length === 0) return null;
  const lower = chunk.toLowerCase();
  // prefer the most specific (longest) keyword as the garment noun
  const hit = [...hits].sort((a, b) => b.word.length - a.word.length)[0];
  const subcategory = refineType(hit.category, hit.subcategory, chunk);
  const colours = colourPhrases(chunk);
  const found = MATERIALS.filter((m) => new RegExp(`\\b${m}\\b`).test(lower)).map((m) => (m === "cord" ? "corduroy" : m));
  // "faux leather" shouldn't also list "leather"
  const materials = [...new Set(found)].filter((m, _i, all) => !all.some((o) => o !== m && o.includes(m)));
  const fit = FIT_WORDS.find(([re]) => re.test(lower))?.[1];
  const pattern = PATTERN_WORDS.find(([re]) => re.test(lower))?.[1];
  const brand = detectBrand(chunk);
  const styleTags = STYLE_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower)).map((w) => (w === "smart casual" ? "smart-casual" : w));
  const occasions = OCCASION_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(lower));
  const seasons = (["spring", "summer", "autumn", "winter"] as Season[]).filter((s) => lower.includes(s) || (s === "autumn" && lower.includes("fall")));
  const leg = hit.category === "trousers" ? LEG_WORDS.find(([re]) => re.test(lower)) : undefined;
  const estimate = estimateTraits({ category: hit.category, subcategory, name: chunk, materials });
  // warmth & formality are never stated in prose this simple: they're estimated from the type
  const assumed: string[] = ["warmth", "formality"];
  if (!colours.length) assumed.push("colours");
  if (!fit) assumed.push("fit");
  const colourWord = colours[0]?.name ? `${colours[0].name.split(",")[0]} ` : "";
  const brandWord = brand ? `${brand} ` : "";
  const materialWord = materials[0] && !subcategory.includes(materials[0]) ? `${materials[0]} ` : "";
  // name the garment with the person's own noun; a refined type they didn't write ("athletic") stays in subcategory
  const noun = lower.includes(subcategory) ? subcategory : hit.subcategory;
  const name = `${titleCase(colourWord)}${brandWord}${titleCase(`${materialWord}${noun}`)}`.trim().slice(0, 120);
  const input: GarmentInput = {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    category: hit.category,
    subcategory,
    colours,
    pattern: pattern ?? "solid",
    materials,
    fit: fit ?? null,
    silhouette: leg ? leg[2] : null,
    layeringRole: defaultLayeringRole(hit.category, subcategory),
    warmth: estimate.warmth,
    formality: estimate.formality,
    seasons,
    styleTags,
    occasions,
    brand,
    details: leg ? { leg: leg[1] } : {},
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
