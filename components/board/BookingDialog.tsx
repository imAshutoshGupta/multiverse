"use client";
import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink, cn, ErrorNote, Field, Input, Modal, PayBadge, Select, StatusBadge, Textarea } from "@/components/ui";
import { bookingErrorMessage } from "@/components/staff/useBookings";
import { bookingPrice, formatINR, stationFree } from "@/lib/availability";
import { message } from "@/lib/messages";
import { displayPhone, normalizePhone, telLink, waLink } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { bookingTotal, DEFAULT_METHOD, METHOD_LABEL, PICK_METHODS, paySummary, paymentsReady } from "@/lib/payments";
import { businessWindow, daySlots, fmtDay, fmtDuration, fmtTime, istDate, minutesBetween } from "@/lib/time";
import type { Booking, BookingPayment, BookingStatus, Game, PaymentKind, PaymentMethod, Settings, Station, StationType } from "@/lib/types";
import { BLOCKING_STATUSES } from "@/lib/types";

// Phones get the full-size (md) button, thumb-friendly; wider screens shrink it to the compact row
const ACTION_BTN = "sm:h-8 sm:px-3 sm:text-xs";
const CONTACT_BTN = cn(ACTION_BTN, "whitespace-nowrap");
/** In a 2-column grid, a lone last button spans the full row instead of leaving a gap. */
const ORPHAN_SPAN = "[&>*:last-child:nth-child(odd)]:col-span-2";

export type DialogTarget =
  | { mode: "new"; stationId?: string; start?: string }
  | { mode: "edit"; booking: Booking };

export function BookingDialog({
  target,
  onClose,
  date,
  settings,
  stations,
  types,
  games,
  bookings,
  isOwner,
  paymentsOn = true,
}: {
  target: DialogTarget | null;
  onClose: () => void;
  date: string;
  settings: Settings;
  stations: Station[];
  types: StationType[];
  games: Game[];
  bookings: Booking[];
  isOwner: boolean;
  paymentsOn?: boolean;
}) {
  const title = !target ? "" : target.mode === "new" ? "New booking" : target.booking.customer_name;
  return (
    <Modal open={!!target} onClose={onClose} title={title}>
      {target && (
        <BookingForm
          key={target.mode === "edit" ? target.booking.id : `${target.stationId}-${target.start}`}
          target={target}
          onDone={onClose}
          date={date}
          settings={settings}
          stations={stations}
          types={types}
          games={games}
          bookings={bookings}
          isOwner={isOwner}
          paymentsOn={paymentsOn}
        />
      )}
    </Modal>
  );
}

