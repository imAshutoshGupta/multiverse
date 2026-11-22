// Booking analytics shared by the Bookings page and the Excel export. Pure functions.
import { bookingPrice } from "./availability";
import { bookingPay, type PaySummary } from "./payments";
import { businessDateOf, minutesBetween, type WindowSettings } from "./time";
import type { Booking, BookingPayment, BookingStatus, Game, PaymentMethod, Station, StationType } from "./types";

export interface Row {
  b: Booking;
  pay: PaySummary;
  station?: Station;
  game?: Game;
  payments: BookingPayment[];
  /** Business day (after-midnight slots count toward the previous day). */
  day: string;
  minutes: number;
  /** Standard-rate price, before any custom price. */
  standard: number;
}

export function buildRows(
  bookings: (Booking & { booking_payments?: BookingPayment[] })[],
  ctx: { stations: Station[]; games: Game[]; types: StationType[]; settings: WindowSettings },
): Row[] {
  const stationById = new Map(ctx.stations.map((s) => [s.id, s]));
  const gameById = new Map(ctx.games.map((g) => [g.id, g]));
  return bookings.map((b) => {
    const station = stationById.get(b.station_id);
    const minutes = minutesBetween(b.starts_at, b.ends_at);
    return {
      b,
      pay: bookingPay(b, station, ctx.types),
      station,
      game: b.game_id ? gameById.get(b.game_id) : undefined,
      payments: [...(b.booking_payments ?? [])].sort((x, y) => x.created_at.localeCompare(y.created_at)),
      day: businessDateOf(b.starts_at, ctx.settings),
      minutes,
      standard: bookingPrice(station, ctx.types, minutes, b.party_size),
    };
  });
}

/** Bookings that actually happen (or will): not cancelled and not a no-show. */
export const isCounted = (s: BookingStatus) => s !== "cancelled" && s !== "no_show";

/** One customer across bookings: phone if we have it, else the name. */
export function customerKey(b: Pick<Booking, "phone" | "customer_name">): string {
  return b.phone ? `p:${b.phone}` : `n:${b.customer_name.trim().toLowerCase()}`;
}

/** IST hour (0–23) a booking starts in. */
export function istHour(iso: string): number {
  return new Date(new Date(iso).getTime() + 330 * 60_000).getUTCHours();
}

/** Signed amount of a ledger entry (refunds are negative). */
export const signed = (p: Pick<BookingPayment, "amount" | "kind">) => (p.kind === "refund" ? -1 : 1) * Number(p.amount);

export interface Group {
  key: string;
  label: string;
  bookings: number;
  revenue: number;
  minutes: number;
}

export interface CustomerStat {
  key: string;
  name: string;
  phone: string | null;
  bookings: number;
  counted: number;
  completed: number;
  noShows: number;
  cancelled: number;
  online: number;
  minutes: number;
  players: number;
  value: number;
  paid: number;
  due: number;
  first: string;
  last: string;
  favWorld: string;
  favGame: string;
}

export interface Analytics {
  rows: number;
  bookings: number;
  revenue: number;
  collected: number;
  due: number;
  dueCustomers: number;
  minutes: number;
  players: number;
  avgValue: number;
  avgMinutes: number;
  avgPlayers: number;
  discounts: number;
  cancelled: number;
  noShows: number;
  online: number;
  customers: number;
  repeatCustomers: number;
  newCustomers: number;
  byStatus: Record<BookingStatus, number>;
  byWorld: Group[];
  byStation: Group[];
  byGame: Group[];
  byDay: (Group & { collected: number })[];
  /** Index = IST hour 0–23 */
  byHour: number[];
  /** Index = weekday, 0 = Sunday */
  byWeekday: number[];
  byMethod: { method: PaymentMethod; amount: number; count: number }[];
  refunds: number;
  customerList: CustomerStat[];
}

function group(rows: Row[], keyOf: (r: Row) => [string, string] | null): Group[] {
  const m = new Map<string, Group>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const g = m.get(k[0]) ?? { key: k[0], label: k[1], bookings: 0, revenue: 0, minutes: 0 };
    g.bookings++;
    g.revenue += r.pay.total;
    g.minutes += r.minutes;
    m.set(k[0], g);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);
}

function mostCommon(values: string[]): string {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best = "";
  let n = 0;
  for (const [v, k] of c) if (k > n) [best, n] = [v, k];
  return best;
}

