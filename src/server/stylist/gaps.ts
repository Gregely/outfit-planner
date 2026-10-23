import "server-only";
import { isNeutral } from "@/lib/colours";
import { slotFor } from "@/lib/domain";
import type { Garment } from "@/server/db/schema";
import { AiUnavailableError, REASON_TEXT, aiStatus } from "@/server/ai/client";
import { aiGapAnalysis } from "@/server/ai/tasks";
import { getProfile } from "@/server/services/preferences";
import type { Profile } from "@/lib/schemas";
import { loadGarments } from "./context";

export type Gap = { piece: string; why: string; pairsWith: { id: number; name: string }[]; priority: "high" | "medium" | "low"; source: "ai" | "rules" };

const t = (g: Garment) => `${g.name} ${g.subcategory ?? ""} ${g.materials.join(" ")}`.toLowerCase();

function pick(gs: Garment[], pred: (g: Garment) => boolean, n = 5) {
  return gs
    .filter(pred)
    .sort((a, b) => b.wearCount - a.wearCount)
    .slice(0, n)
    .map((g) => ({ id: g.id, name: g.name }));
}

/** Simple coverage checks over the actual wardrobe. Only reports gaps the wardrobe really has. */
export function ruleGaps(gs: Garment[], profile: Profile): Gap[] {
  const gaps: Gap[] = [];
  const by = (slots: string[]) => gs.filter((g) => slots.includes(slotFor(g)));
  const tops = by(["top"]);
  const lowers = by(["bottom", "onepiece", "suit"]);
  const outers = by(["outer"]);
  const shoes = by(["footwear"]);
  const mids = by(["mid"]);
  const tailoringFan = profile.formality >= 3 || profile.aesthetics.some((a) => /academia|classic|menswear|ivy|preppy|smart/.test(a));
  if (gs.length < 6) return [];

  if (!outers.some((g) => g.weather.includes("waterproof") || g.weather.includes("water-resistant") || /trench|mac|rain|parka|wax/.test(t(g)))) {
    gaps.push({
      piece: outers.length ? "A water-resistant coat (a trench or waxed jacket in a neutral)" : "A versatile coat",
      why: outers.length ? "None of your coats are marked rain-ready, so wet days limit your outerwear." : "You have no outerwear, so cold or wet days have no answer.",
      pairsWith: pick(gs, (g) => ["top", "mid", "bottom"].includes(slotFor(g))),
      priority: "high",
      source: "rules",
    });
  }
  const neutralLowers = lowers.filter((g) => g.colours[0] && isNeutral(g.colours[0].hex));
  if (lowers.length && neutralLowers.length < 2) {
    gaps.push({
      piece: "Neutral trousers (navy, grey, charcoal or stone)",
      why: `Only ${neutralLowers.length} of your bottoms are neutral, which makes your tops and jackets harder to combine.`,
      pairsWith: pick(gs, (g) => ["top", "mid", "outer"].includes(slotFor(g))),
      priority: "high",
      source: "rules",
    });
  }
  if (!shoes.some((g) => g.formality >= 4)) {
    gaps.push({
      piece: "Smart leather shoes (dark brown derbies or loafers)",
      why: "No footwear in your wardrobe is formal enough for presentations, interviews or dinners.",
      pairsWith: pick(gs, (g) => g.formality >= 3 && slotFor(g) !== "footwear"),
      priority: tailoringFan ? "high" : "medium",
      source: "rules",
    });
  }
  if (!shoes.some((g) => /sneaker|trainer|canvas/.test(t(g)))) {
    gaps.push({
      piece: "Clean, minimal sneakers",
      why: "There's no relaxed shoe for casual days, so casual outfits lean on boots or dress shoes.",
      pairsWith: pick(gs, (g) => g.formality <= 3 && slotFor(g) !== "footwear"),
      priority: "medium",
      source: "rules",
    });
  }
  if (!shoes.some((g) => /boot/.test(t(g)))) {
    gaps.push({
      piece: "A pair of leather or suede boots",
      why: "Without boots, cold or rainy days have no sturdy footwear option.",
      pairsWith: pick(gs, (g) => ["bottom", "outer"].includes(slotFor(g))),
      priority: "medium",
      source: "rules",
    });
  }
  if (tops.length < 4) {
    gaps.push({
      piece: "More base layers (plain tees or oxford shirts in white, ecru or light blue)",
      why: `You have ${tops.length} base top${tops.length === 1 ? "" : "s"}; these need washing most often, so the week runs out quickly.`,
      pairsWith: pick(gs, (g) => ["bottom", "mid", "outer"].includes(slotFor(g))),
      priority: "high",
      source: "rules",
    });
  }
  if (!mids.some((g) => g.category === "knitwear" && g.colours[0] && isNeutral(g.colours[0].hex))) {
    gaps.push({
      piece: "A neutral knit (navy, oatmeal or grey crewneck)",
      why: "A neutral jumper is the easiest mid layer for cool days and works over almost every shirt you own.",
      pairsWith: pick(gs, (g) => ["top", "bottom"].includes(slotFor(g))),
      priority: "medium",
      source: "rules",
    });
  }
  if (tailoringFan && !gs.some((g) => /blazer|sport coat|suit/.test(t(g)))) {
    gaps.push({
      piece: "An unstructured blazer in a muted colour",
      why: "Your style leans tailored, but there's no jacket to sharpen an outfit for seminars, dinners or presentations.",
      pairsWith: pick(gs, (g) => ["top", "bottom", "mid"].includes(slotFor(g)) && g.formality >= 2),
      priority: "medium",
      source: "rules",
    });
  }
  if (lowers.some((g) => g.category === "trousers") && profile.formality >= 3 && !gs.some((g) => /belt/.test(t(g)))) {
    gaps.push({
      piece: "A leather belt matching your shoes",
      why: "Trousers with belt loops look unfinished at smart-casual and above without one.",
      pairsWith: pick(gs, (g) => g.category === "trousers"),
      priority: "low",
      source: "rules",
    });
  }
  return gaps.slice(0, 6);
}

export async function gapAnalysis(opts: { useAi?: boolean } = {}) {
  const gs = loadGarments();
  const profile = getProfile();
  const byId = new Map(gs.map((g) => [g.id, g]));
  let notice: string | null = null;
  if (opts.useAi && gs.length >= 6) {
    const status = aiStatus();
    if (status.enabled) {
      try {
        const out = await aiGapAnalysis(gs, profile);
        return {
          notice: null,
          gaps: out.slice(0, 6).map(
            (g): Gap => ({
              piece: g.piece.slice(0, 160),
              why: g.why.slice(0, 600),
              priority: g.priority,
              source: "ai",
              pairsWith: g.pairs_with_ids.filter((id) => byId.has(id)).slice(0, 6).map((id) => ({ id, name: byId.get(id)!.name })),
            }),
          ),
        };
      } catch (err) {
        notice = err instanceof AiUnavailableError ? `${REASON_TEXT[err.reason]} – showing the built-in checks.` : "Showing the built-in checks.";
      }
    } else notice = `${REASON_TEXT[status.reason!]} – showing the built-in checks.`;
  }
  return { notice, gaps: ruleGaps(gs, profile) };
}
