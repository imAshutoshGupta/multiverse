"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink, cn, ErrorNote, Field, Input, Modal, PayBadge, Select, StatusBadge, Textarea } from "@/components/ui";
import { bookingErrorMessage } from "@/components/staff/useBookings";
import { bookingPrice, formatINR, stationFree } from "@/lib/availability";
import { message } from "@/lib/messages";
import { displayPhone, normalizePhone, telLink, waLink } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { bookingTotal, METHOD_LABEL, paySummary, paymentsReady } from "@/lib/payments";
import { businessWindow, daySlots, fmtDay, fmtDuration, fmtTime, istDate, minutesBetween } from "@/lib/time";
import type { Booking, BookingPayment, BookingStatus, Game, PaymentKind, PaymentMethod, Settings, Station, StationType } from "@/lib/types";
import { BLOCKING_STATUSES } from "@/lib/types";

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
  const [advance, setAdvance] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>("upi");
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
  const advanceValue = advance.trim() === "" ? 0 : Number(advance);
  const advanceInvalid = !Number.isFinite(advanceValue) || advanceValue < 0 || advanceValue > 1_000_000;

  async function save(status?: BookingStatus) {
    setError(null);
    if (!name.trim()) return setError("Enter the customer's name.");
    if (phoneInvalid) return setError("Phone number doesn't look right.");
    if (priceInvalid) return setError("Amount doesn't look right.");
    if (!existing && advanceInvalid) return setError("Advance amount doesn't look right.");
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
        note: "Advance",
        created_by: userId,
      });
      if (pay.error) {
        setSaving(false);
        setSavedWithError(true);
        return setError(`Booking added, but the advance wasn't recorded: ${bookingErrorMessage(pay.error)} Open the booking from the board to add it.`);
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
        <Field label="Customer name">
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
        {!existing && paymentsOn && (
          <>
            <Field label="Advance paid (₹)" hint="Optional. Recorded as a payment.">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={advance}
                onChange={(e) => setAdvance(e.target.value)}
                placeholder="0"
                aria-invalid={advanceInvalid}
              />
            </Field>
            <Field label="Paid by">
              <Select value={advanceMethod} onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)} disabled={!advanceValue}>
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
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
        <div className="flex flex-wrap gap-2">
          <ButtonLink
            variant="success"
            className="h-8 px-3 text-xs"
            href={waLink(existing.phone, message("confirm", settings, preview, station, games.find((g) => g.id === gameId)?.name))}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp confirmation
          </ButtonLink>
          <ButtonLink
            className="h-8 px-3 text-xs"
            href={waLink(existing.phone, message("reminder", settings, preview, station, games.find((g) => g.id === gameId)?.name))}
            target="_blank"
            rel="noreferrer"
          >
            Send reminder
          </ButtonLink>
          <ButtonLink className="h-8 px-3 text-xs" href={telLink(existing.phone)}>
            Call {displayPhone(existing.phone)}
          </ButtonLink>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {existing ? (
          <>
            {existing.status === "pending" && (
              <Button variant="success" size="sm" disabled={saving || conflict} onClick={() => save("confirmed")}>
                Confirm
              </Button>
            )}
            {["pending", "confirmed"].includes(existing.status) && (
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setStatus("arrived")}>
                Arrived
              </Button>
            )}
            {existing.status === "arrived" && (
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setStatus("completed")}>
                Finish
              </Button>
            )}
            {["pending", "confirmed"].includes(existing.status) && (
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => setStatus("no_show")}>
                No-show
              </Button>
            )}
            {existing.status !== "cancelled" ? (
              <Button variant="danger" size="sm" disabled={saving} onClick={() => setStatus("cancelled")}>
                Cancel booking
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={saving || conflict} onClick={() => save("confirmed")}>
                Restore
              </Button>
            )}
            {isOwner && (
              <Button variant="ghost" size="sm" disabled={saving} onClick={remove} className="text-rose-300">
                Delete
              </Button>
            )}
            <Button className="ml-auto" disabled={saving || conflict} onClick={() => save()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        ) : savedWithError ? (
          <Button className="ml-auto" onClick={onDone}>
            Close
          </Button>
        ) : (
          <Button className="ml-auto" disabled={saving || conflict || !stationId} onClick={() => save()}>
            {saving ? "Saving…" : advanceValue > 0 ? `Add booking + ${formatINR(advanceValue)} advance` : "Add booking"}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Payment history for one booking, plus quick "record payment / refund" entry. */
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
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

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
  const amountValue = amount.trim() === "" ? summary.due : Number(amount);
  const amountInvalid = !Number.isFinite(amountValue) || amountValue <= 0 || amountValue > 1_000_000;

  async function record(kind: PaymentKind, value = amountValue) {
    setError(null);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount.");
    if (kind === "refund" && value > summary.paid) return setError(`Refund can't be more than what was paid (${formatINR(summary.paid)}).`);
    setBusy(true);
    const sb = supabaseBrowser();
    const { data: auth } = await sb.auth.getUser();
    const { error } = await sb.from("booking_payments").insert({
      booking_id: booking.id,
      amount: value,
      kind,
      method,
      note: note.trim() || null,
      created_by: auth.user?.id ?? null,
    });
    setBusy(false);
    if (error) return setError(bookingErrorMessage(error));
    setAmount("");
    setNote("");
    load();
  }

  async function remove(id: string) {
    setBusy(true);
    const { error } = await supabaseBrowser().from("booking_payments").delete().eq("id", id);
    setBusy(false);
    setConfirmDelete(null);
    if (error) return setError(bookingErrorMessage(error));
    load();
  }

  return (
    <section className="rounded-2xl border border-line bg-panel-2/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Payment</h3>
        <PayBadge pay={summary} />
        <span className="ml-auto text-xs text-muted">
          Total <b className="text-ink">{formatINR(summary.total)}</b> · Paid{" "}
          <b className="text-emerald-300">{formatINR(summary.paid)}</b> · Due{" "}
          <b className={cn(summary.due > 0 ? "text-rose-300" : "text-ink")}>{formatINR(summary.due)}</b>
        </span>
      </div>
      {totalChanged && <p className="mt-1 text-[11px] text-amber-300">Total uses your unsaved changes. Press Save to keep them.</p>}

      {payments === null ? (
        !error && <div className="mt-3 h-8 animate-pulse rounded-lg bg-panel" />
      ) : payments.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No payments recorded yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line/60 text-xs">
          {payments.map((p) => {
            const day = istDate(new Date(p.created_at));
            return (
              <li key={p.id} className="flex items-center gap-2 py-1.5">
                <span className={cn("w-20 shrink-0 font-mono font-semibold", p.kind === "refund" ? "text-sky-300" : "text-emerald-300")}>
                  {p.kind === "refund" ? "−" : "+"}
                  {formatINR(Number(p.amount))}
                </span>
                <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5">{METHOD_LABEL[p.method]}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {p.kind === "refund" ? "Refund" : ""}
                  {p.kind === "refund" && p.note ? " · " : ""}
                  {p.note}
                </span>
                <span className="shrink-0 text-muted">
                  {day === istDate() ? "" : `${fmtDay(day)}, `}
                  {fmtTime(p.created_at)}
                </span>
                {isOwner &&
                  (confirmDelete === p.id ? (
                    <Button variant="danger" size="sm" className="h-6 px-2" disabled={busy} onClick={() => remove(p.id)}>
                      Delete?
                    </Button>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(p.id)}
                      className="cursor-pointer rounded p-0.5 text-muted hover:text-rose-300"
                      aria-label="Delete payment"
                      title="Delete this entry (owner only)"
                    >
                      ✕
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[7rem_auto_1fr]">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={summary.due > 0 ? String(summary.due) : "Amount"}
          aria-label="Amount"
          className="h-9"
        />
        <div className="flex overflow-hidden rounded-xl border border-line" role="radiogroup" aria-label="Paid by">
          {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cn(
                "cursor-pointer px-2.5 text-xs font-semibold transition",
                method === m ? "bg-portal text-on-portal" : "text-muted hover:bg-tint/5 hover:text-ink",
              )}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Note (UPI ref, etc.)"
          aria-label="Note"
          className="col-span-2 h-9 sm:col-span-1"
        />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="success" disabled={busy || amountInvalid} onClick={() => record("payment")}>
          {amountInvalid ? "Record payment" : `Record ${formatINR(amountValue)} payment`}
        </Button>
        {summary.due > 0 && amount.trim() !== "" && amountValue !== summary.due && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => record("payment", summary.due)}>
            Mark fully paid ({formatINR(summary.due)})
          </Button>
        )}
        {summary.paid > 0 && (
          <Button size="sm" variant="ghost" disabled={busy || amountInvalid} onClick={() => record("refund")}>
            {amountInvalid ? "Refund" : `Refund ${formatINR(amountValue)}`}
          </Button>
        )}
      </div>
    </section>
  );
}
