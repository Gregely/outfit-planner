import "server-only";
import type { GarmentInput } from "@/lib/schemas";
import { createGarments } from "./garments";

const c = (name: string, hex: string) => ({ name, hex });

/** A small, coherent starter wardrobe (dark academia / classic menswear leaning) for trying the app. */
export const SAMPLE_WARDROBE: GarmentInput[] = [
  { name: "White oxford shirt", category: "shirts", subcategory: "oxford shirt", colours: [c("white", "#f4f1ea")], materials: ["cotton"], fit: "regular", warmth: 2, formality: 4, seasons: [], styleTags: ["classic menswear", "dark academia"], occasions: ["work", "college", "presentation"] },
  { name: "Light blue oxford shirt", category: "shirts", subcategory: "oxford shirt", colours: [c("light blue", "#a9c1dc")], materials: ["cotton"], fit: "regular", warmth: 2, formality: 3, styleTags: ["classic menswear", "ivy"], occasions: ["work", "college"] },
  { name: "Ecru band-collar shirt", category: "shirts", subcategory: "band-collar shirt", colours: [c("ecru", "#e3d9bf")], materials: ["linen"], fit: "relaxed", warmth: 1, formality: 3, seasons: ["spring", "summer"], weather: ["breathable"], styleTags: ["vintage"] },
  { name: "Red and black flannel shirt", category: "shirts", subcategory: "flannel shirt", colours: [c("brick red", "#8f3b2c"), c("black", "#1c1b1a")], pattern: "plaid", materials: ["cotton flannel"], fit: "relaxed", warmth: 3, formality: 2, seasons: ["autumn", "winter"], styleTags: ["grunge", "workwear"] },
  { name: "White t-shirt", category: "tops", subcategory: "t-shirt", colours: [c("white", "#f4f1ea")], materials: ["cotton"], fit: "regular", warmth: 1, formality: 2, styleTags: ["minimalist"] },
  { name: "Black t-shirt", category: "tops", subcategory: "t-shirt", colours: [c("black", "#1c1b1a")], materials: ["cotton"], fit: "regular", warmth: 1, formality: 2, styleTags: ["grunge", "minimalist"] },
  { name: "Grey marl sweatshirt", category: "tops", subcategory: "sweatshirt", colours: [c("heather grey", "#a7a8aa")], materials: ["cotton fleece"], fit: "relaxed", warmth: 3, formality: 1, styleTags: ["vintage"] },
  { name: "Cream cable-knit jumper", category: "knitwear", subcategory: "cable knit", colours: [c("cream", "#ece2c8")], materials: ["wool"], fit: "relaxed", warmth: 4, formality: 3, seasons: ["autumn", "winter"], styleTags: ["dark academia", "classic menswear"] },
  { name: "Burgundy lambswool crewneck", category: "knitwear", subcategory: "crewneck jumper", colours: [c("burgundy", "#6a1f2b")], materials: ["lambswool"], fit: "regular", warmth: 3, formality: 3, seasons: ["autumn", "winter"], styleTags: ["dark academia", "ivy"] },
  { name: "Charcoal merino turtleneck", category: "knitwear", subcategory: "turtleneck", colours: [c("charcoal", "#36383b")], materials: ["merino"], fit: "slim", warmth: 3, formality: 4, seasons: ["autumn", "winter"], styleTags: ["dark academia", "minimalist"] },
  { name: "Brown sweater vest", category: "knitwear", subcategory: "sweater vest", colours: [c("brown", "#6b4a32"), c("cream", "#ece2c8"), c("bottle green", "#1f3d2c")], pattern: "fair-isle", materials: ["wool"], warmth: 2, formality: 3, seasons: ["autumn", "winter"], styleTags: ["dark academia", "vintage"] },
  { name: "Dark brown tweed blazer", category: "outerwear", subcategory: "blazer", colours: [c("dark brown, almost charcoal", "#3e332a")], pattern: "herringbone", materials: ["wool tweed"], fit: "relaxed", warmth: 3, formality: 4, seasons: ["autumn", "winter", "spring"], styleTags: ["dark academia", "smart-casual", "classic menswear"], occasions: ["college", "presentation", "date"] },
  { name: "Charcoal wool overcoat", category: "outerwear", subcategory: "overcoat", colours: [c("charcoal", "#36383b")], materials: ["wool"], fit: "regular", warmth: 5, formality: 4, seasons: ["autumn", "winter"], weather: ["windproof", "insulated"], styleTags: ["classic menswear", "dark academia"] },
  { name: "Stone trench coat", category: "outerwear", subcategory: "trench coat", colours: [c("stone", "#bfb39b")], materials: ["cotton gabardine"], warmth: 3, formality: 4, seasons: ["spring", "autumn"], weather: ["water-resistant", "windproof"], styleTags: ["classic menswear"] },
  { name: "Black leather jacket", category: "outerwear", subcategory: "leather jacket", colours: [c("black", "#1c1b1a")], materials: ["leather"], fit: "slim", warmth: 3, formality: 2, seasons: ["spring", "autumn"], weather: ["windproof"], styleTags: ["grunge", "punk"] },
  { name: "Olive field jacket", category: "outerwear", subcategory: "field jacket", colours: [c("olive", "#5f6136")], materials: ["cotton canvas"], warmth: 3, formality: 2, weather: ["water-resistant"], styleTags: ["workwear", "vintage"] },
  { name: "Grey wide-leg wool trousers", category: "trousers", subcategory: "pleated trousers", colours: [c("grey", "#5b6470")], materials: ["wool flannel"], fit: "relaxed", warmth: 3, formality: 4, seasons: ["autumn", "winter", "spring"], details: { leg: "wide" }, styleTags: ["dark academia", "classic menswear"] },
  { name: "Stone chinos", category: "trousers", subcategory: "chinos", colours: [c("stone", "#bfb39b")], materials: ["cotton twill"], fit: "slim", warmth: 2, formality: 3, styleTags: ["ivy", "smart-casual"] },
  { name: "Raw denim jeans", category: "trousers", subcategory: "jeans", colours: [c("raw denim", "#26324d")], materials: ["denim"], fit: "slim", warmth: 3, formality: 2, styleTags: ["workwear", "grunge"] },
  { name: "Rust corduroys", category: "trousers", subcategory: "corduroys", colours: [c("rust", "#a1491f")], materials: ["corduroy"], fit: "regular", warmth: 3, formality: 3, seasons: ["autumn", "winter"], styleTags: ["vintage", "dark academia"] },
  { name: "Navy chino shorts", category: "shorts", subcategory: "chino shorts", colours: [c("navy", "#1f2a44")], materials: ["cotton"], warmth: 1, formality: 2, seasons: ["summer"], styleTags: ["ivy"] },
  { name: "Brown suede chelsea boots", category: "footwear", subcategory: "chelsea boots", colours: [c("brown", "#6e5444")], materials: ["suede"], warmth: 3, formality: 3, weather: ["avoid-rain"], styleTags: ["classic menswear", "dark academia"] },
  { name: "Oxblood penny loafers", category: "footwear", subcategory: "loafers", colours: [c("oxblood", "#5a1a1b")], materials: ["leather"], warmth: 2, formality: 4, styleTags: ["ivy", "dark academia"] },
  { name: "Black combat boots", category: "footwear", subcategory: "combat boots", colours: [c("black", "#1c1b1a")], materials: ["leather"], warmth: 4, formality: 2, weather: ["water-resistant"], styleTags: ["grunge", "punk"] },
  { name: "White canvas sneakers", category: "footwear", subcategory: "canvas sneakers", colours: [c("white", "#f4f1ea")], materials: ["canvas"], warmth: 1, formality: 1, styleTags: ["minimalist"] },
  { name: "Bottle green scarf", category: "accessories", subcategory: "scarf", colours: [c("bottle green", "#1f3d2c"), c("navy", "#1f2a44")], pattern: "plaid", materials: ["wool"], warmth: 3, formality: 3, seasons: ["autumn", "winter"], styleTags: ["dark academia"] },
  { name: "Brown leather belt", category: "accessories", subcategory: "belt", colours: [c("brown", "#6b4a32")], materials: ["leather"], formality: 3 },
  { name: "Burgundy silk tie", category: "accessories", subcategory: "tie", colours: [c("burgundy", "#6a1f2b")], pattern: "polka-dot", materials: ["silk"], formality: 5 },
  { name: "Steel field watch", category: "accessories", subcategory: "watch", colours: [c("silver", "#b9bcbf")], formality: 3 },
];

export function loadSampleWardrobe() {
  return createGarments(SAMPLE_WARDROBE, "sample");
}
