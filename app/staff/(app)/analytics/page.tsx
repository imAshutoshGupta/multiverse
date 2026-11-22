import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { Analytics } from "@/components/bookings/Analytics";
import { MoreFilters } from "@/components/bookings/MoreFilters";
import { PageSkeleton } from "@/components/Skeletons";
import { PayBadge, Select, StatusBadge } from "@/components/ui";
import { DateField } from "@/components/ui/DatePicker";
import { analyze, buildRows } from "@/lib/analytics";
import { formatINR } from "@/lib/availability";
import { filtersQuery, parseFilters, queryBookings, type BookingFilters } from "@/lib/bookingQuery";
import { loadCatalog } from "@/lib/catalog";
import { matchesPayFilter, PAY_FILTERS, paymentsReady } from "@/lib/payments";
import { displayPhone } from "@/lib/phone";
import { requestToday } from "@/lib/serverTime";
import { addDays, fmtDay, fmtTime } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/types";

export const metadata: Metadata = { title: "Analytics" };

const input =
  "h-10 rounded-xl border border-line bg-panel-2 px-3 text-sm text-ink outline-none focus:border-portal";
/** Rows drawn in the table; the Excel download always has everything. */
const TABLE_LIMIT = 300;

export default function BookingsPage({ searchParams }: PageProps<"/staff/analytics">) {
  return (
    <Suspense fallback={<PageSkeleton label="Crunching stats" />}>
      <BookingsContent searchParams={searchParams} />
    </Suspense>
  );
}

/** Quick date ranges. Month ranges are calendar months in IST. */
function ranges(today: string): [string, string, string][] {
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = `${lastMonthEnd.slice(0, 8)}01`;
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  return [
    ["Today", today, today],
    ["Yesterday", addDays(today, -1), addDays(today, -1)],
    ["Next 7 days", today, addDays(today, 6)],
    ["This week", weekStart, addDays(weekStart, 6)],
    ["Last 7 days", addDays(today, -6), today],
    ["This month", monthStart, addDays(`${addDays(monthStart, 32).slice(0, 8)}01`, -1)],
    ["Last month", lastMonthStart, lastMonthEnd],
    ["Last 30 days", addDays(today, -29), today],
    ["Last 90 days", addDays(today, -89), today],
  ];
}

