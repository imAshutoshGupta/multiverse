import { bookingPrice } from "./availability";
import type { Booking, BookingStatus, PaymentMethod, Station, StationType } from "./types";
import { minutesBetween } from "./time";

/**
 * - unpaid:   nothing paid yet
 * - advance:  part paid, balance due
 * - paid:     fully paid
 * - overpaid: paid more than the total (refund or adjust)
 * - closed:   cancelled / no-show, so nothing is due (any money kept is shown as paid)
 */
export type PayState = "unpaid" | "advance" | "paid" | "overpaid" | "closed";

export interface PaySummary {
  total: number;
  paid: number;
  due: number;
  state: PayState;
}

/** Statuses where the customer still owes the booking amount. */
const OWES: BookingStatus[] = ["pending", "confirmed", "arrived", "completed"];

/** Agreed amount: the booking's own price if staff set one, else the station's standard rate. */
export function bookingTotal(
  b: Pick<Booking, "starts_at" | "ends_at" | "party_size"> & { price?: number | string | null },
  station: Pick<Station, "hourly_rate" | "type"> | undefined,
  types: StationType[],
): number {
  if (b.price !== null && b.price !== undefined && b.price !== "") return Number(b.price);
  return bookingPrice(station, types, minutesBetween(b.starts_at, b.ends_at), b.party_size);
}

export function paySummary(status: BookingStatus, total: number, paidRaw: number | string | null | undefined): PaySummary {
  const paid = Number(paidRaw ?? 0);
  if (!OWES.includes(status)) return { total, paid, due: 0, state: "closed" };
  const due = Math.max(0, total - paid);
  const state: PayState = paid > total ? "overpaid" : paid >= total ? "paid" : paid > 0 ? "advance" : "unpaid";
  return { total, paid, due, state };
}

export function bookingPay(
  b: Pick<Booking, "starts_at" | "ends_at" | "party_size" | "status"> & { price?: number | string | null; paid_amount?: number | string | null },
  station: Pick<Station, "hourly_rate" | "type"> | undefined,
  types: StationType[],
): PaySummary {
  return paySummary(b.status, bookingTotal(b, station, types), b.paid_amount);
}

export const PAY_LABEL: Record<PayState, string> = {
  unpaid: "Not paid",
  advance: "Advance paid",
  paid: "Paid",
  overpaid: "Overpaid",
  closed: "",
};

/** Methods staff can pick when recording money. Card / Other stay valid for older entries. */
export const PICK_METHODS: PaymentMethod[] = ["upi", "cash"];
export const DEFAULT_METHOD: PaymentMethod = "upi";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  other: "Other",
};

/** Filter values for the bookings list. */
export type PayFilter = "" | "due" | "unpaid" | "advance" | "paid";
export const PAY_FILTERS: Record<Exclude<PayFilter, "">, string> = {
  due: "Has dues (not paid + advance)",
  unpaid: "Not paid",
  advance: "Advance paid, balance due",
  paid: "Fully paid",
};

export function matchesPayFilter(s: PaySummary, f: PayFilter): boolean {
  if (!f) return true;
  if (f === "due") return s.due > 0;
  if (f === "paid") return s.state === "paid" || s.state === "overpaid";
  return s.state === f;
}

/** Whether the database has the payments columns yet (migration 0006). */
export function paymentsReady(b: object | null | undefined): boolean {
  return !!b && "paid_amount" in b;
}
