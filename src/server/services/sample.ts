import "server-only";
import type { GarmentInput } from "@/lib/schemas";
import { createGarments } from "./garments";

const c = (name: string, hex: string) => ({ name, hex });

/**
 * A small, deliberately neutral starter wardrobe for trying the app: everyday, sport, smart and
 * occasion pieces with no style tags, so it doesn't imply any particular aesthetic. Users edit
 * or delete it freely and describe their own style in the profile.
 */
export const SAMPLE_WARDROBE: GarmentInput[] = [
  { name: "White t-shirt", category: "tops", subcategory: "t-shirt", colours: [c("white", "#f4f1ea")], materials: ["cotton"], warmth: 1, formality: 2 },
  { name: "Black t-shirt", category: "tops", subcategory: "t-shirt", colours: [c("black", "#1c1b1a")], materials: ["cotton"], warmth: 1, formality: 2 },
  { name: "Navy and white striped top", category: "tops", subcategory: "long-sleeve top", colours: [c("navy", "#1f2a44"), c("white", "#f4f1ea")], pattern: "stripes", materials: ["cotton"], warmth: 2, formality: 2 },
  { name: "Black sports t-shirt", category: "tops", subcategory: "sports t-shirt", colours: [c("black", "#1c1b1a")], materials: ["polyester"], warmth: 1, formality: 1, weather: ["breathable"], occasions: ["sport"] },
  { name: "Grey hoodie", category: "tops", subcategory: "hoodie", colours: [c("heather grey", "#a7a8aa")], materials: ["cotton"], fit: "relaxed", warmth: 3, formality: 1 },
  { name: "Light blue button-up shirt", category: "shirts", subcategory: "button-up shirt", colours: [c("light blue", "#a9c1dc")], materials: ["cotton"], warmth: 2, formality: 3 },
  { name: "Red check flannel shirt", category: "shirts", subcategory: "flannel shirt", colours: [c("red", "#a8302c"), c("black", "#1c1b1a")], pattern: "check", materials: ["cotton"], warmth: 3, formality: 2, seasons: ["autumn", "winter"] },
  { name: "Navy crewneck jumper", category: "knitwear", subcategory: "crewneck jumper", colours: [c("navy", "#1f2a44")], materials: ["wool"], warmth: 3, formality: 3, seasons: ["autumn", "winter", "spring"] },
  { name: "Oatmeal cardigan", category: "knitwear", subcategory: "cardigan", colours: [c("oatmeal", "#d8cbb0")], materials: ["cotton"], warmth: 2, formality: 3 },
  { name: "Mid-blue straight jeans", category: "trousers", subcategory: "jeans", colours: [c("mid blue", "#4a6fa0")], materials: ["denim"], warmth: 3, formality: 2, details: { leg: "straight" } },
  { name: "Beige chinos", category: "trousers", subcategory: "chinos", colours: [c("beige", "#d2bf9d")], materials: ["cotton"], warmth: 2, formality: 3 },
  { name: "Black tailored trousers", category: "trousers", subcategory: "tailored trousers", colours: [c("black", "#1c1b1a")], materials: ["wool"], warmth: 3, formality: 4, details: { leg: "straight" } },
  { name: "Grey joggers", category: "trousers", subcategory: "joggers", colours: [c("grey", "#8a8c8e")], materials: ["cotton"], warmth: 2, formality: 1 },
  { name: "Black leggings", category: "trousers", subcategory: "leggings", colours: [c("black", "#1c1b1a")], materials: ["elastane"], warmth: 2, formality: 1, occasions: ["sport"] },
  { name: "Black Nike athletic shorts", category: "shorts", subcategory: "athletic shorts", brand: "Nike", colours: [c("black", "#1c1b1a")], materials: ["polyester"], warmth: 1, formality: 1, seasons: ["spring", "summer"], weather: ["breathable"], occasions: ["sport"] },
  { name: "Denim shorts", category: "shorts", subcategory: "denim shorts", colours: [c("light wash", "#8aa4c2")], materials: ["denim"], warmth: 1, formality: 2, seasons: ["summer"] },
  { name: "Black midi skirt", category: "skirts", subcategory: "midi skirt", colours: [c("black", "#1c1b1a")], warmth: 2, formality: 3 },
  { name: "Green floral midi dress", category: "dresses", subcategory: "midi dress", colours: [c("green", "#3f6b45"), c("cream", "#ece2c8")], pattern: "floral", warmth: 2, formality: 3, seasons: ["spring", "summer"] },
  { name: "Navy blazer", category: "outerwear", subcategory: "blazer", colours: [c("navy", "#1f2a44")], warmth: 3, formality: 4 },
  { name: "Denim jacket", category: "outerwear", subcategory: "denim jacket", colours: [c("mid blue", "#4a6fa0")], materials: ["denim"], warmth: 2, formality: 2, seasons: ["spring", "autumn"] },
  { name: "Beige trench coat", category: "outerwear", subcategory: "trench coat", colours: [c("beige", "#d2bf9d")], materials: ["cotton"], warmth: 3, formality: 3, weather: ["water-resistant"], seasons: ["spring", "autumn"] },
  { name: "Black rain jacket", category: "outerwear", subcategory: "rain jacket", colours: [c("black", "#1c1b1a")], materials: ["nylon"], warmth: 2, formality: 2, weather: ["waterproof", "windproof"] },
  { name: "Black puffer jacket", category: "outerwear", subcategory: "puffer jacket", colours: [c("black", "#1c1b1a")], materials: ["nylon", "down"], warmth: 5, formality: 2, seasons: ["winter"], weather: ["insulated", "water-resistant"] },
  { name: "White sneakers", category: "footwear", subcategory: "sneakers", colours: [c("white", "#f4f1ea")], materials: ["leather"], warmth: 2, formality: 2 },
  { name: "Black running shoes", category: "footwear", subcategory: "running shoes", colours: [c("black", "#1c1b1a")], materials: ["mesh"], warmth: 2, formality: 1, weather: ["breathable"], occasions: ["sport"] },
  { name: "Brown chelsea boots", category: "footwear", subcategory: "chelsea boots", colours: [c("brown", "#6b4a32")], materials: ["leather"], warmth: 3, formality: 3 },
  { name: "Black loafers", category: "footwear", subcategory: "loafers", colours: [c("black", "#1c1b1a")], materials: ["leather"], warmth: 2, formality: 4 },
  { name: "Tan sandals", category: "footwear", subcategory: "sandals", colours: [c("tan", "#b98b5c")], materials: ["leather"], warmth: 1, formality: 2, seasons: ["summer"] },
  { name: "Black baseball cap", category: "accessories", subcategory: "baseball cap", colours: [c("black", "#1c1b1a")], formality: 1 },
  { name: "Grey beanie", category: "accessories", subcategory: "beanie", colours: [c("grey", "#8a8c8e")], materials: ["acrylic"], warmth: 3, formality: 2, seasons: ["winter"] },
  { name: "Brown leather belt", category: "accessories", subcategory: "belt", colours: [c("brown", "#6b4a32")], materials: ["leather"], formality: 3 },
  { name: "Black backpack", category: "accessories", subcategory: "backpack", colours: [c("black", "#1c1b1a")], formality: 2 },
];

export function loadSampleWardrobe() {
  return createGarments(SAMPLE_WARDROBE, "sample");
}
