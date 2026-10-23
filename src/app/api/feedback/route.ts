import { route, readJson } from "@/server/api";
import { listFeedback, recordFeedback } from "@/server/services/preferences";
import { feedbackInputSchema } from "@/lib/schemas";

export const GET = route(() => ({ feedback: listFeedback() }));
export const POST = route(async (req) => recordFeedback(await readJson(req, feedbackInputSchema)));
