import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, businessWindow, parseDateParam } from "./time";
import { PAY_FILTERS, type PayFilter } from "./payments";
import type { Booking, BookingPayment, BookingSource, BookingStatus, Settings, Station } from "./types";
import { STATUS_LABEL } from "./types";

export interface BookingFilters {
  from: string;
  to: string;
  q: string;
  status: BookingStatus | "";
  /** Payment filter, applied after loading (dues depend on each station's price). */
  pay: PayFilter;
  /** World name */
  world: string;
  /** Station id */
  station: string;
  source: BookingSource | "";
  /** Game id, or "none" for bookings without a game */
  game: string;
}

export const FILTER_KEYS = ["from", "to", "q", "status", "pay", "world", "station", "source", "game"] as const;

type Params = Record<string, string | string[] | undefined>;

/** `today` is passed in (from requestToday()) so parsing never reads the clock itself. */
export function parseFilters(sp: Params | URLSearchParams, today: string): BookingFilters {
  const get = (k: string) => (sp instanceof URLSearchParams ? (sp.get(k) ?? undefined) : sp[k]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const from = get("from") ? parseDateParam(get("from"), today) : today;
  let to = get("to") ? parseDateParam(get("to"), today) : addDays(today, 6);
  if (to < from) to = from;
  // Cap the range at ~2 years so one request can't ask for everything
  if (to > addDays(from, 731)) to = addDays(from, 731);
  const status = one(get("status"));
  const pay = one(get("pay"));
  const source = one(get("source"));
  const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : "");
  const game = one(get("game"));
  return {
    from,
    to,
    q: one(get("q")).trim().slice(0, 60),
    status: status in STATUS_LABEL ? (status as BookingStatus) : "",
    pay: pay in PAY_FILTERS ? (pay as PayFilter) : "",
    world: one(get("world")).trim().slice(0, 40),
    station: uuid(one(get("station"))),
    source: source === "online" || source === "staff" ? source : "",
    game: game === "none" ? "none" : uuid(game),
  };
}

/** Query string for a set of filters (empty values left out). */
export function filtersQuery(f: BookingFilters, extra: Partial<Record<keyof BookingFilters, string>> = {}): string {
  const merged = { ...f, ...extra } as Record<string, string>;
  return new URLSearchParams(FILTER_KEYS.filter((k) => merged[k]).map((k) => [k, merged[k]])).toString();
}

export type BookingWithPayments = Booking & { booking_payments?: BookingPayment[] };

/**
 * Bookings starting in the filtered business days, with their payments.
 * The payment filter is applied by the caller (it needs prices).
 */
export async function queryBookings(
  sb: SupabaseClient,
  settings: Settings,
  f: BookingFilters,
  stations: Station[] = [],
): Promise<BookingWithPayments[]> {
  const start = businessWindow(f.from, settings).opensAt.toISOString();
  const end = businessWindow(f.to, settings).closesAt.toISOString();
  const run = (select: string) => {
    let q = sb.from("bookings").select(select).gte("starts_at", start).lt("starts_at", end).order("starts_at").limit(5000);
    if (f.status) q = q.eq("status", f.status);
    if (f.source) q = q.eq("source", f.source);
    if (f.station) q = q.eq("station_id", f.station);
    if (f.world) q = q.in("station_id", stations.filter((s) => s.type === f.world).map((s) => s.id).concat(["00000000-0000-0000-0000-000000000000"]));
    if (f.game === "none") q = q.is("game_id", null);
    else if (f.game) q = q.eq("game_id", f.game);
    if (f.q) {
      const term = f.q.replace(/[%,()*\\]/g, " ").trim();
      const digits = term.replace(/\D/g, "");
      q = digits.length >= 3
        ? q.or(`customer_name.ilike.%${term}%,phone.ilike.%${digits}%`)
        : q.ilike("customer_name", `%${term}%`);
    }
    return q;
  };
  let res = await run("*, booking_payments(*)");
  // Before migration 0006 there's no payments table to embed
  if (res.error && /booking_payments|relationship/i.test(res.error.message)) res = await run("*");
  if (res.error) throw new Error(res.error.message);
  return res.data as unknown as BookingWithPayments[];
}
