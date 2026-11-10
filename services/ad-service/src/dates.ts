import { HttpError } from "../../../packages/service-kit";

/** Ad days are calendar days in Bangladesh time (UTC+6, no DST). */
const DHAKA_OFFSET_MS = 6 * 3600_000;
const DAY_MS = 86_400_000;

export const dhakaToday = (now: Date = new Date()): string => new Date(now.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
export const toDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);
export const dayStr = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => dayStr(new Date(toDate(day).getTime() + n * DAY_MS));
/** Inclusive number of days from `from` to `to`. */
export const daysInclusive = (from: string, to: string): number => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS) + 1;

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Strict YYYY-MM-DD that is also a real calendar date (rejects 2026-02-30). */
export function parseDay(v: unknown, name: string): string {
  const s = String(v ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || dayStr(toDate(s)) !== s) {
    throw new HttpError(400, `${name} must be a valid date (YYYY-MM-DD)`, "VALIDATION");
  }
  return s;
}
