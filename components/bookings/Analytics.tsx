// Analytics cards and simple charts for the Bookings page. Server-rendered, no client JS.
// Charts are single-series bars in the brand colour; values are printed as text (ink tokens),
// with a hover label on the column chart.
import Link from "next/link";
import { formatINR } from "@/lib/availability";
import type { Analytics as Stats } from "@/lib/analytics";
import { METHOD_LABEL } from "@/lib/payments";
import { displayPhone } from "@/lib/phone";
import { fmtClock } from "@/lib/time";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const hrs = (min: number) => {
  const h = min / 60;
  return `${h >= 100 ? Math.round(h).toLocaleString("en-IN") : h.toFixed(h % 1 ? 1 : 0)} hr${h === 1 ? "" : "s"}`;
};

export function Analytics({ a, duesHref, payReady }: { a: Stats; duesHref: string; payReady: boolean }) {
  const hourRange = a.byHour.map((n, h) => [h, n] as const).filter(([, n]) => n > 0);
  const firstH = hourRange.length ? hourRange[0][0] : 11;
  const lastH = hourRange.length ? hourRange[hourRange.length - 1][0] : 22;
  const hours = a.byHour.slice(firstH, lastH + 1).map((n, i) => ({ h: firstH + i, n }));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ label: d, value: a.byWeekday[i] }));
  // Monday-first reads more naturally for a week
  const week = [...weekdays.slice(1), weekdays[0]];

  return (
    <section className="mt-4 space-y-3" aria-label="Analytics">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi label="Revenue" value={formatINR(a.revenue)} sub={`${formatINR(a.avgValue)} per booking`} />
        <Kpi
          label="Collected"
          value={payReady ? formatINR(a.collected) : "–"}
          sub={payReady ? (a.refunds ? `after ${formatINR(a.refunds)} refunded` : `${pct(a.collected, a.revenue)} of revenue`) : "Payments not set up"}
          tone="green"
        />
        <Kpi
          label="Due"
          value={payReady ? formatINR(a.due) : "–"}
          sub={a.dueCustomers ? `from ${a.dueCustomers} customer${a.dueCustomers > 1 ? "s" : ""}` : "Nobody owes money"}
          tone={a.due ? "rose" : undefined}
          href={a.due ? duesHref : undefined}
        />
        <Kpi label="Bookings" value={a.bookings.toLocaleString("en-IN")} sub={`${hrs(a.minutes)} played · ${a.players} players`} />
        <Kpi
          label="Customers"
          value={a.customers.toLocaleString("en-IN")}
          sub={`${a.repeatCustomers} came back · ${a.newCustomers} one-time`}
        />
        <Kpi label="Avg. session" value={hrs(Math.round(a.avgMinutes))} sub={`${a.avgPlayers.toFixed(1)} players per booking`} />
        <Kpi
          label="Cancelled / no-show"
          value={`${a.cancelled} / ${a.noShows}`}
          sub={`${pct(a.cancelled + a.noShows, a.rows)} of all bookings`}
          tone={a.noShows ? "amber" : undefined}
        />
        <Kpi
          label="Booked online"
          value={pct(a.online, a.rows)}
          sub={`${a.online} online · ${a.rows - a.online} by staff${a.discounts ? ` · ${formatINR(a.discounts)} discounts` : ""}`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Revenue by world">
          <BarList items={a.byWorld.map((g) => ({ label: g.label, value: g.revenue, text: formatINR(g.revenue), sub: `${g.bookings} booking${g.bookings === 1 ? "" : "s"}` }))} />
        </Panel>
        <Panel title="Top stations">
          <BarList
            items={a.byStation.slice(0, 8).map((g) => ({ label: g.label, value: g.revenue, text: formatINR(g.revenue), sub: hrs(g.minutes) }))}
          />
        </Panel>
        <Panel title="Most played games">
          <BarList
            items={[...a.byGame]
              .sort((x, y) => y.bookings - x.bookings)
              .slice(0, 8)
              .map((g) => ({ label: g.label, value: g.bookings, text: `${g.bookings}`, sub: hrs(g.minutes) }))}
          />
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Busiest start times" hint="Bookings starting in each hour">
          <Columns items={hours.map(({ h, n }) => ({ label: fmtClock(`${String(h).padStart(2, "0")}:00`), short: shortHour(h), value: n }))} />
        </Panel>
        <Panel title="Busiest days" hint="Bookings by day of the week">
          <Columns items={week.map((d) => ({ label: d.label, short: d.label.slice(0, 2), value: d.value }))} />
        </Panel>
        <Panel title="Money in by method" hint={payReady ? "Payments minus refunds" : undefined}>
          {payReady ? (
            <BarList
              items={a.byMethod.map((m) => ({
                label: METHOD_LABEL[m.method],
                value: Math.max(0, m.amount),
                text: formatINR(m.amount),
                sub: `${m.count} payment${m.count === 1 ? "" : "s"}`,
              }))}
              empty="No payments recorded yet."
            />
          ) : (
            <p className="text-sm text-muted">Run migration 0006 to track payments.</p>
          )}
        </Panel>
      </div>

      <Panel title="Top customers" hint="By booking value in this period">
        {a.customerList.length === 0 ? (
          <p className="text-sm text-muted">No customers in this period.</p>
        ) : (
          <>
            {/* Phones: compact list */}
            <ul className="divide-y divide-line/60 sm:hidden">
              {a.customerList.slice(0, 8).map((c) => (
                <li key={c.key} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="truncate text-xs text-muted">
                      {c.counted} visit{c.counted === 1 ? "" : "s"} · {(c.minutes / 60).toFixed(1)} hrs
                      {c.noShows > 0 && <span className="text-rose-300"> · {c.noShows} no-show</span>}
                      {c.favGame && ` · ${c.favGame}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-sm font-semibold">{formatINR(c.value)}</div>
                    {c.due > 0 && <div className="font-mono text-[11px] font-semibold text-rose-300">{formatINR(c.due)} due</div>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="-mx-1 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-1 py-1.5">Customer</th>
                    <th className="px-1 py-1.5 text-right">Visits</th>
                    <th className="px-1 py-1.5 text-right">Hours</th>
                    <th className="px-1 py-1.5">Favourite</th>
                    <th className="px-1 py-1.5 text-right">Value</th>
                    <th className="px-1 py-1.5 text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {a.customerList.slice(0, 8).map((c) => (
                    <tr key={c.key}>
                      <td className="px-1 py-2">
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-xs text-muted">{c.phone ? displayPhone(c.phone) : "No phone"}</div>
                      </td>
                      <td className="px-1 py-2 text-right font-mono">
                        {c.counted}
                        {c.noShows > 0 && <span className="ml-1 text-xs text-rose-300" title="No-shows">({c.noShows} no-show)</span>}
                      </td>
                      <td className="px-1 py-2 text-right font-mono">{(c.minutes / 60).toFixed(1)}</td>
                      <td className="max-w-48 truncate px-1 py-2 text-muted">{[c.favWorld, c.favGame].filter(Boolean).join(" · ") || "–"}</td>
                      <td className="px-1 py-2 text-right font-mono">{formatINR(c.value)}</td>
                      <td className={`px-1 py-2 text-right font-mono ${c.due ? "font-semibold text-rose-300" : "text-muted"}`}>
                        {c.due ? formatINR(c.due) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="mt-2 text-xs text-muted">Every customer is in the Excel download (Customers sheet).</p>
      </Panel>
    </section>
  );
}

function shortHour(h: number) {
  const h12 = h % 12 || 12;
  return `${h12}${h < 12 || h === 24 ? "a" : "p"}`;
}

function Kpi({
  label,
  value,
  sub,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green" | "rose" | "amber";
  href?: string;
}) {
  const body = (
    <>
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted sm:text-[11px]">{label}</div>
      <div
        className={[
          "mt-0.5 truncate font-display text-xl font-semibold sm:text-2xl",
          tone === "green" ? "text-emerald-300" : "",
          tone === "rose" ? "text-rose-300" : "",
          tone === "amber" ? "text-amber-300" : "",
        ].join(" ")}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted">{sub}</div>}
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-line bg-panel px-3 py-2.5 sm:px-4 sm:py-3";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-rose-400/60`} title="Show who owes money">
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-panel p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2">
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/** Horizontal bars with the label and value as text. */
function BarList({
  items,
  empty = "Nothing in this period.",
}: {
  items: { label: string; value: number; text: string; sub?: string }[];
  empty?: string;
}) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 font-mono font-semibold">{i.text}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint/5">
              <div className="h-full rounded-r bg-portal" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
            </div>
            {i.sub && <span className="w-20 shrink-0 text-right text-[11px] text-muted">{i.sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical columns; the busiest is labelled, the rest show their value on hover. */
function Columns({ items }: { items: { label: string; short: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  if (!max) return <p className="text-sm text-muted">Nothing in this period.</p>;
  return (
    <div className="pt-6">
      <div className="flex h-32 items-end gap-[2px] border-b border-line">
        {items.map((i) => (
          <div
            key={i.label}
            className="group relative flex h-full flex-1 items-end"
            title={`${i.label}: ${i.value} booking${i.value === 1 ? "" : "s"}`}
          >
            <div
              className="w-full rounded-t bg-portal transition group-hover:brightness-125"
              style={{ height: i.value ? `${Math.max(4, (i.value / max) * 100)}%` : 0 }}
            />
            <span
              className={[
                "pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-panel-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink shadow",
                i.value === max ? "" : "hidden group-hover:block",
              ].join(" ")}
              style={{ bottom: `calc(${(i.value / max) * 100}% + 4px)` }}
            >
              {i.value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {items.map((i, idx) => (
          <span key={i.label} className="flex-1 text-center text-[10px] text-muted">
            {items.length <= 8 || idx % 2 === 0 ? i.short : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
