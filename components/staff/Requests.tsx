"use client";
import { useMemo, useState } from "react";
import { Button, ButtonLink, ErrorNote } from "@/components/ui";
import { bookingErrorMessage, useLiveBookings } from "@/components/staff/useBookings";
import { bookingPrice, formatINR } from "@/lib/availability";
import { FAR_FUTURE, type InitialBookings } from "@/lib/bookingsWindow";
import { message } from "@/lib/messages";
import { displayPhone, telLink, waLink } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { businessDateOf, fmtDay, fmtDuration, fmtTime, istDate, minutesBetween } from "@/lib/time";
import type { Booking, BookingStatus, Game, Settings, Station, StationType } from "@/lib/types";

export function Requests({
  settings,
  stations,
  types,
  games,
  initialPending,
}: {
  settings: Settings;
  stations: Station[];
  types: StationType[];
  games: Game[];
  initialPending?: InitialBookings | null;
}) {
  // Anything still pending that hasn't finished yet (from the server's "now" when it loaded the list)
  const [since] = useState(() => initialPending?.from ?? new Date().toISOString());
  const { bookings, error } = useLiveBookings(since, FAR_FUTURE, { status: "pending", initial: initialPending });
  const [actionError, setActionError] = useState<string | null>(null);
  const stationById = useMemo(() => new Map(stations.map((s) => [s.id, s])), [stations]);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);

  async function setStatus(b: Booking, status: BookingStatus) {
    setActionError(null);
    const { error } = await supabaseBrowser().from("bookings").update({ status }).eq("id", b.id);
    if (error) setActionError(bookingErrorMessage(error));
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="font-display text-2xl font-semibold">Booking requests</h1>
      <p className="mt-1 text-sm text-muted">
        Online requests hold their slot until you confirm or decline. Confirming opens WhatsApp with a ready message.
      </p>
      <div className="mt-4 space-y-2">
        <ErrorNote>{error ?? actionError}</ErrorNote>
      </div>

      {bookings === null ? (
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-panel" />
      ) : bookings.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          🎉 All caught up. New requests will pop up here instantly.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {bookings.map((b) => {
            const st = stationById.get(b.station_id);
            const mins = minutesBetween(b.starts_at, b.ends_at);
            const game = b.game_id ? gameById.get(b.game_id)?.name : null;
            return (
              <li key={b.id} className="rounded-2xl border border-amber-400/30 bg-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-lg font-semibold">{b.customer_name}</div>
                    {b.phone && (
                      <a href={telLink(b.phone)} className="text-sm text-muted hover:text-ink">
                        {displayPhone(b.phone)}
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {fmtDay(istDate(new Date(b.starts_at)))} · {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                    </div>
                    <div className="text-sm text-muted">
                      {st?.name} · {fmtDuration(mins)} · {b.party_size} player{b.party_size > 1 ? "s" : ""}
                      {st && ` · ${formatINR(bookingPrice(st, types, mins, b.party_size))}`}
                    </div>
                  </div>
                </div>
                {(game || b.notes) && (
                  <p className="mt-2 text-sm text-muted">
                    {game && <span className="text-ink">🎮 {game}</span>}
                    {game && b.notes && " · "}
                    {b.notes && <>“{b.notes}”</>}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {b.phone && st ? (
                    <ButtonLink
                      variant="success"
                      href={waLink(b.phone, message("confirm", settings, b, st, game))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setStatus(b, "confirmed")}
                    >
                      ✓ Confirm & WhatsApp
                    </ButtonLink>
                  ) : null}
                  <Button variant="outline" onClick={() => setStatus(b, "confirmed")}>
                    Confirm only
                  </Button>
                  {b.phone && st && (
                    <ButtonLink
                      variant="danger"
                      href={waLink(b.phone, message("decline", settings, b, st, game))}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setStatus(b, "cancelled")}
                    >
                      Decline & WhatsApp
                    </ButtonLink>
                  )}
                  <a
                    href={`/staff?date=${businessDateOf(b.starts_at, settings)}`}
                    className="ml-auto self-center text-sm text-muted underline hover:text-ink"
                  >
                    View on board
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
