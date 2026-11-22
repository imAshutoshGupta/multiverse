import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, businessWindow, parseDateParam } from "./time";
import type { Booking, BookingStatus, Settings } from "./types";
import { STATUS_LABEL } from "./types";

export interface BookingFilters {
  from: string;
  to: string;
  q: string;
  status: BookingStatus | "";
}

type Params = Record<string, string | string[] | undefined>;

/** `today` is passed in (from requestToday()) so parsing never reads the clock itself. */
export function parseFilters(sp: Params | URLSearchParams, today: string): BookingFilters {
  const get = (k: string) => (sp instanceof URLSearchParams ? (sp.get(k) ?? undefined) : sp[k]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const from = get("from") ? parseDateParam(get("from"), today) : today;
  let to = get("to") ? parseDateParam(get("to"), today) : addDays(today, 6);
  if (to < from) to = from;
  const status = one(get("status"));
  return {
    from,
    to,
    q: one(get("q")).trim().slice(0, 60),
    status: status in STATUS_LABEL ? (status as BookingStatus) : "",
  };
}

export async function queryBookings(sb: SupabaseClient, settings: Settings, f: BookingFilters) {
  const start = businessWindow(f.from, settings).opensAt.toISOString();
  const end = businessWindow(f.to, settings).closesAt.toISOString();
  let q = sb.from("bookings").select("*").gte("starts_at", start).lt("starts_at", end).order("starts_at").limit(2000);
  if (f.status) q = q.eq("status", f.status);
  if (f.q) {
    const term = f.q.replace(/[%,()*\\]/g, " ").trim();
    const digits = term.replace(/\D/g, "");
    q = digits.length >= 3
      ? q.or(`customer_name.ilike.%${term}%,phone.ilike.%${digits}%`)
      : q.ilike("customer_name", `%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as Booking[];
}
