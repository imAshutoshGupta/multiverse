"use client";
import { Check, Clock, LayoutDashboard, MessageCircle, Pencil, Phone, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BookingDialog } from "@/components/board/BookingDialog";
import { Button, cn, ErrorNote } from "@/components/ui";
import { LoadingStrip } from "@/components/loading/GameLoader";
import { bookingErrorMessage, useLiveBookings } from "@/components/staff/useBookings";
import { formatINR } from "@/lib/availability";
import { FAR_FUTURE, type InitialBookings } from "@/lib/bookingsWindow";
import { message } from "@/lib/messages";
import { bookingTotal } from "@/lib/payments";
import { displayPhone, telLink, waLink } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, businessDateOf, businessWindow, fmtDay, fmtDuration, fmtTime, istDate, minutesBetween } from "@/lib/time";
import type { Booking, BookingStatus, Game, Settings, Station, StationType } from "@/lib/types";
import { useClock } from "@/lib/useClock";

/** What we know about a customer from their earlier bookings (by phone). */
interface History {
  visits: number;
  noShows: number;
  cancelled: number;
}

export function Requests({
  settings,
  stations,
  types,
  games,
  isOwner,
  initialPending,
}: {
  settings: Settings;
  stations: Station[];
  types: StationType[];
  games: Game[];
  isOwner: boolean;
  initialPending?: InitialBookings | null;
}) {
  // Anything still pending that hasn't finished yet (from the server's "now" when it loaded the list)
  const [since] = useState(() => initialPending?.from ?? new Date().toISOString());
  const { bookings, error } = useLiveBookings(since, FAR_FUTURE, { status: "pending", initial: initialPending });
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<{ booking: Booking; status: BookingStatus } | null>(null);
  const [editing, setEditing] = useState<Booking | null>(null);
  const clock = useClock();
  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const history = useCustomerHistory(bookings);

  // The undo banner goes away on its own
  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), 10_000);
    return () => clearTimeout(t);
  }, [last]);

  async function setStatus(b: Booking, status: BookingStatus) {
    setActionError(null);
    setBusy(b.id);
    const { error } = await supabaseBrowser().from("bookings").update({ status }).eq("id", b.id);
    setBusy(null);
    if (error) {
      setActionError(`${b.customer_name}: ${bookingErrorMessage(error)}`);
      return false;
    }
    if (status !== "pending") setLast({ booking: b, status });
    return true;
  }

  /** Update first, then open WhatsApp, so the customer never gets a message for a change that failed. */
  async function setStatusAndMessage(b: Booking, status: BookingStatus, text: string) {
    // Opened now (inside the click) so the browser doesn't block it; pointed at WhatsApp once saved.
    const win = window.open("about:blank", "_blank");
    const ok = await setStatus(b, status);
    if (!win) return;
    if (ok && b.phone) {
      win.opener = null;
      win.location.href = waLink(b.phone, text);
    } else win.close();
  }

  // Group by business day, soonest first
  const groups = useMemo(() => {
    const today = istDate();
    const m = new Map<string, Booking[]>();
    for (const b of bookings ?? []) {
      const d = businessDateOf(b.starts_at, settings);
      m.set(d, [...(m.get(d) ?? []), b]);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, items]) => ({
        day: d,
        label: d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : fmtDay(d),
        sub: d === today || d === addDays(today, 1) ? fmtDay(d) : "",
        items,
      }));
  }, [bookings, settings]);

  const now = clock ?? 0;
  const oldest = (bookings ?? []).reduce<number | null>((m, b) => {
    const t = new Date(b.created_at).getTime();
    return m === null || t < m ? t : m;
  }, null);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4 sm:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-xl font-semibold sm:text-2xl">
          Booking requests
          {!!bookings?.length && <span className="ml-2 font-sans text-base font-normal text-muted">({bookings.length})</span>}
        </h1>
        {clock && oldest !== null && (
          <span className={cn("flex items-center gap-1 text-xs", now - oldest > 30 * 60_000 ? "text-amber-300" : "text-muted")}>
            <Clock className="size-3.5" aria-hidden /> Oldest waiting {ago(now - oldest)}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted sm:hidden">Online bookings wait here until you confirm or decline.</p>
      <p className="mt-1 hidden text-sm text-muted sm:block">
        Customers who booked on the website. Their slot is held until you confirm or decline. Confirming sends them a ready-made
        WhatsApp message.
      </p>

      <div className="mt-4 space-y-2">
        <ErrorNote>{error ?? actionError}</ErrorNote>
        {last && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm" role="status">
            <span className="min-w-0 flex-1 truncate">
              {last.status === "confirmed" ? "Confirmed" : "Declined"} <b>{last.booking.customer_name}</b> ·{" "}
              {fmtTime(last.booking.starts_at)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                const b = last.booking;
                setLast(null);
                await setStatus(b, "pending");
              }}
            >
              <Undo2 className="size-4" aria-hidden /> Undo
            </Button>
          </div>
        )}
      </div>

      {bookings === null ? (
        error ? null : <LoadingStrip label="Loading requests" className="mt-6" />
      ) : bookings.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          🎉 All caught up. New requests will show up here straight away.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 flex items-baseline gap-2 px-1">
                <span className="font-display text-base font-semibold">{g.label}</span>
                {g.sub && <span className="text-xs text-muted">{g.sub}</span>}
                <span className="text-xs text-muted">· {g.items.length}</span>
              </h2>
              <ul className="space-y-3">
                {g.items.map((b) => (
                  <RequestCard
                    key={b.id}
                    b={b}
                    now={clock}
                    station={stationById.get(b.station_id)}
                    world={types.find((t) => t.name === stationById.get(b.station_id)?.type)}
                    game={b.game_id ? gameById.get(b.game_id)?.name : undefined}
                    amount={bookingTotal(b, stationById.get(b.station_id), types)}
                    history={b.phone ? history.get(b.phone) : undefined}
                    busy={busy === b.id}
                    settings={settings}
                    onConfirm={(text) => (text ? setStatusAndMessage(b, "confirmed", text) : setStatus(b, "confirmed"))}
                    onDecline={(text) => (text ? setStatusAndMessage(b, "cancelled", text) : setStatus(b, "cancelled"))}
                    onEdit={() => setEditing(b)}
                    boardHref={`/staff?date=${businessDateOf(b.starts_at, settings)}`}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditRequest
          booking={editing}
          onClose={() => setEditing(null)}
          settings={settings}
          stations={stations}
          types={types}
          games={games}
          isOwner={isOwner}
        />
      )}
    </main>
  );
}