async function BookingsContent({ searchParams }: Pick<PageProps<"/staff/analytics">, "searchParams">) {
  const params = await searchParams;
  const { supabase, settings, stations, types, games } = await loadCatalog(); // request-time from here
  const today = await requestToday();
  const filters = parseFilters(params, today);
  const loaded = await queryBookings(supabase, settings, filters, stations);
  const payReady = loaded.length === 0 || paymentsReady(loaded[0]);
  const rows = buildRows(loaded, { stations, games, types, settings }).filter((r) => matchesPayFilter(r.pay, filters.pay));
  const a = analyze(rows);
  const exportQs = filtersQuery(filters);
  const duesHref = `/staff/analytics?${filtersQuery(filters, { pay: "due" })}`;
  const worlds = [...new Set(stations.map((s) => s.type))];
  const stationOptions = stations.filter((s) => !filters.world || s.type === filters.world);
  const moreKeys: (keyof BookingFilters)[] = ["status", "pay", "world", "station", "source", "game"];
  const moreActive = moreKeys.filter((k) => filters[k]).length;
  const activeFilters = moreActive + (filters.q ? 1 : 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:py-6">
      <div className="flex items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-semibold sm:text-2xl">Analytics</h1>
          <p className="text-sm text-muted">
            {fmtDay(filters.from)}
            {filters.to !== filters.from && ` – ${fmtDay(filters.to)}`} · {rows.length} booking{rows.length === 1 ? "" : "s"}
            {activeFilters > 0 && ` · ${activeFilters} filter${activeFilters > 1 ? "s" : ""} on`}
          </p>
          {!payReady && (
            <p className="mt-1 text-xs text-amber-300">
              Payments need a database update: run supabase/migrations/0006_payments.sql in the Supabase SQL Editor.
            </p>
          )}
        </div>
        <a
          href={`/api/export?${exportQs}`}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-portal px-3 text-sm font-semibold text-on-portal hover:bg-portal-strong sm:px-4"
          title="Excel file with Summary, Bookings, Payments, Customers and Daily sheets"
        >
          <Download className="size-4" aria-hidden />
          <span className="sm:hidden">Excel</span>
          <span className="hidden sm:inline">Download Excel report</span>
        </a>
      </div>

      {/* Quick ranges */}
      <nav className="no-scrollbar -mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 max-sm:[mask-image:linear-gradient(to_right,#000_80%,transparent)] sm:mx-0 sm:px-0" aria-label="Date range">
        {ranges(today).map(([label, from, to]) => {
          const on = filters.from === from && filters.to === to;
          return (
            <Link
              key={label}
              href={`/staff/analytics?${filtersQuery(filters, { from, to })}`}
              className={[
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                on ? "border-portal bg-portal text-on-portal" : "border-line text-muted hover:border-portal/60 hover:text-ink",
              ].join(" ")}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <form key={exportQs} className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-panel p-3 sm:grid-cols-3 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <DateField name="from" defaultValue={filters.from} aria-label="From" placeholder="Any day" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <DateField name="to" defaultValue={filters.to} aria-label="To" placeholder="Any day" />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted sm:col-span-1">
          Search
          <input name="q" defaultValue={filters.q} placeholder="Name or phone" className={input} />
        </label>
        <MoreFilters active={moreActive}>
          <FilterSelect label="Status" name="status" value={filters.status} options={Object.entries(STATUS_LABEL)} />
          <FilterSelect label="Payment" name="pay" value={filters.pay} options={Object.entries(PAY_FILTERS)} />
          <FilterSelect
            label="Booked"
            name="source"
            value={filters.source}
            options={[
              ["online", "Online by customer"],
              ["staff", "By staff"],
            ]}
          />
          <FilterSelect label="World" name="world" value={filters.world} options={worlds.map((w) => [w, w])} />
          <FilterSelect
            label="Station"
            name="station"
            value={filters.station}
            options={stationOptions.map((s) => [s.id, s.name + (s.active ? "" : " (inactive)")])}
          />
          <FilterSelect
            label="Game"
            name="game"
            value={filters.game}
            options={[["none", "No game picked"], ...games.map((g) => [g.id, g.name] as [string, string])]}
          />
        </MoreFilters>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-1">
          <button className="h-10 flex-1 cursor-pointer rounded-xl bg-portal px-4 text-sm font-semibold text-on-portal hover:bg-portal-strong">
            Apply
          </button>
          {activeFilters > 0 && (
            <Link
              href={`/staff/analytics?from=${filters.from}&to=${filters.to}`}
              className="inline-flex h-10 items-center rounded-xl border border-line px-3 text-sm font-semibold text-muted hover:text-ink"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <Analytics a={a} duesHref={duesHref} payReady={payReady} />

      <h2 className="mt-6 font-display text-lg font-semibold">All bookings</h2>

      {/* Phones: one card per booking; tap opens that day on the dashboard */}
      <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-panel sm:hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">No bookings match these filters.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {rows.slice(0, TABLE_LIMIT).map(({ b, pay, station: st, game, day }) => (
              <li key={b.id}>
                <Link href={`/staff?date=${day}`} className="flex gap-3 px-4 py-3 active:bg-tint/5">
                  <div className="w-14 shrink-0 pt-0.5">
                    <div className="text-xs font-semibold">{fmtDay(day).replace(/^\w+, /, "")}</div>
                    <div className="text-[11px] text-muted">{fmtTime(b.starts_at)}</div>
                    <div className="text-[11px] text-muted">{fmtTime(b.ends_at)}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {b.customer_name}
                      {b.party_size > 1 && <span className="font-normal text-muted"> ×{b.party_size}</span>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {st?.name ?? "?"}
                      {game && ` · ${game.name}`}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <StatusBadge status={b.status} />
                      {payReady && <PayBadge pay={pay} compact />}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold">{st ? formatINR(pay.total) : ""}</div>
                    {pay.due > 0 ? (
                      <div className="font-mono text-[11px] font-semibold text-rose-300">{formatINR(pay.due)} due</div>
                    ) : pay.paid > 0 ? (
                      <div className="font-mono text-[11px] text-emerald-300">{formatINR(pay.paid)} paid</div>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > TABLE_LIMIT && (
          <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">
            Showing the first {TABLE_LIMIT} of {rows.length}. The Excel report has all of them.
          </p>
        )}
      </div>

      <div className="mt-2 hidden overflow-x-auto rounded-2xl border border-line bg-panel sm:block">
        <table className="w-full min-w-[960px] text-sm">
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
            {rows.slice(0, TABLE_LIMIT).map(({ b, pay, station: st, game, day }) => (
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
                <td className="px-4 py-3">
                  {st?.name}
                  <div className="text-xs text-muted">{st?.type}</div>
                </td>
                <td className="px-4 py-3 text-muted">{game?.name ?? ""}</td>
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > TABLE_LIMIT && (
          <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">
            Showing the first {TABLE_LIMIT} of {rows.length}. The Excel report has all of them.
          </p>
        )}
      </div>
    </main>
  );
}

function FilterSelect({ label, name, value, options }: { label: string; name: string; value: string; options: [string, string][] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <Select name={name} defaultValue={value} aria-label={label}>
        <option value="">All</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </Select>
    </label>
  );
}
