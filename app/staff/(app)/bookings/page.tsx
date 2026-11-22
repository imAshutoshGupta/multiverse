import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/Skeletons";
import { PayBadge, StatusBadge } from "@/components/ui";
import { formatINR } from "@/lib/availability";
import { parseFilters, queryBookings } from "@/lib/bookingQuery";
import { loadCatalog } from "@/lib/catalog";
import { bookingPay, matchesPayFilter, PAY_FILTERS, paymentsReady } from "@/lib/payments";
import { displayPhone } from "@/lib/phone";
import { requestToday } from "@/lib/serverTime";
import { addDays, businessDateOf, fmtDay, fmtTime } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Bookings" };

const input =
  "h-10 rounded-xl border border-line bg-panel-2 px-3 text-sm text-ink outline-none focus:border-portal";

export default function BookingsPage({ searchParams }: PageProps<"/staff/bookings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BookingsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BookingsContent({ searchParams }: Pick<PageProps<"/staff/bookings">, "searchParams">) {
  const params = await searchParams;
  const { supabase, settings, stations, types, games } = await loadCatalog(); // request-time from here
  const today = await requestToday();
  const filters = parseFilters(params, today);
  const loaded = await queryBookings(supabase, settings, filters);
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const payReady = loaded.length === 0 || paymentsReady(loaded[0]);
  const withPay = loaded.map((b) => ({ b, pay: bookingPay(b, stationById.get(b.station_id), types) }));
  const rows = withPay.filter(({ pay }) => matchesPayFilter(pay, filters.pay));
  const gameById = new Map(games.map((g) => [g.id, g]));
  const exportQs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v) as [string, string][],
  ).toString();
  const revenue = rows
    .filter(({ b }) => ["confirmed", "arrived", "completed"].includes(b.status))
    .reduce((sum, { pay }) => sum + pay.total, 0);
  const collected = rows.reduce((sum, { pay }) => sum + pay.paid, 0);
  const due = rows.reduce((sum, { pay }) => sum + pay.due, 0);
  const dueCustomers = rows.filter(({ pay }) => pay.due > 0).length;
  const duesHref = `/staff/bookings?from=${addDays(today, -30)}&to=${today}&pay=due`;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Bookings</h1>
          <p className="text-sm text-muted">
            {rows.length} booking{rows.length === 1 ? "" : "s"} · {formatINR(revenue)} confirmed value
            {payReady && (
              <>
                {" "}· <span className="text-emerald-300">{formatINR(collected)} collected</span> ·{" "}
                <span className={due ? "text-rose-300" : undefined}>
                  {formatINR(due)} due{dueCustomers ? ` from ${dueCustomers} customer${dueCustomers > 1 ? "s" : ""}` : ""}
                </span>
              </>
            )}
          </p>
          {payReady && (
            <Link href={duesHref} className="mt-1 inline-block text-xs font-semibold text-portal hover:underline">
              Who still owes money? (last 30 days) →
            </Link>
          )}
          {!payReady && (
            <p className="mt-1 text-xs text-amber-300">
              Payments need a database update: run supabase/migrations/0006_payments.sql in the Supabase SQL Editor.
            </p>
          )}
        </div>
        <a
          href={`/api/export?${exportQs}`}
          className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-semibold hover:border-portal/60"
        >
          ⬇ Download for Excel
        </a>
      </div>

      <form className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-panel p-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={filters.from} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={filters.to} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Status
          <select name="status" defaultValue={filters.status} className={input}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Payment
          <select name="pay" defaultValue={filters.pay} className={input}>
            <option value="">All</option>
            {Object.entries(PAY_FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
          Search
          <input name="q" defaultValue={filters.q} placeholder="Name or phone" className={input} />
        </label>
        <button className="h-10 cursor-pointer rounded-xl bg-portal px-4 text-sm font-semibold text-on-portal hover:bg-portal-strong">
          Apply
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Station</th>
              <th className="px-4 py-3">Game</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Due</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  No bookings match these filters.
                </td>
              </tr>
            )}
            {rows.map(({ b, pay }) => {
              const st = stationById.get(b.station_id);
              const day = businessDateOf(b.starts_at, settings);
              return (
                <tr key={b.id} className="hover:bg-tint/[0.03]">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link href={`/staff?date=${day}`} className="hover:underline">
                      <div className="font-semibold">{fmtDay(day)}</div>
                      <div className="text-xs text-muted">
                        {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold">
                      {b.customer_name}
                      {b.party_size > 1 && <span className="font-normal text-muted"> ×{b.party_size}</span>}
                    </div>
                    <div className="text-xs text-muted">{displayPhone(b.phone)}</div>
                  </td>
                  <td className="px-4 py-3">{st?.name}</td>
                  <td className="px-4 py-3 text-muted">{b.game_id ? gameById.get(b.game_id)?.name : ""}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {st ? formatINR(pay.total) : ""}
                    {b.price != null && <div className="text-[10px] text-muted">custom</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-300">{pay.paid ? formatINR(pay.paid) : "–"}</td>
                  <td className={`px-4 py-3 text-right font-mono ${pay.due ? "font-semibold text-rose-300" : "text-muted"}`}>
                    {pay.due ? formatINR(pay.due) : "–"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={b.status} />
                      {payReady && <PayBadge pay={pay} compact />}
                    </div>
                    {b.source === "online" && <span className="ml-1 text-xs" title="Online request">🌐</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