function RequestCard({
  b,
  now,
  station,
  world,
  game,
  amount,
  history,
  busy,
  settings,
  onConfirm,
  onDecline,
  onEdit,
  boardHref,
}: {
  b: Booking;
  now: number | null;
  station?: Station;
  world?: StationType;
  game?: string;
  amount: number;
  history?: History;
  busy: boolean;
  settings: Settings;
  onConfirm: (whatsapp?: string) => void;
  onDecline: (whatsapp?: string) => void;
  onEdit: () => void;
  boardHref: string;
}) {
  const [declining, setDeclining] = useState(false);
  const mins = minutesBetween(b.starts_at, b.ends_at);
  const waited = now ? now - new Date(b.created_at).getTime() : 0;
  const startsIn = now ? new Date(b.starts_at).getTime() - now : Infinity;
  const confirmText = station && b.phone ? message("confirm", settings, b, station, game) : undefined;
  const declineText = station && b.phone ? message("decline", settings, b, station, game) : undefined;

  return (
    <li
      className={cn(
        "overflow-hidden rounded-2xl border bg-panel",
        startsIn < 2 * 3600_000 ? "border-amber-400/60" : "border-amber-400/25",
        busy && "opacity-60",
      )}
    >
      <div className="flex">
        <span className="w-1.5 shrink-0" style={{ backgroundColor: world?.color ?? "var(--color-line)" }} aria-hidden />
        <div className="min-w-0 flex-1 p-4">
          {/* Who */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 break-words font-display text-lg font-semibold leading-tight">{b.customer_name}</span>
                <CustomerTag history={history} />
              </div>
              {b.phone && (
                <div className="mt-1 flex items-center gap-3 text-sm text-muted">
                  <span>{displayPhone(b.phone)}</span>
                  <a href={telLink(b.phone)} className="hidden items-center gap-1 hover:text-ink sm:inline-flex" aria-label={`Call ${b.customer_name}`}>
                    <Phone className="size-3.5" aria-hidden /> Call
                  </a>
                  <a
                    href={waLink(b.phone, "")}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden items-center gap-1 hover:text-ink sm:inline-flex"
                    aria-label={`Chat with ${b.customer_name} on WhatsApp`}
                  >
                    <MessageCircle className="size-3.5" aria-hidden /> Chat
                  </a>
                </div>
              )}
              {now !== null && (
                <span className={cn("mt-1 flex items-center gap-1 text-xs sm:hidden", waited > 30 * 60_000 ? "text-amber-300" : "text-muted")}>
                  <Clock className="size-3.5" aria-hidden /> asked {ago(waited)}
                </span>
              )}
            </div>
            {/* Phones: thumb-sized contact buttons */}
            {b.phone && (
              <div className="flex shrink-0 gap-2 sm:hidden">
                <a href={telLink(b.phone)} className={ROUND_BTN} aria-label={`Call ${b.customer_name}`}>
                  <Phone className="size-[18px]" aria-hidden />
                </a>
                <a
                  href={waLink(b.phone, "")}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(ROUND_BTN, "border-[#25D366]/40 text-[#25D366]")}
                  aria-label={`Chat with ${b.customer_name} on WhatsApp`}
                >
                  <MessageCircle className="size-[18px]" aria-hidden />
                </a>
              </div>
            )}
            {now !== null && (
              <span className={cn("hidden shrink-0 items-center gap-1 text-xs sm:flex", waited > 30 * 60_000 ? "text-amber-300" : "text-muted")}>
                <Clock className="size-3.5" aria-hidden /> asked {ago(waited)}
              </span>
            )}
          </div>

          {/* What */}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <Detail label="When">
              {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
              {startsIn < 3 * 3600_000 && startsIn > 0 && <span className="block text-[11px] text-amber-300">starts in {ago(startsIn, false)}</span>}
            </Detail>
            <Detail label="Station">
              {station?.name ?? "?"}
              <span className="block text-[11px] text-muted">{fmtDuration(mins)}</span>
            </Detail>
            <Detail label="Players">
              {b.party_size}
              {game && <span className="block truncate text-[11px] text-muted">{game}</span>}
            </Detail>
            <Detail label="Amount">{formatINR(amount)}</Detail>
          </dl>
          {b.notes && <p className="mt-3 rounded-xl bg-panel-2/70 px-3 py-2 text-sm text-muted">“{b.notes}”</p>}
          {history && history.noShows > 0 && (
            <p className="mt-2 text-xs text-rose-300">
              Didn&apos;t turn up {history.noShows === 1 ? "once" : `${history.noShows} times`} before. Consider asking for an advance.
            </p>
          )}

          {/* Actions */}
          {declining ? (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:p-2">
              <span className="px-1 text-sm">Decline this request? The slot will be freed.</span>
              <div className="grid gap-2 sm:contents">
                {declineText && (
                  <Button variant="danger" className={COMPACT} disabled={busy} onClick={() => onDecline(declineText)}>
                    Decline & WhatsApp
                  </Button>
                )}
                <Button variant="danger" className={COMPACT} disabled={busy} onClick={() => onDecline()}>
                  Decline only
                </Button>
                <Button variant="ghost" className={cn(COMPACT, "max-sm:border max-sm:border-line")} onClick={() => setDeclining(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                variant="success"
                className="h-11 w-full sm:h-10 sm:w-auto"
                disabled={busy}
                onClick={() => (confirmText ? onConfirm(confirmText) : onConfirm())}
              >
                <Check className="size-4" aria-hidden /> {confirmText ? "Confirm & WhatsApp" : "Confirm"}
              </Button>
              <div className={cn("grid grid-cols-2 gap-2 sm:contents", ORPHAN_SPAN)}>
                {confirmText && (
                  <Button variant="outline" disabled={busy} onClick={() => onConfirm()}>
                    Confirm only
                  </Button>
                )}
                <Button variant="ghost" className="max-sm:border max-sm:border-line" disabled={busy} onClick={onEdit}>
                  <Pencil className="size-4" aria-hidden /> Change
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDeclining(true)}
                  className="text-rose-300 max-sm:border max-sm:border-rose-500/40"
                >
                  <X className="size-4" aria-hidden /> Decline
                </Button>
                <a
                  href={boardHref}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line text-sm font-semibold text-muted hover:text-ink sm:ml-auto sm:h-auto sm:border-0 sm:font-normal sm:underline-offset-2 sm:hover:underline"
                >
                  <LayoutDashboard className="size-4 sm:hidden" aria-hidden />
                  View on dashboard
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

const ROUND_BTN = "grid size-10 place-items-center rounded-full border border-line bg-panel-2 text-muted transition hover:text-ink active:scale-95";
/** Full size on phones (thumb-friendly), compact on wider screens. */
const COMPACT = "sm:h-8 sm:px-3 sm:text-xs";
/** In a 2-column grid, a lone last item spans the full row instead of leaving a gap. */
const ORPHAN_SPAN = "[&>*:last-child:nth-child(odd)]:col-span-2";

function CustomerTag({ history }: { history?: History }) {
  if (!history) return null;
  if (history.visits === 0 && history.noShows === 0)
    return <span className="rounded-md border border-sky-400/40 bg-sky-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sky-200">New</span>;
  return (
    <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
      Returning · {history.visits} visit{history.visits === 1 ? "" : "s"}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="truncate font-semibold">{children}</dd>
    </div>
  );
}

function ago(ms: number, suffix = true): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  const s = suffix ? " ago" : "";
  if (m < 1) return suffix ? "just now" : "a minute";
  if (m < 60) return `${m} min${s}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? ` ${m % 60}m` : ""}${s}`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""}${s}`;
}

/** Past visits and no-shows for the phone numbers on screen. */
function useCustomerHistory(bookings: Booking[] | null): Map<string, History> {
  const phones = useMemo(() => [...new Set((bookings ?? []).map((b) => b.phone).filter((p): p is string => !!p))].sort(), [bookings]);
  const key = phones.join(",");
  const [loaded, setLoaded] = useState<{ key: string; map: Map<string, History> } | null>(null);
  useEffect(() => {
    if (!phones.length) return;
    let alive = true;
    supabaseBrowser()
      .from("bookings")
      .select("phone, status")
      .in("phone", phones)
      .in("status", ["completed", "no_show", "cancelled", "arrived"])
      .limit(5000)
      .then(({ data }) => {
        if (!alive) return;
        const map = new Map<string, History>(phones.map((p) => [p, { visits: 0, noShows: 0, cancelled: 0 }]));
        for (const r of (data ?? []) as { phone: string; status: BookingStatus }[]) {
          const h = map.get(r.phone);
          if (!h) continue;
          if (r.status === "completed" || r.status === "arrived") h.visits++;
          else if (r.status === "no_show") h.noShows++;
          else h.cancelled++;
        }
        setLoaded({ key, map });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures `phones`
  }, [key]);
  return loaded?.key === key ? loaded.map : new Map();
}

/** Opens the normal booking dialog for a request, with that day's bookings for clash checks. */
function EditRequest({
  booking,
  onClose,
  settings,
  stations,
  types,
  games,
  isOwner,
}: {
  booking: Booking;
  onClose: () => void;
  settings: Settings;
  stations: Station[];
  types: StationType[];
  games: Game[];
  isOwner: boolean;
}) {
  const date = businessDateOf(booking.starts_at, settings);
  const { opensAt, closesAt } = businessWindow(date, settings);
  const { bookings } = useLiveBookings(opensAt.toISOString(), closesAt.toISOString());
  return (
    <BookingDialog
      target={{ mode: "edit", booking }}
      onClose={onClose}
      date={date}
      settings={settings}
      stations={stations}
      types={types}
      games={games}
      bookings={bookings ?? []}
      isOwner={isOwner}
    />
  );
}