export function analyze(rows: Row[]): Analytics {
  const counted = rows.filter((r) => isCounted(r.b.status));
  const sum = (xs: Row[], f: (r: Row) => number) => xs.reduce((s, r) => s + f(r), 0);
  const revenue = sum(counted, (r) => r.pay.total);
  const minutes = sum(counted, (r) => r.minutes);
  const players = sum(counted, (r) => r.b.party_size);

  const byStatus = { pending: 0, confirmed: 0, arrived: 0, completed: 0, cancelled: 0, no_show: 0 } as Record<BookingStatus, number>;
  for (const r of rows) byStatus[r.b.status]++;

  const byHour = Array<number>(24).fill(0);
  const byWeekday = Array<number>(7).fill(0);
  for (const r of counted) {
    byHour[istHour(r.b.starts_at)]++;
    byWeekday[new Date(`${r.day}T00:00:00Z`).getUTCDay()]++;
  }

  const days = new Map<string, Group & { collected: number }>();
  for (const r of rows) {
    const d = days.get(r.day) ?? { key: r.day, label: r.day, bookings: 0, revenue: 0, minutes: 0, collected: 0 };
    d.collected += r.pay.paid;
    if (isCounted(r.b.status)) {
      d.bookings++;
      d.revenue += r.pay.total;
      d.minutes += r.minutes;
    }
    days.set(r.day, d);
  }

  const methods = new Map<PaymentMethod, { method: PaymentMethod; amount: number; count: number }>();
  let refunds = 0;
  for (const r of rows)
    for (const p of r.payments) {
      if (p.kind === "refund") refunds += Number(p.amount);
      const m = methods.get(p.method) ?? { method: p.method, amount: 0, count: 0 };
      m.amount += signed(p);
      if (p.kind === "payment") m.count++;
      methods.set(p.method, m);
    }

  // Customers, in booking order so "first" / "last" read naturally
  const cust = new Map<string, CustomerStat & { worlds: string[]; games: string[] }>();
  for (const r of [...rows].sort((a, b) => a.b.starts_at.localeCompare(b.b.starts_at))) {
    const k = customerKey(r.b);
    const c =
      cust.get(k) ??
      ({
        key: k,
        name: r.b.customer_name,
        phone: r.b.phone,
        bookings: 0,
        counted: 0,
        completed: 0,
        noShows: 0,
        cancelled: 0,
        online: 0,
        minutes: 0,
        players: 0,
        value: 0,
        paid: 0,
        due: 0,
        first: r.day,
        last: r.day,
        favWorld: "",
        favGame: "",
        worlds: [],
        games: [],
      } as CustomerStat & { worlds: string[]; games: string[] });
    c.name = r.b.customer_name; // latest spelling
    c.bookings++;
    c.last = r.day;
    c.paid += r.pay.paid;
    c.due += r.pay.due;
    if (r.b.source === "online") c.online++;
    if (r.b.status === "completed") c.completed++;
    if (r.b.status === "no_show") c.noShows++;
    if (r.b.status === "cancelled") c.cancelled++;
    if (isCounted(r.b.status)) {
      c.counted++;
      c.minutes += r.minutes;
      c.players += r.b.party_size;
      c.value += r.pay.total;
      if (r.station) c.worlds.push(r.station.type);
      if (r.game) c.games.push(r.game.name);
    }
    cust.set(k, c);
  }
  const customerList: CustomerStat[] = [...cust.values()]
    .map(({ worlds, games, ...c }) => ({ ...c, favWorld: mostCommon(worlds), favGame: mostCommon(games) }))
    .sort((a, b) => b.value - a.value || b.bookings - a.bookings);
  const active = customerList.filter((c) => c.counted > 0);

  return {
    rows: rows.length,
    bookings: counted.length,
    revenue,
    collected: sum(rows, (r) => r.pay.paid),
    due: sum(rows, (r) => r.pay.due),
    dueCustomers: new Set(rows.filter((r) => r.pay.due > 0).map((r) => customerKey(r.b))).size,
    minutes,
    players,
    avgValue: counted.length ? revenue / counted.length : 0,
    avgMinutes: counted.length ? minutes / counted.length : 0,
    avgPlayers: counted.length ? players / counted.length : 0,
    discounts: sum(counted, (r) => Math.max(0, r.standard - r.pay.total)),
    cancelled: byStatus.cancelled,
    noShows: byStatus.no_show,
    online: rows.filter((r) => r.b.source === "online").length,
    customers: active.length,
    repeatCustomers: active.filter((c) => c.counted > 1).length,
    newCustomers: active.filter((c) => c.counted === 1).length,
    byStatus,
    byWorld: group(counted, (r) => (r.station ? [r.station.type, r.station.type] : null)),
    byStation: group(counted, (r) => (r.station ? [r.station.id, r.station.name] : null)),
    byGame: group(counted, (r) => (r.game ? [r.game.id, r.game.name] : ["", "No game picked"])),
    byDay: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byHour,
    byWeekday,
    byMethod: [...methods.values()].sort((a, b) => b.amount - a.amount),
    refunds,
    customerList,
  };
}
