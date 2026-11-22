// All business logic runs in IST (Asia/Kolkata, fixed UTC+05:30, no DST).
import type { Closure, DayHours, WeeklyHours } from "./types";

export const TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;
const MIN = 60_000;

/** "YYYY-MM-DD" for the given instant in IST. */
export function istDate(d: Date = new Date()): string {
  return new Date(d.getTime() + IST_OFFSET_MIN * MIN).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** "HH:MM[:SS]" -> minutes since midnight */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Instant for `date` (IST) + minutes since its midnight (may exceed 24h). */
export function istInstant(date: string, minutes: number): Date {
  return new Date(new Date(`${date}T00:00:00+05:30`).getTime() + minutes * MIN);
}

export interface WindowSettings {
  open_time: string;
  close_time: string;
  slot_minutes: number;
  weekly_hours?: WeeklyHours | null;
}

/** Opening hours for a date (mirrors business_window() in SQL). */
export function hoursFor(date: string, s: WindowSettings, closures: Closure[] = []) {
  const d: DayHours = s.weekly_hours?.[String(weekday(date))] ?? {};
  const open = d.open ?? s.open_time.slice(0, 5);
  const close = d.close ?? s.close_time.slice(0, 5);
  const closure = closures.find((c) => c.date === date);
  return { open, close, closed: Boolean(d.closed) || Boolean(closure), reason: closure?.reason ?? "" };
}

/** Regular weekly hours for a weekday (0 = Sunday), ignoring one-off closures. */
export function hoursForWeekday(dow: number, s: WindowSettings) {
  const d: DayHours = s.weekly_hours?.[String(dow)] ?? {};
  return { open: d.open ?? s.open_time.slice(0, 5), close: d.close ?? s.close_time.slice(0, 5), closed: Boolean(d.closed) };
}

/**
 * Opening and closing instants for a business day (handles after-midnight closing).
 * `closed` is true on closed weekdays and closure dates; the times are still
 * returned so staff can see (and override) the day.
 */
export function businessWindow(date: string, s: WindowSettings, closures: Closure[] = []) {
  const h = hoursFor(date, s, closures);
  const open = timeToMinutes(h.open);
  let close = timeToMinutes(h.close);
  if (close <= open) close += 24 * 60;
  return { opensAt: istInstant(date, open), closesAt: istInstant(date, close), closed: h.closed, reason: h.reason };
}

/** Slot start instants from opening up to (not including) closing. */
export function daySlots(date: string, s: WindowSettings, closures: Closure[] = []): Date[] {
  const { opensAt, closesAt } = businessWindow(date, s, closures);
  const out: Date[] = [];
  for (let t = opensAt.getTime(); t < closesAt.getTime(); t += s.slot_minutes * MIN) {
    out.push(new Date(t));
  }
  return out;
}

export type OpenState =
  | { open: true; until: Date }
  | { open: false; opensAt: Date | null };

/** Is the cafe open at `now`? Considers last night's after-midnight hours too. */
export function openState(now: Date, s: WindowSettings, closures: Closure[] = []): OpenState {
  const today = istDate(now);
  for (const d of [addDays(today, -1), today]) {
    const w = businessWindow(d, s, closures);
    if (!w.closed && now >= w.opensAt && now < w.closesAt) return { open: true, until: w.closesAt };
  }
  for (let i = 0; i < 14; i++) {
    const w = businessWindow(addDays(today, i), s, closures);
    if (!w.closed && w.opensAt > now) return { open: false, opensAt: w.opensAt };
  }
  return { open: false, opensAt: null };
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export function fmtTime(d: Date | string): string {
  return timeFmt.format(typeof d === "string" ? new Date(d) : d).replace(" ", " ").toLowerCase();
}

/** "11 am", "11:30 pm" */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 && h < 24 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
export function fmtDay(date: string): string {
  return dayFmt.format(new Date(`${date}T12:00:00+05:30`));
}

const longDayFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
export function fmtLongDay(date: string): string {
  return longDayFmt.format(new Date(`${date}T12:00:00+05:30`));
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h} hr${h > 1 ? "s" : ""}`;
}

export function minutesBetween(a: Date | string, b: Date | string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / MIN);
}

/**
 * Date input value (YYYY-MM-DD) -> sane or `fallback`. The fallback is explicit
 * so this never reads the clock itself; on the server pass `await requestToday()`.
 */
export function parseDateParam(v: string | string[] | undefined, fallback: string): string {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : fallback;
}

/** Business day an instant belongs to (after-midnight slots count toward the previous day). */
export function businessDateOf(iso: string, s: WindowSettings): string {
  const d = istDate(new Date(iso));
  const prev = addDays(d, -1);
  const { closesAt } = businessWindow(prev, s);
  return new Date(iso) < closesAt ? prev : d;
}
