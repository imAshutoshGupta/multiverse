"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, cn, ErrorNote, Input, PayBadge, payText, STATUS_STYLE, StatusBadge } from "@/components/ui";
import { useLiveBookings } from "@/components/staff/useBookings";
import type { InitialBookings } from "@/lib/bookingsWindow";
import { formatINR, stationPricing, stationRate } from "@/lib/availability";
import { bookingPay, paymentsReady, type PaySummary } from "@/lib/payments";
import { displayPhone } from "@/lib/phone";
import { addDays, businessWindow, daySlots, fmtDay, fmtTime, istDate } from "@/lib/time";
import type { Booking, Closure, Game, Settings, Station, StationType } from "@/lib/types";
import { useClock } from "@/lib/useClock";
import { BookingDialog, type DialogTarget } from "./BookingDialog";
import { BookingHoverCard, type HoverTarget } from "./BookingHoverCard";

const COL = 56; // px per slot
const NAME_W = 144; // px for the station column

export function Board({
  initialDate,
  settings,
  stations,
  types,
  games,
  closures,
  isOwner,
  initialBookings,
}: {
  initialDate: string;
  settings: Settings;
  stations: Station[];
  types: StationType[];
  games: Game[];
  closures: Closure[];
  isOwner: boolean;
  initialBookings?: InitialBookings | null;
}) {
  const [date, setDateState] = useState(initialDate);
  const [target, setTarget] = useState<DialogTarget | null>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showHover = (booking: Booking, el: HTMLElement, delay = 120) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover({ booking, rect: el.getBoundingClientRect() }), delay);
  };
  const hideHover = () => {
    clearTimeout(hoverTimer.current);
    setHover(null);
  };
  // The card is pinned to the block's position, so drop it as soon as anything scrolls.
  useEffect(() => {
    if (!hover) return;
    const off = () => setHover(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [hover]);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const clock = useClock();
  const now = useMemo(() => new Date(clock ?? 0), [clock]);

  const setDate = (d: string) => {
    setDateState(d);
    window.history.replaceState(null, "", d === istDate() ? "/staff" : `/staff?date=${d}`);
  };

  const { opensAt, closesAt, closed, reason } = useMemo(() => businessWindow(date, settings, closures), [date, settings, closures]);
  const slots = useMemo(() => daySlots(date, settings, closures), [date, settings, closures]);
  const { bookings, error } = useLiveBookings(opensAt.toISOString(), closesAt.toISOString(), {
    initial: initialBookings,
  });

  const visible = useMemo(() => (bookings ?? []).filter((b) => b.status !== "cancelled"), [bookings]);
  const activeStations = useMemo(() => {
    const worldOrder = (t: string) => types.find((w) => w.name === t)?.sort_order ?? 0;
    return stations
      .filter((s) => s.active || visible.some((b) => b.station_id === s.id))
      .sort((a, b) => worldOrder(a.type) - worldOrder(b.type) || a.sort_order - b.sort_order);
  }, [stations, visible, types]);
  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  // null = can't tell yet (no bookings loaded); false = database still needs migration 0006
  const payReady: boolean | null = !bookings?.length ? null : paymentsReady(bookings[0]);
  const payById = useMemo(() => {
    const m = new Map<string, PaySummary>();
    for (const b of bookings ?? []) m.set(b.id, bookingPay(b, stationById.get(b.station_id), types));
    return m;
  }, [bookings, stationById, types]);

  const stats = useMemo(() => {
    const counted = visible.filter((b) => b.status !== "no_show");
    const revenue = counted.reduce((sum, b) => sum + (payById.get(b.id)?.total ?? 0), 0);
    // Money actually in hand for this day's bookings (cancelled ones too, until refunded)
    const collected = (bookings ?? []).reduce((sum, b) => sum + (payById.get(b.id)?.paid ?? 0), 0);
    const dues = visible.map((b) => payById.get(b.id)).filter((p): p is PaySummary => !!p && p.due > 0);
    const t = now.getTime();
    return {
      collected,
      due: dues.reduce((sum, p) => sum + p.due, 0),
      dueCount: dues.length,
      total: counted.length,
      pending: visible.filter((b) => b.status === "pending").length,
      live: visible.filter(
        (b) => ["confirmed", "arrived"].includes(b.status) && new Date(b.starts_at).getTime() <= t && new Date(b.ends_at).getTime() > t,
      ).length,
      revenue,
    };
  }, [visible, bookings, payById, now]);
  const loading = bookings === null;
  // Latest copy of the hovered booking (live updates, e.g. a payment, show straight away)
  const hovered = hover ? visible.find((b) => b.id === hover.booking.id) : undefined;

  const slotMs = settings.slot_minutes * 60_000;
  const isToday = date === istDate(now);
  const nowOffset =
    now >= opensAt && now < closesAt ? ((now.getTime() - opensAt.getTime()) / slotMs) * COL : null;
  const gridWidth = slots.length * COL;

  // Scroll the grid to "now" (or opening) when the day changes
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const t = Date.now();
    const offset =
      t >= opensAt.getTime() && t < closesAt.getTime() ? ((t - opensAt.getTime()) / slotMs) * COL : 0;
    el.scrollLeft = Math.max(0, offset - COL * 2);
  }, [opensAt, closesAt, slotMs]);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-5">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            ←
          </Button>
          <Button variant={isToday ? "primary" : "outline"} size="sm" onClick={() => setDate(istDate())}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))} aria-label="Next day">
            →
          </Button>
        </div>
        <h1 className="font-display text-xl font-semibold">{fmtDay(date)}</h1>
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="h-8 w-auto text-xs"
        />
        <Button className="ml-auto" onClick={() => setTarget({ mode: "new" })}>
          + New booking
        </Button>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Bookings" value={loading ? "…" : stats.total} />
        <Stat label="Waiting to confirm" value={loading ? "…" : stats.pending} tone={stats.pending ? "amber" : undefined} />
        <Stat label="Playing now" value={loading ? "…" : isToday ? stats.live : "–"} tone={stats.live && isToday ? "green" : undefined} />
        <Stat label="Expected revenue" value={loading ? "…" : formatINR(stats.revenue)} />
        <Stat label="Collected" value={loading ? "…" : payReady === false ? "–" : formatINR(stats.collected)} tone={stats.collected ? "green" : undefined} />
        <Stat
          label={stats.dueCount ? `Due · ${stats.dueCount} customer${stats.dueCount > 1 ? "s" : ""}` : "Due"}
          value={loading ? "…" : payReady === false ? "–" : formatINR(stats.due)}
          tone={stats.due ? "rose" : undefined}
        />
      </div>
      {payReady === false && (
        <p className="mb-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Payments aren&apos;t switched on yet. Run <code className="font-mono">supabase/migrations/0006_payments.sql</code> in the
          Supabase SQL Editor, then reload.
        </p>
      )}

      <ErrorNote>{error && `Couldn't load bookings: ${error}`}</ErrorNote>
      {closed && (
        <p className="mb-4 rounded-2xl border border-rift/40 bg-rift/10 px-4 py-3 text-sm">
          Closed for online bookings on {fmtDay(date)}
          {reason ? ` (${reason})` : ""}. You can still add bookings here.
        </p>
      )}

      {/* Grid */}
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <div ref={scrollRef} className={cn("overflow-x-auto transition-opacity", loading && "pointer-events-none opacity-50")} aria-busy={loading}>
          <div style={{ width: NAME_W + gridWidth }} className="relative">
            {/* time header */}
            <div className="sticky top-0 z-20 flex border-b border-line bg-panel">
              <div style={{ width: NAME_W }} className="sticky left-0 z-10 shrink-0 bg-panel px-3 py-2 text-xs text-muted">
                Station
              </div>
              {slots.map((s, i) => {
                const onHour = new Date(s).getUTCMinutes() === 30; // IST :00 == UTC :30
                return (
                  <div key={i} style={{ width: COL }} className="shrink-0 border-l border-line/50 px-1 py-2 text-[11px] text-muted">
                    {onHour || settings.slot_minutes >= 60 ? fmtTime(s) : ""}
                  </div>
                );
              })}
            </div>

            {activeStations.length === 0 && (
              <p className="p-6 text-sm text-muted">No stations yet. Add them in Settings.</p>
            )}

            {activeStations.map((st) => {
              const rowBookings = visible.filter((b) => b.station_id === st.id);
              return (
                <div key={st.id} className="flex border-b border-line/60 last:border-b-0">
                  <div
                    style={{ width: NAME_W }}
                    className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-panel px-3 py-2"
                  >
                    <span className="truncate text-sm font-semibold">{st.name}</span>
                    <span className="text-[11px] text-muted">
                      {st.type} · {formatINR(stationRate(st, types))}/hr{stationPricing(st, types) === "per_player" ? " pp" : ""}
                    </span>
                  </div>
                  <div className="relative h-16 shrink-0" style={{ width: gridWidth }}>
                    {/* empty cells */}
                    <div className="absolute inset-0 flex">
                      {slots.map((s, i) => {
                        const past = s.getTime() + slotMs <= now.getTime();
                        return (
                          <button
                            key={i}
                            style={{ width: COL }}
                            disabled={past}
                            onClick={() => setTarget({ mode: "new", stationId: st.id, start: s.toISOString() })}
                            className="slot-cell group h-full shrink-0 cursor-pointer border-l border-line/40 transition hover:bg-portal/10 disabled:cursor-default disabled:bg-black/20"
                            aria-label={`Book ${st.name} at ${fmtTime(s)}`}
                          >
                            <span className="hidden text-lg text-portal/70 group-hover:inline group-disabled:hidden">+</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* bookings */}
                    {rowBookings.map((b) => {
                      const left = ((new Date(b.starts_at).getTime() - opensAt.getTime()) / slotMs) * COL;
                      const width = ((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / slotMs) * COL;
                      const game = b.game_id ? gameById.get(b.game_id)?.name : null;
                      const pay = payReady ? payById.get(b.id) : undefined;
                      const payLine = pay ? payText(pay, true) : "";
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            hideHover();
                            setTarget({ mode: "edit", booking: b });
                          }}
                          onMouseEnter={(e) => showHover(b, e.currentTarget)}
                          onMouseLeave={hideHover}
                          onFocus={(e) => e.currentTarget.matches(":focus-visible") && showHover(b, e.currentTarget, 0)}
                          onBlur={hideHover}
                          aria-label={`${b.customer_name}, ${fmtTime(b.starts_at)} to ${fmtTime(b.ends_at)}${payLine ? `, ${payLine}` : ""}`}
                          style={{ left: Math.max(0, left) + 2, width: Math.max(width - 4, 20) }}
                          className={cn(
                            "absolute inset-y-1.5 z-[5] flex cursor-pointer flex-col justify-center overflow-hidden rounded-lg border px-2 text-left transition hover:brightness-125",
                            STATUS_STYLE[b.status],
                            b.status === "pending" && "border-dashed",
                          )}
                        >
                          <span className="truncate text-xs font-bold">
                            {b.source === "online" && "🌐 "}
                            {b.customer_name}
                            {b.party_size > 1 && <span className="font-normal opacity-70"> ×{b.party_size}</span>}
                          </span>
                          <span className="truncate text-[11px] opacity-75">
                            {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                            {game && ` · ${game}`}
                          </span>
                          {pay && pay.state !== "closed" && (
                            <span
                              aria-hidden
                              className={cn("absolute inset-x-0 bottom-0 h-1", PAY_BAR[pay.state])}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* now line */}
            {nowOffset !== null && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-[6] w-px bg-rose-400 shadow-[0_0_8px_rgb(251_113_133)]"
                style={{ left: NAME_W + nowOffset }}
              >
                <span className="absolute -left-1 top-8 size-2 rounded-full bg-rose-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      <Legend payments={payReady !== false} />

      {/* Agenda: easier to scan on a phone */}
      <section className="mt-6">
        <h2 className="mb-2 font-display text-base font-semibold">Agenda</h2>
        {bookings === null ? (
          <div className="h-20 animate-pulse rounded-2xl bg-panel" />
        ) : visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
            No bookings for {fmtDay(date)} yet. Tap any empty slot on the board to add one.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {visible.map((b) => {
              const st = stationById.get(b.station_id);
              const ended = new Date(b.ends_at) <= now;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => setTarget({ mode: "edit", booking: b })}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-tint/5",
                      ended && "opacity-50",
                    )}
                  >
                    <span className="w-28 shrink-0 font-mono text-xs text-muted">
                      {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {b.customer_name}
                        {b.party_size > 1 && <span className="font-normal text-muted"> ×{b.party_size}</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {st?.name ?? "?"}
                        {b.phone && ` · ${displayPhone(b.phone)}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      {payReady && payById.get(b.id) && <PayBadge pay={payById.get(b.id)!} />}
                      <StatusBadge status={b.status} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {hovered && hover && (
        <BookingHoverCard
          target={{ booking: hovered, rect: hover.rect }}
          stationName={stationById.get(hovered.station_id)?.name}
          gameName={hovered.game_id ? gameById.get(hovered.game_id)?.name : null}
          pay={payReady ? payById.get(hovered.id) : undefined}
        />
      )}

      <BookingDialog
        target={target}
        onClose={() => setTarget(null)}
        date={date}
        settings={settings}
        stations={stations}
        types={types}
        games={games}
        bookings={bookings ?? []}
        isOwner={isOwner}
        paymentsOn={payReady !== false}
      />
    </main>
  );
}

/** Solid colour for the thin payment bar along the bottom of a booking block. */
const PAY_BAR: Record<string, string> = {
  unpaid: "bg-rose-500",
  advance: "bg-amber-400",
  paid: "bg-emerald-400",
  overpaid: "bg-sky-400",
  closed: "",
};

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "amber" | "green" | "rose" }) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-display text-2xl font-semibold",
          tone === "amber" && "text-amber-300",
          tone === "green" && "text-emerald-300",
          tone === "rose" && "text-rose-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({ payments }: { payments: boolean }) {
  const items: [string, string][] = [
    ["pending", "Waiting to confirm (🌐 = online)"],
    ["confirmed", "Confirmed"],
    ["arrived", "Playing"],
    ["completed", "Done"],
    ["no_show", "No-show"],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map(([k, label]) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className={cn("size-3 rounded border", STATUS_STYLE[k as keyof typeof STATUS_STYLE], k === "pending" && "border-dashed")} />
          {label}
        </span>
      ))}
      {payments && (
        <span className="flex items-center gap-3 sm:ml-auto">
          <span className="font-semibold">Payment bar:</span>
          {(
            [
              ["unpaid", "Not paid"],
              ["advance", "Advance, balance due"],
              ["paid", "Paid"],
            ] as const
          ).map(([k, label]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("h-1 w-4 rounded", PAY_BAR[k])} />
              {label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
