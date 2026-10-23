/** Calendar-date helpers. Dates are plain "YYYY-MM-DD" strings interpreted in the user's timezone. */

export function isDateString(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toUtc(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function daysBetween(a: string, b: string) {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string) {
  return toUtc(date).getUTCDay();
}

export function startOfWeek(date: string, weekStartsOn: 0 | 1 = 1) {
  const diff = (weekday(date) - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function weekDates(start: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Today's date in an IANA timezone (falls back to the server's local zone). */
export function todayIn(timeZone?: string | null, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return fromUtc(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  }
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayName(date: string, short = false) {
  const name = DAY_NAMES[weekday(date)];
  return short ? name.slice(0, 3) : name;
}

export function formatDate(date: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  const [y, m, d] = date.split("-").map(Number);
  const base = `${d} ${MONTHS[m - 1]}${opts.year ? ` ${y}` : ""}`;
  return opts.weekday ? `${dayName(date, true)} ${base}` : base;
}

export function relativeDay(date: string, today: string) {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return dayName(date);
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return formatDate(date, { weekday: true });
}

export function monthOf(date: string) {
  return Number(date.slice(5, 7));
}
