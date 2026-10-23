/**
 * Core wardrobe vocabulary shared by the server, the stylist engine, the
 * illustration renderer and the UI. Keep this file free of server-only imports.
 */

export const CATEGORIES = [
  "tops",
  "shirts",
  "knitwear",
  "trousers",
  "shorts",
  "skirts",
  "dresses",
  "outerwear",
  "footwear",
  "accessories",
  "formalwear",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tops: "Tops",
  shirts: "Shirts",
  knitwear: "Knitwear",
  trousers: "Trousers",
  shorts: "Shorts",
  skirts: "Skirts",
  dresses: "Dresses",
  outerwear: "Outerwear",
  footwear: "Footwear",
  accessories: "Accessories",
  formalwear: "Formalwear",
};

/** Suggested subcategories. Users may type any subcategory; these drive defaults and drawings. */
export const SUBCATEGORIES: Record<Category, string[]> = {
  tops: ["t-shirt", "long-sleeve top", "tank top", "crop top", "blouse", "camisole", "polo", "henley", "sweatshirt", "hoodie", "sports t-shirt", "sports bra", "bodysuit"],
  shirts: ["button-up shirt", "oxford shirt", "dress shirt", "flannel shirt", "overshirt", "camp-collar shirt", "denim shirt", "linen shirt"],
  knitwear: ["crewneck jumper", "v-neck jumper", "turtleneck", "cardigan", "sweater vest", "quarter-zip", "cable knit"],
  trousers: ["jeans", "chinos", "tailored trousers", "wide-leg trousers", "cargo trousers", "joggers", "track pants", "leggings", "linen trousers", "corduroys"],
  shorts: ["shorts", "athletic shorts", "running shorts", "bike shorts", "denim shorts", "chino shorts", "cargo shorts", "swim shorts"],
  skirts: ["mini skirt", "midi skirt", "maxi skirt", "a-line skirt", "pencil skirt", "pleated skirt", "denim skirt"],
  dresses: ["midi dress", "maxi dress", "mini dress", "shirt dress", "slip dress", "wrap dress", "knit dress", "jumpsuit"],
  outerwear: [
    "rain jacket",
    "puffer jacket",
    "parka",
    "denim jacket",
    "leather jacket",
    "bomber jacket",
    "track jacket",
    "windbreaker",
    "fleece",
    "gilet",
    "blazer",
    "trench coat",
    "overcoat",
    "peacoat",
    "field jacket",
    "chore coat",
  ],
  footwear: [
    "sneakers",
    "running shoes",
    "canvas sneakers",
    "sandals",
    "slides",
    "flats",
    "heels",
    "loafers",
    "chelsea boots",
    "lace-up boots",
    "ankle boots",
    "combat boots",
    "oxford shoes",
    "derby shoes",
  ],
  accessories: ["baseball cap", "beanie", "bucket hat", "scarf", "belt", "bag", "backpack", "tote bag", "watch", "sunglasses", "jewellery", "gloves", "tie"],
  formalwear: ["suit", "tuxedo", "evening gown", "waistcoat", "dress trousers"],
};

export const STATUSES = [
  "clean",
  "worn",
  "in_wash",
  "drying",
  "awaiting_ironing",
  "awaiting_repair",
  "packed",
  "unavailable",
  "retired",
] as const;
export type GarmentStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<GarmentStatus, string> = {
  clean: "Clean & ready",
  worn: "Worn · needs washing",
  in_wash: "In the wash",
  drying: "Drying",
  awaiting_ironing: "Needs ironing",
  awaiting_repair: "Needs repair",
  packed: "Packed",
  unavailable: "Unavailable",
  retired: "Retired",
};

export const STATUS_SHORT: Record<GarmentStatus, string> = {
  clean: "Ready",
  worn: "To wash",
  in_wash: "Washing",
  drying: "Drying",
  awaiting_ironing: "To iron",
  awaiting_repair: "Repair",
  packed: "Packed",
  unavailable: "Away",
  retired: "Retired",
};

/** Only clean garments may appear in new recommendations. */
export function isAvailable(status: GarmentStatus): boolean {
  return status === "clean";
}

/** Statuses tracked on the laundry board. */
export const LAUNDRY_STATUSES: GarmentStatus[] = ["worn", "in_wash", "drying", "awaiting_ironing", "awaiting_repair"];

