import "server-only";
import type { ActivityInput } from "@/lib/schemas";
import type { DressCode } from "@/lib/domain";
import { AiUnavailableError, aiStatus, describeAiError } from "@/server/ai/client";
import { aiParseActivities } from "@/server/ai/tasks";
import { BadRequestError } from "@/server/errors";

const CODE_WORDS: [RegExp, DressCode][] = [
  [/\b(wedding|gala|black tie|funeral|opera)\b/, "formal"],
  [/\b(interview|client|board meeting|court)\b/, "business"],
  [/\b(presentation|pitch|conference|meeting|office|work|seminar talk)\b/, "business-casual"],
  [/\b(date|dinner|restaurant|theatre|theater|gallery|museum|brunch)\b/, "smart-casual"],
  [/\b(party|drinks|bar|pub|gig|concert|club)\b/, "casual"],
  [/\b(college|lecture|class|seminar|library|uni|study|school|lab)\b/, "casual"],
  [/\b(gym|run|running|yoga|football|tennis|hike|hiking|climb|cycling|swim)\b/, "active"],
  [/\b(errands|shopping|groceries|chores|coffee|lunch|walk)\b/, "casual"],
];

const OUTDOOR = /\b(walk|hike|hiking|park|outdoor|outside|cycling|bike|run|running|football|market|festival|picnic|garden|beach|dog)\b/;
const MIXED = /\b(commute|travel|errands|shopping|city|town|tour|wander)\b/;

function to24(h: number, m: number, mer: string | undefined, fallbackPm: boolean) {
  let hour = h;
  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  if (!mer && fallbackPm && hour >= 1 && hour <= 7) hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function times(fragment: string): { start: string | null; end: string | null } {
  const t = fragment.toLowerCase();
  const range = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/);
  if (range) {
    const mer2 = range[6];
    const mer1 = range[3] ?? (mer2 && Number(range[1]) <= Number(range[4]) ? mer2 : undefined);
    return { start: to24(Number(range[1]), Number(range[2] ?? 0), mer1, true), end: to24(Number(range[4]), Number(range[5] ?? 0), mer2, true) };
  }
  const single = t.match(/(?:at|from|@|around|by)?\s*\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b|\b(?:at|from|@|around)\s+(\d{1,2})(?:[:.](\d{2}))?\b/);
  if (single) {
    const h = Number(single[1] ?? single[4]);
    const m = Number(single[2] ?? single[5] ?? 0);
    if (h <= 23 && m <= 59) return { start: to24(h, m, single[3], true), end: null };
  }
  if (/\bbreakfast\b|\bmorning\b/.test(t)) return { start: "09:00", end: null };
  if (/\blunch\b|\bmidday\b|\bnoon\b/.test(t)) return { start: "12:30", end: null };
  if (/\bafternoon\b/.test(t)) return { start: "14:00", end: null };
  if (/\bevening\b|\btonight\b|\bdinner\b|\bnight\b/.test(t)) return { start: "19:00", end: null };
  return { start: null, end: null };
}

export function parseActivitiesHeuristic(text: string, date: string): ActivityInput[] {
  const fragments = text
    // split on separators; "and" only when the next clause has its own time ("… and dinner at 7")
    .split(/\n+|;|\.\s+|,\s*(?:and\s+)?(?:then\s+)?|\s+then\s+|\s+and then\s+|\s+followed by\s+|\s+after that\s+|\s+and\s+(?=[^,;]*\b(?:at|from|around)\s+\d)/i)
    .map((f) => f.trim().replace(/^(and|then|also|i have|i've got|i'm|going to|got)\s+/i, "").replace(/[.!]+$/, ""))
    .filter((f) => f.length > 1);
  return fragments.slice(0, 12).map((f) => {
    const lower = f.toLowerCase();
    const { start, end } = times(f);
    const dressCode = CODE_WORDS.find(([re]) => re.test(lower))?.[1] ?? "none";
    const setting = OUTDOOR.test(lower) ? "outdoor" : MIXED.test(lower) ? "mixed" : "indoor";
    const title = f
      .replace(/\b(at|from|around)?\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?(\s*(-|–|to|until|till)\s*\d{1,2}([:.]\d{2})?\s*(am|pm)?)?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return {
      date,
      title: (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 120) || "Activity",
      startTime: start,
      endTime: end && start && end > start ? end : null,
      dressCode,
      setting,
      notes: null,
    };
  });
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function parseDayPlan(text: string, date: string, opts: { useAi?: boolean } = {}) {
  const clean = text.trim();
  if (!clean) throw new BadRequestError("Describe your day first.");
  if (clean.length > 2000) throw new BadRequestError("Please keep the description under 2,000 characters.");
  let notice: string | null = null;
  if (opts.useAi !== false) {
    const status = aiStatus();
    if (status.enabled) {
      try {
        const acts = await aiParseActivities(clean, date);
        return {
          method: "ai" as const,
          notice: null,
          activities: acts.slice(0, 12).map(
            (a): ActivityInput => ({
              date,
              title: a.title.slice(0, 120) || "Activity",
              startTime: a.start_time && HHMM.test(a.start_time) ? a.start_time : null,
              endTime: a.end_time && HHMM.test(a.end_time) ? a.end_time : null,
              dressCode: a.dress_code,
              setting: a.setting,
              notes: a.notes.trim().slice(0, 500) || null,
            }),
          ),
        };
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
        notice = `Claude couldn't read it – ${describeAiError(err)}. Used the offline parser.`;
      }
    }
  }
  return { method: "rules" as const, notice, activities: parseActivitiesHeuristic(clean, date) };
}
