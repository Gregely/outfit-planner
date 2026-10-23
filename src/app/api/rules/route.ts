import { route, readJson } from "@/server/api";
import { createRule, listRules } from "@/server/services/preferences";
import { ruleInputSchema } from "@/lib/schemas";

export const GET = route(() => ({ rules: listRules() }));
export const POST = route(async (req) => ({ rule: createRule(await readJson(req, ruleInputSchema)) }));