function BookingForm({
  target,
  onDone,
  date,
  settings,
  stations,
  types,
  games,
  bookings,
  isOwner,
  paymentsOn,
}: {
  target: DialogTarget;
  onDone: () => void;
  date: string;
  settings: Settings;
  stations: Station[];
  types: StationType[];
  games: Game[];
  bookings: Booking[];
  isOwner: boolean;
  paymentsOn: boolean;
}) {
  const existing = target.mode === "edit" ? target.booking : null;
  const slots = useMemo(() => daySlots(date, settings), [date, settings]);
  const { closesAt } = businessWindow(date, settings);

  const [stationId, setStationId] = useState(
    existing?.station_id ?? (target.mode === "new" ? target.stationId : undefined) ?? stations[0]?.id ?? "",
  );
  const [start, setStart] = useState(
    existing?.starts_at
      ? new Date(existing.starts_at).toISOString()
      : ((target.mode === "new" && target.start) || slots[0]?.toISOString() || ""),
  );
  const [minutes, setMinutes] = useState(existing ? minutesBetween(existing.starts_at, existing.ends_at) : 60);
  const [name, setName] = useState(existing?.customer_name ?? "");
  const [phone, setPhone] = useState(existing?.phone ? displayPhone(existing.phone) : "");
  const [gameId, setGameId] = useState(existing?.game_id ?? "");
  const [party, setParty] = useState(existing?.party_size ?? 1);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  // Agreed amount; blank = the station's standard rate.
  const [priceInput, setPriceInput] = useState(existing?.price != null ? String(Number(existing.price)) : "");
  // New bookings: has the customer paid anything yet?
  const [payMode, setPayMode] = useState<"none" | "advance" | "full">("none");
  const [advance, setAdvance] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>(DEFAULT_METHOD);
  const [savedWithError, setSavedWithError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const station = stations.find((s) => s.id === stationId);
  const startMs = new Date(start).getTime();
  const endMs = startMs + minutes * 60_000;

  // Durations: slot multiples, up to the longer of the max setting and the current booking.
  const durations = useMemo(() => {
    const out: number[] = [];
    const cap = Math.max(settings.max_booking_minutes, minutes);
    for (let m = settings.slot_minutes; m <= cap; m += settings.slot_minutes) out.push(m);
    if (!out.includes(minutes)) out.push(minutes);
    return out.sort((a, b) => a - b);
  }, [settings, minutes]);

  // Include the booking's own start even if it's off-grid.
  const startOptions = useMemo(() => {
    const list = slots.map((s) => s.toISOString());
    if (start && !list.includes(start)) list.push(start);
    return list.sort();
  }, [slots, start]);

  const blocking = bookings.filter((b) => BLOCKING_STATUSES.includes(b.status));
  const conflict = Boolean(stationId && start) && !stationFree(stationId, startMs, endMs, blocking, existing?.id);
  const pastClose = endMs > closesAt.getTime();
  const phoneNorm = phone.trim() ? normalizePhone(phone) : null;
  const phoneInvalid = phone.trim() !== "" && !phoneNorm;
  const overCapacity = station ? party > station.max_players : false;
  const stationGames = games.filter((g) => g.active && (!g.worlds.length || (station && g.worlds.includes(station.type))));
  const standardPrice = bookingPrice(station, types, minutes, party);
  const priceValue = priceInput.trim() === "" ? null : Number(priceInput);
  const priceInvalid = priceValue !== null && (!Number.isFinite(priceValue) || priceValue < 0 || priceValue > 1_000_000);
  const total = priceValue ?? standardPrice;
  const advanceValue = payMode === "full" ? total : payMode === "advance" ? (advance.trim() === "" ? 0 : Number(advance)) : 0;
  const advanceInvalid =
    payMode === "advance" && (!Number.isFinite(advanceValue) || advanceValue <= 0 || advanceValue > 1_000_000);

  async function save(status?: BookingStatus) {
    setError(null);
    if (!name.trim()) return setError("Enter the customer's name.");
    if (phoneInvalid) return setError("Phone number doesn't look right.");
    if (priceInvalid) return setError("Amount doesn't look right.");
    if (!existing && advanceInvalid) return setError("Enter how much advance the customer paid.");
    setSaving(true);
    const sb = supabaseBrowser();
    const row = {
      station_id: stationId,
      customer_name: name.trim(),
      phone: phoneNorm,
      game_id: gameId || null,
      starts_at: new Date(startMs).toISOString(),
      ends_at: new Date(endMs).toISOString(),
      party_size: party,
      notes: notes.trim() || null,
      // Only send price when it's used, so saving still works before migration 0006.
      ...(priceValue !== null || existing?.price != null ? { price: priceValue } : {}),
      ...(status ? { status } : {}),
    };
    if (existing) {
      const res = await sb.from("bookings").update(row).eq("id", existing.id);
      setSaving(false);
      if (res.error) return setError(bookingErrorMessage(res.error));
      return onDone();
    }
    const { data: auth } = await sb.auth.getUser();
    const userId = auth.user?.id ?? null;
    const res = await sb
      .from("bookings")
      .insert({ ...row, status: status ?? "confirmed", source: "staff", created_by: userId })
      .select("id")
      .single();
    if (res.error) {
      setSaving(false);
      return setError(bookingErrorMessage(res.error));
    }
    if (advanceValue > 0) {
      const pay = await sb.from("booking_payments").insert({
        booking_id: res.data.id,
        amount: advanceValue,
        kind: "payment",
        method: advanceMethod,
        note: payMode === "full" ? "Paid in full at booking" : "Advance",
        created_by: userId,
      });
      if (pay.error) {
        setSaving(false);
        setSavedWithError(true);
        return setError(`Booking added, but the payment wasn't recorded: ${bookingErrorMessage(pay.error)} Open the booking from the dashboard to add it.`);
      }
    }
    setSaving(false);
    onDone();
  }

  async function setStatus(status: BookingStatus) {
    if (!existing) return;
    setSaving(true);
    const { error } = await supabaseBrowser().from("bookings").update({ status }).eq("id", existing.id);
    setSaving(false);
    if (error) return setError(bookingErrorMessage(error));
    onDone();
  }

  async function remove() {
    if (!existing) return;
    setSaving(true);
    const { error } = await supabaseBrowser().from("bookings").delete().eq("id", existing.id);
    setSaving(false);
    if (error) return setError(bookingErrorMessage(error));
    onDone();
  }

  const preview: Booking | null =
    existing && station
      ? { ...existing, customer_name: name, starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString(), party_size: party }
      : null;

  return (
    <div className="flex flex-col gap-4">
      {existing && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusBadge status={existing.status} />
          <span>{existing.source === "online" ? "Online request" : "Added by staff"}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Station">
          <Select value={stationId} onChange={(e) => setStationId(e.target.value)}>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {!s.active ? " (inactive)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Players">
          <Input
            type="number"
            min={1}
            max={50}
            value={party}
            onChange={(e) => setParty(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="Start">
          <Select value={start} onChange={(e) => setStart(e.target.value)}>
            {startOptions.map((iso) => (
              <option key={iso} value={iso}>
                {fmtTime(iso)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duration">
          <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {durations.map((m) => (
              <option key={m} value={m}>
                {fmtDuration(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Customer name" className="col-span-2 sm:col-span-1">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus={!existing} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Optional" />
        </Field>
        <Field label="Game">
          <Select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">-</option>
            {stationGames.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          className="col-span-2 sm:col-span-1"
          label="Amount (₹)"
          hint={priceValue === null ? `Standard rate · ${fmtTime(new Date(startMs))}–${fmtTime(new Date(endMs))}` : `Standard ${formatINR(standardPrice)} · type to change (discount, package)`}
        >
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            placeholder={String(standardPrice)}
            aria-invalid={priceInvalid}
          />
        </Field>
      </div>
      {!existing && paymentsOn && (
        <div className="rounded-2xl border border-line bg-panel-2/60 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Has the customer paid?</div>
          <Segmented
            className="mt-2"
            value={payMode}
            onChange={setPayMode}
            options={[
              ["none", "Not yet"],
              ["advance", "Paid advance"],
              ["full", `Paid in full · ${formatINR(total)}`],
            ]}
          />
          {payMode !== "none" && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              {payMode === "advance" && (
                <Field label="Advance amount (₹)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={advance}
                    onChange={(e) => setAdvance(e.target.value)}
                    placeholder="e.g. 200"
                    aria-invalid={advanceInvalid}
                    className="w-36"
                    autoFocus
                  />
                </Field>
              )}
              <Field label="Paid by">
                <MethodPicker value={advanceMethod} onChange={setAdvanceMethod} />
              </Field>
            </div>
          )}
          {payMode === "advance" && advanceValue > 0 && !advanceInvalid && (
            <p className="mt-2 text-xs text-muted">
              {advanceValue >= total ? "That covers the full amount." : `${formatINR(total - advanceValue)} will be due when they play.`}
            </p>
          )}
        </div>
      )}

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </Field>

      {existing && paymentsOn && paymentsReady(existing) && (
        <PaymentsPanel booking={existing} total={total} totalChanged={total !== bookingTotal(existing, stations.find((s) => s.id === existing.station_id), types)} isOwner={isOwner} />
      )}

      {conflict && <ErrorNote>This overlaps another booking on {station?.name}. Pick another time or station.</ErrorNote>}
      {pastClose && !conflict && (
        <p className="text-xs text-amber-300">Heads up: this runs past closing time.</p>
      )}
      {overCapacity && (
        <p className="text-xs text-amber-300">
          {station?.name} is set for up to {station?.max_players} players.
        </p>
      )}
      <ErrorNote>{error}</ErrorNote>

      {existing?.phone && preview && station && (
        <div className={cn("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap", ORPHAN_SPAN)}>
          <ButtonLink
            variant="success"
            className={CONTACT_BTN}
            href={waLink(existing.phone, message("confirm", settings, preview, station, games.find((g) => g.id === gameId)?.name))}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4 shrink-0 sm:hidden" aria-hidden />
            <span className="sm:hidden">Confirmation</span>
            <span className="hidden sm:inline">WhatsApp confirmation</span>
          </ButtonLink>
          <ButtonLink
            className={CONTACT_BTN}
            href={waLink(existing.phone, message("reminder", settings, preview, station, games.find((g) => g.id === gameId)?.name))}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4 shrink-0 sm:hidden" aria-hidden />
            <span className="sm:hidden">Reminder</span>
            <span className="hidden sm:inline">Send reminder</span>
          </ButtonLink>
          <ButtonLink className={CONTACT_BTN} href={telLink(existing.phone)}>
            Call {displayPhone(existing.phone)}
          </ButtonLink>
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-5 -mb-4 flex flex-col gap-2 border-t border-line bg-panel px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:pb-4 sm:pt-4">
        {existing ? (
          <>
            <div className={cn("grid grid-cols-2 gap-2 empty:hidden sm:flex sm:flex-wrap", ORPHAN_SPAN)}>
              {existing.status === "pending" && (
                <Button variant="success" className={ACTION_BTN} disabled={saving || conflict} onClick={() => save("confirmed")}>
                  Confirm
                </Button>
              )}
              {["pending", "confirmed"].includes(existing.status) && (
                <Button variant="outline" className={ACTION_BTN} disabled={saving} onClick={() => setStatus("arrived")}>
                  Arrived
                </Button>
              )}
              {existing.status === "arrived" && (
                <Button variant="outline" className={ACTION_BTN} disabled={saving} onClick={() => setStatus("completed")}>
                  Finish
                </Button>
              )}
              {["pending", "confirmed"].includes(existing.status) && (
                <Button variant="ghost" className={ACTION_BTN} disabled={saving} onClick={() => setStatus("no_show")}>
                  No-show
                </Button>
              )}
              {existing.status !== "cancelled" ? (
                <Button variant="danger" className={ACTION_BTN} disabled={saving} onClick={() => setStatus("cancelled")}>
                  Cancel booking
                </Button>
              ) : (
                <Button variant="outline" className={ACTION_BTN} disabled={saving || conflict} onClick={() => save("confirmed")}>
                  Restore
                </Button>
              )}
              {isOwner && (
                <Button variant="ghost" disabled={saving} onClick={remove} className={cn(ACTION_BTN, "text-rose-300")}>
                  Delete
                </Button>
              )}
            </div>
            <Button size="lg" className="w-full sm:ml-auto sm:h-10 sm:w-auto sm:px-4 sm:text-sm" disabled={saving || conflict} onClick={() => save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        ) : savedWithError ? (
          <Button size="lg" className="w-full sm:ml-auto sm:h-10 sm:w-auto sm:px-4 sm:text-sm" onClick={onDone}>
            Close
          </Button>
        ) : (
          <Button size="lg" className="w-full sm:ml-auto sm:h-10 sm:w-auto sm:px-4 sm:text-sm" disabled={saving || conflict || !stationId} onClick={() => save()}>
            {saving
              ? "Saving…"
              : payMode === "full"
                ? `Add booking · paid ${formatINR(total)}`
                : payMode === "advance" && advanceValue > 0
                  ? `Add booking · ${formatINR(advanceValue)} advance`
                  : "Add booking"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Small pill-style single choice. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-9 cursor-pointer rounded-xl border px-3 text-xs font-semibold transition",
            value === v ? "border-portal bg-portal text-on-portal" : "border-line text-muted hover:border-portal/60 hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function MethodPicker({ value, onChange }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return <Segmented value={value} onChange={onChange} options={PICK_METHODS.map((m) => [m, METHOD_LABEL[m]] as [PaymentMethod, string])} />;
}

/**
 * Payment section of an existing booking. One clear action at a time:
 * collect the balance (pre-filled), or, behind a link, give a refund.
 */
function PaymentsPanel({
  booking,
  total,
  totalChanged,
  isOwner,
}: {
  booking: Booking;
  total: number;
  totalChanged: boolean;
  isOwner: boolean;
}) {
  const [payments, setPayments] = useState<BookingPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<PaymentKind>("payment");
  const [amount, setAmount] = useState<string | null>(null); // null = use the suggested amount
  const [method, setMethod] = useState<PaymentMethod>(DEFAULT_METHOD);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .from("booking_payments")
      .select("*")
      .eq("booking_id", booking.id)
      .order("created_at")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(bookingErrorMessage(error));
        else setPayments(data as BookingPayment[]);
      });
    return () => {
      alive = false;
    };
  }, [booking.id, version]);

  const paid = (payments ?? []).reduce((sum, p) => sum + (p.kind === "refund" ? -1 : 1) * Number(p.amount), 0);
  const summary = paySummary(booking.status, total, payments ? paid : booking.paid_amount);
  const extra = Math.max(0, summary.paid - summary.total);
  const suggested = mode === "refund" ? extra || summary.paid : summary.due;
  const value = amount === null ? suggested : amount.trim() === "" ? 0 : Number(amount);
  const invalid = !Number.isFinite(value) || value <= 0 || value > 1_000_000 || (mode === "refund" && value > summary.paid);
  const showForm = mode === "refund" || summary.due > 0;

  function switchMode(m: PaymentKind) {
    setMode(m);
    setAmount(null);
    setError(null);
  }

  async function save() {
    setError(null);
    if (invalid) {
      return setError(
        mode === "refund" && value > summary.paid
          ? `You can refund at most ${formatINR(summary.paid)} (what they paid).`
          : "Enter an amount.",
      );
    }
    setBusy(true);
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    const { error } = await sb.from("booking_payments").insert({
      booking_id: booking.id,
      amount: value,
      kind: mode,
      method,
      note: note.trim() || null,
      created_by: auth.user?.id ?? null,
    });
    setBusy(false);
    if (error) return setError(bookingErrorMessage(error));
    setAmount(null);
    setNote("");
    setMode("payment");
    reload();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabaseBrowser().from("booking_payments").delete().eq("id", id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) return setError(bookingErrorMessage(error));
    reload();
  }

  // What will happen after this entry is saved, in plain words.
  const outcome =
    invalid || mode === "refund"
      ? null
      : value >= summary.due
        ? value > summary.due
          ? `That's ${formatINR(value - summary.due)} more than the balance.`
          : "Clears the balance. Booking will show as Paid."
        : `Part payment. ${formatINR(summary.due - value)} will still be due.`;

  return (
    <section className="rounded-2xl border border-line bg-panel-2/60 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Payment</h3>
        <PayBadge pay={summary} />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Money label="Total" value={summary.total} />
        <Money label="Paid" value={summary.paid} tone="green" />
        <Money label="Due" value={summary.due} tone={summary.due > 0 ? "rose" : undefined} />
      </div>
      {totalChanged && <p className="mt-1 text-[11px] text-amber-300">Total includes your unsaved changes. Press Save to keep them.</p>}

      {!showForm && summary.state !== "closed" && (
        <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          ✓ Fully paid. Nothing to collect.
        </p>
      )}

      {showForm && (
        <div className={cn("mt-3 rounded-xl border p-3", mode === "refund" ? "border-sky-400/40" : "border-line")}>
          <div className="text-sm font-semibold">{mode === "refund" ? "Give money back" : "Collect payment"}</div>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Field label="Amount (₹)">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={amount ?? (suggested ? String(suggested) : "")}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={invalid}
                className="w-32"
              />
            </Field>
            <Field label={mode === "refund" ? "Given back by" : "Paid by"}>
              <MethodPicker value={method} onChange={setMethod} />
            </Field>
          </div>
          {outcome && <p className="mt-2 text-xs text-muted">{outcome}</p>}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="Note, optional (e.g. UPI ref)"
            aria-label="Note"
            className="mt-2 h-9"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button className={ACTION_BTN} variant={mode === "refund" ? "outline" : "success"} disabled={busy || invalid} onClick={save}>
              {busy ? "Saving…" : mode === "refund" ? `Save refund of ${formatINR(value || 0)}` : `Save ${formatINR(value || 0)} payment`}
            </Button>
            {mode === "refund" && (
              <Button className={ACTION_BTN} variant="ghost" onClick={() => switchMode("payment")}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {payments === null ? (
        !error && <div className="mt-3 h-8 animate-pulse rounded-lg bg-panel" />
      ) : (
        payments.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">History</div>
            <ul className="mt-1 divide-y divide-line/60 text-xs">
              {payments.map((p) => {
                const day = istDate(new Date(p.created_at));
                return (
                  <li key={p.id} className="flex items-center gap-2 py-1.5">
                    <span className={cn("w-20 shrink-0 font-mono font-semibold", p.kind === "refund" ? "text-sky-300" : "text-emerald-300")}>
                      {p.kind === "refund" ? "−" : "+"}
                      {formatINR(Number(p.amount))}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.kind === "refund" ? "Refund" : "Paid"} by {METHOD_LABEL[p.method]}
                      {p.note && <span className="text-muted"> · {p.note}</span>}
                    </span>
                    <span className="shrink-0 text-muted">
                      {day === istDate() ? "today" : fmtDay(day)}, {fmtTime(p.created_at)}
                    </span>
                    {isOwner &&
                      (confirmDelete === p.id ? (
                        <Button variant="danger" size="sm" className="h-6 px-2" disabled={busy} onClick={() => remove(p.id)}>
                          Delete entry?
                        </Button>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(p.id)}
                          className="cursor-pointer rounded p-0.5 text-muted hover:text-rose-300"
                          aria-label="Delete this entry"
                          title="Delete this entry (if it was added by mistake)"
                        >
                          ✕
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}

      {mode === "payment" && summary.paid > 0 && (
        <button
          type="button"
          onClick={() => switchMode("refund")}
          className="mt-2 cursor-pointer text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Need to give money back? Record a refund
        </button>
      )}
    </section>
  );
}

function Money({ label, value, tone }: { label: string; value: number; tone?: "green" | "rose" }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-2 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={cn("font-mono text-base font-semibold", tone === "green" && "text-emerald-300", tone === "rose" && "text-rose-300")}>
        {formatINR(value)}
      </div>
    </div>
  );
}
