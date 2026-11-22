import type { SupabaseClient } from "@supabase/supabase-js";
import type { Booking, BookingStatus } from "./types";

/** Open-ended upper bound for "everything from now on" windows. */
export const FAR_FUTURE = "2100-01-01T00:00:00Z";

/** Bookings overlapping [from, to). Shared by the server render and the live client hook. */
export function bookingsOverlapping(sb: SupabaseClient, from: string, to: string, status?: BookingStatus) {
  let q = sb.from("bookings").select("*").lt("starts_at", to).gt("ends_at", from);
  if (status) q = q.eq("status", status);
  return q.order("starts_at").overrideTypes<Booking[], { merge: false }>();
}

/** Server-loaded bookings for one window, used to seed useLiveBookings. */
export interface InitialBookings {
  from: string;
  to: string;
  bookings: Booking[];
}
