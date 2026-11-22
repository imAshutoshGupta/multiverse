// Builds the Excel report (Summary, Bookings, Payments, Customers, Daily) from booking rows.
import { analyze, customerKey, signed, type Row } from "./analytics";
import { formatINR } from "./availability";
import type { BookingFilters } from "./bookingQuery";
import { METHOD_LABEL, PAY_FILTERS, PAY_LABEL } from "./payments";
import { displayPhone } from "./phone";
import { fmtDay, WEEKDAYS } from "./time";
import type { Station } from "./types";
import { STATUS_LABEL } from "./types";
import { buildXlsx, excelDate, excelDay, type Cell, type Sheet } from "./xlsx";

const money = (v: number | null | undefined): Cell => (v === null || v === undefined ? "" : { v: Math.round(v * 100) / 100, f: "money" });
const int = (v: number): Cell => ({ v, f: "int" });
const hours = (min: number): Cell => ({ v: Math.round((min / 60) * 10) / 10, f: "hours" });
/** Number with one decimal place */
const dec = (v: number): Cell => ({ v: Math.round(v * 10) / 10, f: "hours" });
const pct = (n: number, d: number): Cell => (d ? { v: n / d, f: "pct" } : "");
const day = (d: string): Cell => ({ v: excelDay(d), f: "date" });
const dt = (iso: string | null | undefined): Cell => (iso ? { v: excelDate(iso), f: "datetime" } : "");
const time = (iso: string): Cell => ({ v: excelDate(iso), f: "time" });
const phone = (p: string | null) => (p ? displayPhone(p).replace(/^\+/, "") : "");
const bold = (v: string): Cell => ({ v, f: "bold" });
const muted = (v: string): Cell => ({ v, f: "muted" });

