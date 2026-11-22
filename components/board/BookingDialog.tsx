"use client";
import { useMemo, useState } from "react";
import { Button, ButtonLink, ErrorNote, Field, Input, Modal, Select, StatusBadge, Textarea } from "@/components/ui";
import { bookingErrorMessage } from "@/components/staff/useBookings";
import { bookingPrice, formatINR, stationFree } from "@/lib/availability";
import { message } from "@/lib/messages";
import { displayPhone, normalizePhone, telLink, waLink } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import { businessWindow, daySlots, fmtDuration, fmtTime, minutesBetween } from "@/lib/time";
import type { Booking, BookingStatus, Game, Settings, Station, StationType } from "@/lib/types";
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
  const price = bookingPrice(station, types, minutes, party);

  async function save(status?: BookingStatus) {
    setError(null);
    if (!name.trim()) return setError("Enter the customer's name.");
    if (phoneInvalid) return setError("Phone number doesn't look right.");
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
      ...(status ? { status } : {}),
    };
    let res;
    if (existing) {
      res = await sb.from("bookings").update(row).eq("id", existing.id);
    } else {
      const { data } = await sb.auth.getUser();
      res = await sb
        .from("bookings")
        .insert({ ...row, status: status ?? "confirmed", source: "staff", created_by: data.user?.id ?? null });
    }
    setSaving(false);
    if (res.error) return setError(bookingErrorMessage(res.error));
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
        <Field label="Est. amount">
          <div className="flex h-10 items-center rounded-xl border border-dashed border-line px-3 text-sm">
            {formatINR(price)}
            <span className="ml-auto text-xs text-muted">
              {fmtTime(new Date(startMs))}–{fmtTime(new Date(endMs))}
            </span>
          </div>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </Field>

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
        ) : (
          <Button className="ml-auto" disabled={saving || conflict || !stationId} onClick={() => save()}>
            {saving ? "Saving…" : "Add booking"}
          </Button>
        )}
      </div>
    </div>
  );
}