export const PATTERNS = [
  "solid",
  "stripes",
  "pinstripe",
  "check",
  "plaid",
  "gingham",
  "houndstooth",
  "herringbone",
  "polka-dot",
  "floral",
  "paisley",
  "fair-isle",
  "camo",
  "graphic",
  "colour-block",
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const FITS = ["skinny", "slim", "regular", "relaxed", "oversized", "tailored", "boxy"] as const;
export type Fit = (typeof FITS)[number];

export const LAYERING_ROLES = ["base", "mid", "outer", "none"] as const;
export type LayeringRole = (typeof LAYERING_ROLES)[number];
export const LAYERING_LABELS: Record<LayeringRole, string> = {
  base: "Base layer",
  mid: "Mid layer",
  outer: "Outer layer",
  none: "Not a layer",
};

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const WEATHER_TAGS = ["waterproof", "water-resistant", "windproof", "breathable", "insulated", "avoid-rain"] as const;
export type WeatherTag = (typeof WEATHER_TAGS)[number];

export const SUGGESTED_OCCASIONS = [
  "everyday",
  "college",
  "work",
  "date",
  "party",
  "presentation",
  "evening out",
  "interview",
  "wedding",
  "outdoors",
  "travel",
  "sport",
  "lounging",
];

/** Suggestions only, in alphabetical order so none reads as the default. */
export const SUGGESTED_STYLE_TAGS = [
  "athleisure",
  "boho",
  "business casual",
  "casual",
  "classic",
  "cottagecore",
  "dark academia",
  "elegant",
  "gorpcore",
  "grunge",
  "minimalist",
  "preppy",
  "punk",
  "romantic",
  "smart-casual",
  "sporty",
  "streetwear",
  "vintage",
  "western",
  "workwear",
  "y2k",
];

export const FORMALITY_LABELS: Record<number, string> = {
  1: "Lounge / active",
  2: "Casual",
  3: "Smart casual",
  4: "Business",
  5: "Formal",
};

export const WARMTH_LABELS: Record<number, string> = {
  1: "Very light",
  2: "Light",
  3: "Medium",
  4: "Warm",
  5: "Very warm",
};

export const DRESS_CODES = ["none", "active", "casual", "smart-casual", "business-casual", "business", "formal"] as const;
export type DressCode = (typeof DRESS_CODES)[number];
export const DRESS_CODE_LABELS: Record<DressCode, string> = {
  none: "No dress code",
  active: "Active",
  casual: "Casual",
  "smart-casual": "Smart casual",
  "business-casual": "Business casual",
  business: "Business",
  formal: "Formal",
};
export const DRESS_CODE_FORMALITY: Record<DressCode, number | null> = {
  none: null,
  active: 1,
  casual: 2,
  "smart-casual": 3,
  "business-casual": 3.5,
  business: 4,
  formal: 5,
};

export const SETTINGS_KINDS = ["indoor", "outdoor", "mixed"] as const;
export type ActivitySetting = (typeof SETTINGS_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Illustration / detail attributes                                    */
/* ------------------------------------------------------------------ */

export const SLEEVES = ["sleeveless", "short", "three-quarter", "long"] as const;
export const NECKLINES = ["crew", "v-neck", "scoop", "henley", "polo", "collar", "turtleneck", "mock", "hood", "boat"] as const;
export const COLLARS = ["point", "button-down", "spread", "camp", "band", "none"] as const;
export const LAPELS = ["notch", "peak", "shawl", "none"] as const;
export const CLOSURES = ["none", "buttons", "double-breasted", "zip", "toggle", "belted", "laces", "slip-on", "buckle"] as const;
export const LENGTHS = ["cropped", "waist", "hip", "thigh", "knee", "midi", "calf", "ankle", "full"] as const;
export const LEG_SHAPES = ["skinny", "slim", "straight", "tapered", "wide", "flared", "barrel"] as const;
export const SHOE_HEIGHTS = ["low", "ankle", "mid", "high"] as const;
export const TEXTURES = [
  "smooth",
  "denim",
  "knit",
  "cable",
  "rib",
  "corduroy",
  "leather",
  "suede",
  "tweed",
  "quilted",
  "linen",
  "fleece",
  "canvas",
] as const;

export type GarmentDetails = {
  sleeve?: (typeof SLEEVES)[number];
  neckline?: (typeof NECKLINES)[number];
  collar?: (typeof COLLARS)[number];
  lapel?: (typeof LAPELS)[number];
  closure?: (typeof CLOSURES)[number];
  length?: (typeof LENGTHS)[number];
  leg?: (typeof LEG_SHAPES)[number];
  height?: (typeof SHOE_HEIGHTS)[number];
  texture?: (typeof TEXTURES)[number];
  pockets?: boolean;
  hood?: boolean;
  cuffs?: boolean;
};

/* ------------------------------------------------------------------ */
/* Outfit slots                                                        */
/* ------------------------------------------------------------------ */

export const SLOTS = ["top", "mid", "outer", "bottom", "onepiece", "suit", "footwear", "accessory"] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  top: "Top",
  mid: "Layer",
  outer: "Outerwear",
  bottom: "Bottoms",
  onepiece: "Dress",
  suit: "Suit",
  footwear: "Shoes",
  accessory: "Accessory",
};

const MID_BY_DEFAULT = new Set(["overshirt", "cardigan", "sweater vest", "waistcoat", "blazer", "sport coat", "chore coat"]);
const OUTERWEAR_MID = new Set(["blazer", "sport coat", "chore coat", "denim jacket", "harrington jacket"]);

export function defaultLayeringRole(category: Category, subcategory?: string | null): LayeringRole {
  const sub = (subcategory ?? "").toLowerCase();
  switch (category) {
    case "tops":
      return sub === "hoodie" || sub === "sweatshirt" ? "mid" : "base";
    case "shirts":
      return sub === "overshirt" ? "mid" : "base";
    case "knitwear":
      return "mid";
    case "outerwear":
      return OUTERWEAR_MID.has(sub) ? "mid" : "outer";
    case "formalwear":
      return sub === "dress trousers" ? "none" : "mid";
    case "dresses":
      return "base";
    default:
      return "none";
  }
}

/** Which outfit slot a garment fills. */
export function slotFor(g: { category: Category; subcategory?: string | null; layeringRole?: LayeringRole | null }): Slot {
  const sub = (g.subcategory ?? "").toLowerCase();
  const role = g.layeringRole ?? defaultLayeringRole(g.category, sub);
  switch (g.category) {
    case "tops":
    case "shirts":
      return role === "mid" || role === "outer" ? "mid" : "top";
    case "knitwear":
      return role === "base" ? "top" : "mid";
    case "outerwear":
      return role === "outer" ? "outer" : "mid";
    case "trousers":
    case "shorts":
    case "skirts":
      return "bottom";
    case "dresses":
      return "onepiece";
    case "formalwear":
      if (sub === "suit" || sub === "tuxedo") return "suit";
      if (sub.includes("trouser")) return "bottom";
      return role === "outer" ? "outer" : "mid";
    case "footwear":
      return "footwear";
    case "accessories":
      return "accessory";
  }
}

/** Garments in the mid slot that cover the torso on their own (a jumper does, a cardigan worn open doesn't). */
export function coversTorso(g: { category: Category; subcategory?: string | null; layeringRole?: LayeringRole | null }): boolean {
  const slot = slotFor(g);
  if (slot === "top" || slot === "onepiece") return true;
  if (slot !== "mid") return false;
  const sub = (g.subcategory ?? "").toLowerCase();
  if (g.category === "knitwear") return !["cardigan", "sweater vest"].includes(sub);
  if (g.category === "tops") return true; // hoodies & sweatshirts
  return false;
}

export function isMidByDefault(subcategory: string) {
  return MID_BY_DEFAULT.has(subcategory.toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Care defaults                                                       */
/* ------------------------------------------------------------------ */

export type CareDefault = { washAfterWears: number; needsIroning: boolean };

/** washAfterWears = 0 means "never automatically mark for washing". */
export const DEFAULT_CARE: Record<Category, CareDefault> = {
  tops: { washAfterWears: 1, needsIroning: false },
  shirts: { washAfterWears: 2, needsIroning: true },
  knitwear: { washAfterWears: 6, needsIroning: false },
  trousers: { washAfterWears: 5, needsIroning: false },
  shorts: { washAfterWears: 3, needsIroning: false },
  skirts: { washAfterWears: 4, needsIroning: false },
  dresses: { washAfterWears: 2, needsIroning: true },
  outerwear: { washAfterWears: 0, needsIroning: false },
  footwear: { washAfterWears: 0, needsIroning: false },
  accessories: { washAfterWears: 0, needsIroning: false },
  formalwear: { washAfterWears: 6, needsIroning: true },
};

/** Next status in the washing workflow, or null if the item isn't in it. */
export function nextLaundryStatus(status: GarmentStatus, needsIroning: boolean): GarmentStatus | null {
  switch (status) {
    case "worn":
      return "in_wash";
    case "in_wash":
      return "drying";
    case "drying":
      return needsIroning ? "awaiting_ironing" : "clean";
    case "awaiting_ironing":
    case "awaiting_repair":
      return "clean";
    default:
      return null;
  }
}

export const LAUNDRY_ACTION_LABEL: Partial<Record<GarmentStatus, string>> = {
  worn: "Start wash",
  in_wash: "Hang to dry",
  drying: "Dry · put away",
  awaiting_ironing: "Ironed",
  awaiting_repair: "Repaired",
};

export const FEEDBACK_KINDS = [
  "love",
  "not_my_style",
  "too_warm",
  "too_cold",
  "too_formal",
  "too_casual",
  "uncomfortable",
  "dont_combine",
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const FEEDBACK_LABELS: Record<FeedbackKind, string> = {
  love: "Love this",
  not_my_style: "Not my style",
  too_warm: "Too warm",
  too_cold: "Too cold",
  too_formal: "Too formal",
  too_casual: "Too casual",
  uncomfortable: "Uncomfortable",
  dont_combine: "Don't combine these again",
};

export const FEEDBACK_SCOPES = ["permanent", "temporary", "one_off"] as const;
export type FeedbackScope = (typeof FEEDBACK_SCOPES)[number];

export const RULE_KINDS = ["never_combine", "avoid_garment", "avoid_colour", "prefer_garment", "note"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  never_combine: "Never combine",
  avoid_garment: "Avoid garment",
  avoid_colour: "Avoid colour",
  prefer_garment: "Prefer garment",
  note: "Styling note",
};

export const OUTFIT_SOURCES = ["ai", "rules", "manual"] as const;
export type OutfitSource = (typeof OUTFIT_SOURCES)[number];
export const SOURCE_LABELS: Record<OutfitSource, string> = {
  ai: "Claude stylist",
  rules: "Rule-based",
  manual: "Hand-picked",
};
