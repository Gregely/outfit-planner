import "server-only";
import { isNeutral } from "@/lib/colours";
import { slotFor } from "@/lib/domain";
import type { Garment } from "@/server/db/schema";
import { AiUnavailableError, aiStatus, describeAiError } from "@/server/ai/client";
import { capitalise } from "@/server/ai/errors";
import { aiGapAnalysis } from "@/server/ai/tasks";
import { getProfile } from "@/server/services/preferences";
import type { Profile } from "@/lib/schemas";
import { loadGarments } from "./context";

export type Gap = { piece: string; why: string; pairsWith: { id: number; name: string }[]; priority: "high" | "medium" | "low"; source: "ai" | "rules"; generatedBy?: string | null };

const t = (g: Garment) => `${g.name} ${g.subcategory ?? ""} ${g.materials.join(" ")}`.toLowerCase();

function pick(gs: Garment[], pred: (g: Garment) => boolean, n = 5) {
  return gs
    .filter(pred)
    .sort((a, b) => b.wearCount - a.wearCount)
    .slice(0, n)
    .map((g) => ({ id: g.id, name: g.name }));
}

/**
 * Coverage checks over the actual wardrobe. Each gap is grounded in what the person owns (or
 * their own stated preferences) – never in a particular aesthetic – and names the garments it
 * would work with.
 */
export function ruleGaps(gs: Garment[], profile: Profile): Gap[] {
  const gaps: Gap[] = [];
  if (gs.length < 6) return [];
  const by = (slots: string[]) => gs.filter((g) => slots.includes(slotFor(g)));
  const tops = by(["top"]);
  const lowers = by(["bottom", "onepiece", "suit"]);
  const outers = by(["outer"]);
  const shoes = by(["footwear"]);
  const smartPieces = gs.filter((g) => g.formality >= 4 && slotFor(g) !== "footwear" && slotFor(g) !== "accessory");
  const casualPieces = gs.filter((g) => g.formality <= 2 && slotFor(g) !== "footwear" && slotFor(g) !== "accessory");
  const wantsTailoring =
    (profile.formality ?? 0) >= 4 || profile.aesthetics.some((a) => /tailor|classic|academia|menswear|preppy|business|smart|formal/.test(a));

  if (!gs.some((g) => (slotFor(g) === "outer" || slotFor(g) === "mid") && (g.weather.includes("waterproof") || g.weather.includes("water-resistant") || /rain|trench|mac|parka|anorak|shell|wax/.test(t(g))))) {
    gaps.push({
      piece: "A rain-ready outer layer (for example a rain jacket, trench or parka)",
      why: outers.length ? "None of your outerwear is marked waterproof or water-resistant, so wet days have no good option." : "You have no outerwear yet, so cold or wet days have no answer.",
      pairsWith: pick(gs, (g) => ["top", "mid", "bottom", "onepiece"].includes(slotFor(g))),
      priority: "high",
      source: "rules",
    });
  }
  const neutralLowers = lowers.filter((g) => g.colours[0] && isNeutral(g.colours[0].hex));
  if (lowers.length && neutralLowers.length < 2) {
    gaps.push({
      piece: "Bottoms in a neutral colour",
      why: `Only ${neutralLowers.length} of your bottoms ${neutralLowers.length === 1 ? "is" : "are"} a neutral colour, which makes your tops harder to combine.`,
      pairsWith: pick(gs, (g) => ["top", "mid", "outer"].includes(slotFor(g))),
      priority: "high",
      source: "rules",
    });
  }
  if (smartPieces.length >= 2 && !shoes.some((g) => g.formality >= 4)) {
    gaps.push({
      piece: "Shoes that match your smarter pieces",
      why: `You own ${smartPieces.length} smart pieces but no footwear as formal as them.`,
      pairsWith: pick(smartPieces, () => true),
      priority: "medium",
      source: "rules",
    });
  }
  if (casualPieces.length >= 3 && !shoes.some((g) => g.formality <= 2)) {
    gaps.push({
      piece: "Everyday casual shoes (for example sneakers or trainers)",
      why: "Your casual pieces have no relaxed shoes to go with them.",
      pairsWith: pick(casualPieces, () => true),
      priority: "medium",
      source: "rules",
    });
  }
  if (shoes.length && !shoes.some((g) => /boot/.test(t(g)) || g.weather.includes("waterproof") || g.weather.includes("water-resistant"))) {
    gaps.push({
      piece: "Footwear for wet or cold days",
      why: "None of your shoes are boots or marked water-resistant.",
      pairsWith: pick(gs, (g) => ["bottom", "outer"].includes(slotFor(g))),
      priority: "medium",
      source: "rules",
    });
  }
  if (tops.length < 4) {
    gaps.push({
      piece: "More everyday tops",
      why: `You have ${tops.length} base top${tops.length === 1 ? "" : "s"}; these need washing most often, so the week runs out quickly.`,
      pairsWith: pick(gs, (g) => ["bottom", "mid", "outer"].includes(slotFor(g))),
      priority: "high",
      source: "rules",
    });
  }
  if (!gs.some((g) => slotFor(g) === "mid" && g.warmth >= 2 && g.category !== "outerwear")) {
    gaps.push({
      piece: "A warm mid layer (for example a jumper, sweatshirt, cardigan or fleece)",
      why: "There's nothing to layer between a top and a coat on cool days.",
      pairsWith: pick(gs, (g) => ["top", "bottom"].includes(slotFor(g))),
      priority: "medium",
      source: "rules",
    });
  }
  if (wantsTailoring && !gs.some((g) => /blazer|sport coat|suit/.test(t(g)))) {
    gaps.push({
      piece: "A blazer or tailored jacket",
      why: "Your profile leans tailored, but there's no jacket to sharpen an outfit.",
      pairsWith: pick(gs, (g) => ["top", "bottom", "mid"].includes(slotFor(g)) && g.formality >= 2),
      priority: "medium",
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
    const status = aiStatus("daily");
    if (status.enabled) {
      try {
        const { gaps: out, meta } = await aiGapAnalysis(gs, profile);
        return {
          notice: null,
          generatedBy: `${meta.providerLabel} · ${meta.model}`,
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
        notice = err instanceof AiUnavailableError ? `${capitalise(describeAiError(err))} – showing the built-in checks.` : "Showing the built-in checks.";
      }
    } else notice = `${capitalise(status.message ?? "AI isn't available")} – showing the built-in checks.`;
  }
  return { notice, generatedBy: null, gaps: ruleGaps(gs, profile) };
}
