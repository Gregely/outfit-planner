import { route } from "@/server/api";
import { gapAnalysis } from "@/server/stylist/gaps";

export const GET = route(async (req) => gapAnalysis({ useAi: new URL(req.url).searchParams.get("ai") === "1" }));
