"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn, PayBadge, StatusBadge } from "@/components/ui";
import { formatINR } from "@/lib/availability";
import type { PaySummary } from "@/lib/payments";
import { displayPhone } from "@/lib/phone";
import { fmtDuration, fmtTime, minutesBetween } from "@/lib/time";
import type { Booking } from "@/lib/types";

export interface HoverTarget {
  booking: Booking;
  /** Screen rect of the booking block it belongs to. */
  rect: DOMRect;
}

const GAP = 8;
const W = 288;

/**
 * Quick-look card for a booking on the board: who, when, where and what they owe.
 * Rendered in a portal with fixed positioning so the board's scroll area can't clip it.
 */
export function BookingHoverCard({
  target,
  stationName,
  gameName,
  pay,
}: {
  target: HoverTarget;
  stationName?: string;
  gameName?: string | null;
  pay?: PaySummary;
}) {
  const { booking: b, rect } = target;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Below the block if it fits, otherwise above; kept inside the window horizontally.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP + h <= window.innerHeight;
    const top = below ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - h);
    const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - W - GAP);
    setPos({ top, left });
  }, [rect]);

  const mins = minutesBetween(b.starts_at, b.ends_at);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ width: W, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cn(
        "pointer-events-none fixed z-50 rounded-2xl border border-line bg-panel p-3 text-ink shadow-2xl shadow-black/40 transition-opacity duration-100",
        pos ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold">{b.customer_name}</div>
          <div className="text-xs text-muted">
            {b.phone ? displayPhone(b.phone) : "No phone"}
            {" · "}
            {b.party_size} player{b.party_size > 1 ? "s" : ""}
          </div>
        </div>
        <StatusBadge status={b.status} />
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Time</dt>
        <dd>
          {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)} <span className="text-muted">({fmtDuration(mins)})</span>
        </dd>
        <dt className="text-muted">Station</dt>
        <dd className="truncate">{stationName ?? "?"}</dd>
        {gameName && (
          <>
            <dt className="text-muted">Game</dt>
            <dd className="truncate">{gameName}</dd>
          </>
        )}
        <dt className="text-muted">Booked</dt>
        <dd>{b.source === "online" ? "🌐 Online request" : "By staff"}</dd>
      </dl>

      {pay && (
        <div className="mt-3 rounded-xl border border-line bg-panel-2/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Payment</span>
            <PayBadge pay={pay} compact />
          </div>
          <div className="mt-1.5 grid grid-cols-3 text-center text-xs">
            <div>
              <div className="text-[10px] text-muted">Total</div>
              <div className="font-mono font-semibold">{formatINR(pay.total)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">Paid</div>
              <div className="font-mono font-semibold text-emerald-300">{formatINR(pay.paid)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted">Due</div>
              <div className={cn("font-mono font-semibold", pay.due > 0 && "text-rose-300")}>{formatINR(pay.due)}</div>
            </div>
          </div>
        </div>
      )}

      {b.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">📝 {b.notes}</p>}
      <p className="mt-2 text-[10px] text-muted/80">Click to open</p>
    </div>,
    document.body,
  );
}