export function buildReport(
  rows: Row[],
  opts: { cafe: string; filters: BookingFilters; stations: Station[]; staffNames: Map<string, string>; generatedAt: string; gameNames: Map<string, string> },
): Uint8Array {
  const a = analyze(rows);
  const { filters: f, staffNames } = opts;
  const who = (id: string | null | undefined) => (id ? (staffNames.get(id) ?? "Staff") : "");

  // Visit number per customer (1st, 2nd… booking in this period)
  const visitNo = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const r of [...rows].sort((x, y) => x.b.starts_at.localeCompare(y.b.starts_at))) {
    const k = customerKey(r.b);
    seen.set(k, (seen.get(k) ?? 0) + 1);
    visitNo.set(r.b.id, seen.get(k)!);
  }
  const custByKey = new Map(a.customerList.map((c) => [c.key, c]));

  // ---- Summary --------------------------------------------------------------
  const applied: string[] = [];
  if (f.status) applied.push(`Status: ${STATUS_LABEL[f.status]}`);
  if (f.pay) applied.push(`Payment: ${PAY_FILTERS[f.pay]}`);
  if (f.source) applied.push(`Booked: ${f.source === "online" ? "Online" : "By staff"}`);
  if (f.world) applied.push(`World: ${f.world}`);
  if (f.station) applied.push(`Station: ${opts.stations.find((s) => s.id === f.station)?.name ?? f.station}`);
  if (f.game) applied.push(`Game: ${f.game === "none" ? "No game picked" : (opts.gameNames.get(f.game) ?? f.game)}`);
  if (f.q) applied.push(`Search: ${f.q}`);

  const S: Cell[][] = [
    [{ v: `${opts.cafe}: bookings report`, f: "title" }],
    [muted(`${fmtDay(f.from)}${f.to !== f.from ? ` to ${fmtDay(f.to)}` : ""} · generated ${opts.generatedAt}`)],
    [muted(applied.length ? `Filters: ${applied.join(" · ")}` : "Filters: none (all bookings in the period)")],
    [],
    [bold("Key numbers"), bold("Value"), bold("Notes")],
    ["Bookings (excl. cancelled / no-show)", int(a.bookings), `${a.rows} in total`],
    ["Revenue (booking value)", money(a.revenue), "Custom prices where set, otherwise the standard rate"],
    ["Collected", money(a.collected), a.refunds ? `After ${formatINR(a.refunds)} refunded` : ""],
    ["Due (still to collect)", money(a.due), `${a.dueCustomers} customer(s)`],
    ["Collected as % of revenue", pct(a.collected, a.revenue)],
    ["Discounts given", money(a.discounts), "Standard rate minus agreed price"],
    ["Average booking value", money(a.avgValue)],
    ["Hours played", hours(a.minutes)],
    ["Average session (hours)", hours(a.avgMinutes)],
    ["Players", int(a.players)],
    ["Average players per booking", dec(a.avgPlayers)],
    ["Customers", int(a.customers)],
    ["Returning customers (2+ bookings)", int(a.repeatCustomers), pct(a.repeatCustomers, a.customers)],
    ["One-time customers", int(a.newCustomers)],
    ["Booked online", int(a.online), pct(a.online, a.rows)],
    ["Booked by staff", int(a.rows - a.online)],
    ["Cancelled", int(a.cancelled), pct(a.cancelled, a.rows)],
    ["No-shows", int(a.noShows), pct(a.noShows, a.rows)],
    [],
    [bold("By status"), bold("Bookings"), bold("Share")],
    ...Object.entries(a.byStatus).map(([k, n]) => [STATUS_LABEL[k as keyof typeof STATUS_LABEL], int(n), pct(n, a.rows)]),
    [],
    [bold("By world"), bold("Bookings"), bold("Revenue"), bold("Hours"), bold("Share of revenue")],
    ...a.byWorld.map((g) => [g.label, int(g.bookings), money(g.revenue), hours(g.minutes), pct(g.revenue, a.revenue)]),
    [],
    [bold("By station"), bold("Bookings"), bold("Revenue"), bold("Hours"), bold("Share of revenue")],
    ...a.byStation.map((g) => [g.label, int(g.bookings), money(g.revenue), hours(g.minutes), pct(g.revenue, a.revenue)]),
    [],
    [bold("By game"), bold("Bookings"), bold("Revenue"), bold("Hours")],
    ...[...a.byGame].sort((x, y) => y.bookings - x.bookings).map((g) => [g.label, int(g.bookings), money(g.revenue), hours(g.minutes)]),
    [],
    [bold("Payments by method"), bold("Net amount"), bold("Payments")],
    ...a.byMethod.map((m) => [METHOD_LABEL[m.method], money(m.amount), int(m.count)]),
    ...(a.refunds ? [["Refunds (included above)", money(-a.refunds), ""] as Cell[]] : []),
    [],
    [bold("By day of week"), bold("Bookings")],
    ...[1, 2, 3, 4, 5, 6, 0].map((d) => [WEEKDAYS[d], int(a.byWeekday[d])]),
    [],
    [bold("By start hour"), bold("Bookings")],
    ...a.byHour.map((n, h) => [h, n] as const).filter(([, n]) => n > 0).map(([h, n]) => [hourLabel(h), int(n)]),
  ];

  // ---- Bookings -------------------------------------------------------------
  const B: Cell[][] = [
    [
      "Date", "Weekday", "Start", "End", "Minutes", "Hours", "Station", "World", "Customer", "Phone", "Players",
      "Game", "Status", "Booked via", "Standard price", "Custom price", "Total", "Paid", "Due", "Payment status",
      "Advance (paid before start)", "Payments", "Paid by", "Refunded", "Last payment", "Customer visit #",
      "Customer bookings in period", "Notes", "Booked at", "Booked by", "Booked ahead (hours)", "Last updated", "Booking ID",
    ],
    ...rows.map((r) => {
      const { b, pay } = r;
      const start = new Date(b.starts_at).getTime();
      const advance = r.payments.filter((p) => new Date(p.created_at).getTime() < start).reduce((s, p) => s + signed(p), 0);
      const refunded = r.payments.filter((p) => p.kind === "refund").reduce((s, p) => s + Number(p.amount), 0);
      const methods = [...new Set(r.payments.filter((p) => p.kind === "payment").map((p) => METHOD_LABEL[p.method]))].join(", ");
      const lastPay = r.payments.at(-1)?.created_at;
      const ahead = (start - new Date(b.created_at).getTime()) / 3_600_000;
      return [
        day(r.day),
        WEEKDAYS[new Date(`${r.day}T00:00:00Z`).getUTCDay()],
        time(b.starts_at),
        time(b.ends_at),
        int(r.minutes),
        hours(r.minutes),
        r.station?.name ?? "",
        r.station?.type ?? "",
        b.customer_name,
        phone(b.phone),
        int(b.party_size),
        r.game?.name ?? "",
        STATUS_LABEL[b.status],
        b.source === "online" ? "Online" : "Staff",
        money(r.standard),
        b.price != null ? money(Number(b.price)) : "",
        money(pay.total),
        money(pay.paid),
        money(pay.due),
        pay.state === "closed" ? (pay.paid > 0 ? "Kept (cancelled / no-show)" : "") : PAY_LABEL[pay.state],
        advance > 0 ? money(advance) : "",
        int(r.payments.length),
        methods,
        refunded ? money(refunded) : "",
        dt(lastPay),
        int(visitNo.get(b.id) ?? 1),
        int(custByKey.get(customerKey(b))?.bookings ?? 1),
        b.notes ?? "",
        dt(b.created_at),
        b.source === "online" ? "Customer (online)" : who((b as { created_by?: string | null }).created_by),
        dec(ahead),
        dt(b.updated_at),
        b.id,
      ];
    }),
  ];

  // ---- Payments -------------------------------------------------------------
  const payRows = rows
    .flatMap((r) => r.payments.map((p) => ({ r, p })))
    .sort((x, y) => x.p.created_at.localeCompare(y.p.created_at));
  const P: Cell[][] = [
    ["Recorded at", "Type", "Amount", "Signed amount", "Method", "Note", "Recorded by", "Booking date", "Booking start", "Customer", "Phone", "Station", "World", "Booking status", "Booking total", "Booking due now", "Before the booking started?", "Booking ID", "Payment ID"],
    ...payRows.map(({ r, p }) => [
      dt(p.created_at),
      p.kind === "refund" ? "Refund" : "Payment",
      money(Number(p.amount)),
      money(signed(p)),
      METHOD_LABEL[p.method],
      p.note ?? "",
      who(p.created_by),
      day(r.day),
      time(r.b.starts_at),
      r.b.customer_name,
      phone(r.b.phone),
      r.station?.name ?? "",
      r.station?.type ?? "",
      STATUS_LABEL[r.b.status],
      money(r.pay.total),
      money(r.pay.due),
      new Date(p.created_at) < new Date(r.b.starts_at) ? "Yes (advance)" : "No",
      r.b.id,
      p.id,
    ]),
  ];

  // ---- Customers ------------------------------------------------------------
  const C: Cell[][] = [
    ["Customer", "Phone", "Bookings", "Played (excl. cancelled / no-show)", "Completed", "No-shows", "Cancelled", "Booked online", "Hours played", "Players (total)", "Avg. players", "Booking value", "Paid", "Due", "Favourite world", "Favourite game", "First booking", "Last booking", "Returning?"],
    ...a.customerList.map((c) => [
      c.name,
      phone(c.phone),
      int(c.bookings),
      int(c.counted),
      int(c.completed),
      int(c.noShows),
      int(c.cancelled),
      int(c.online),
      hours(c.minutes),
      int(c.players),
      c.counted ? dec(c.players / c.counted) : "",
      money(c.value),
      money(c.paid),
      money(c.due),
      c.favWorld,
      c.favGame,
      day(c.first),
      day(c.last),
      c.counted > 1 ? "Yes" : "No",
    ]),
  ];

  // ---- Daily ----------------------------------------------------------------
  const D: Cell[][] = [
    ["Date", "Weekday", "Bookings", "Revenue", "Collected", "Hours played"],
    ...a.byDay.map((d) => [day(d.key), WEEKDAYS[new Date(`${d.key}T00:00:00Z`).getUTCDay()], int(d.bookings), money(d.revenue), money(d.collected), hours(d.minutes)]),
  ];

  const sheets: Sheet[] = [
    { name: "Summary", rows: S, widths: [38, 14, 14, 10, 16] },
    { name: "Bookings", rows: B, header: true, widths: [12, 10, 9, 9, 8, 7, 20, 14, 20, 15, 8, 22, 11, 10, 12, 12, 11, 11, 11, 16, 14, 9, 14, 10, 19, 9, 10, 30, 19, 18, 12, 19, 38] },
    { name: "Payments", rows: P, header: true, widths: [19, 9, 11, 11, 9, 24, 16, 12, 9, 20, 15, 20, 14, 11, 12, 12, 14, 38, 38] },
    { name: "Customers", rows: C, header: true, widths: [22, 15, 9, 12, 10, 9, 9, 9, 9, 9, 9, 13, 11, 11, 16, 22, 12, 12, 10] },
    { name: "Daily", rows: D, header: true, widths: [12, 11, 10, 12, 12, 12] },
  ];
  return buildXlsx(sheets);
}

function hourLabel(h: number) {
  const ampm = (x: number) => `${x % 12 || 12} ${x % 24 < 12 ? "am" : "pm"}`;
  return `${ampm(h)}–${ampm(h + 1)}`;
}


