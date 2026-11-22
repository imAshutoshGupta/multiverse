"use client";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, cn, Input } from "@/components/ui";
import { DateField } from "@/components/ui/DatePicker";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtLongDay, istDate, WEEKDAYS } from "@/lib/time";
import type { Closure, Settings, WeeklyHours } from "@/lib/types";
import { isDirty, SaveBar, Section, Toggle, useSaver } from "./shared";

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

interface Row {
  open: string;
  close: string;
  closed: boolean;
}

export function HoursTab({ settings, closures }: { settings: Settings; closures: Closure[] }) {
  const initial: Record<number, Row> = Object.fromEntries(
    ORDER.map((d) => {
      const h = settings.weekly_hours?.[String(d)] ?? {};
      return [d, { open: h.open ?? settings.open_time.slice(0, 5), close: h.close ?? settings.close_time.slice(0, 5), closed: Boolean(h.closed) }];
    }),
  );
  const [rows, setRows] = useState(initial);
  const saver = useSaver();
  const set = (d: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [d]: { ...r[d], ...patch } }));

  function save() {
    if (ORDER.every((d) => rows[d].closed)) return saver.setError("At least one day needs to be open.");
    const weekly: WeeklyHours = Object.fromEntries(ORDER.map((d) => [String(d), rows[d]]));
    const firstOpen = rows[ORDER.find((d) => !rows[d].closed)!];
    saver.run(() =>
      supabaseBrowser()
        .from("settings")
        .update({ weekly_hours: weekly, open_time: firstOpen.open, close_time: firstOpen.close })
        .eq("id", 1),
    );
  }

  return (
    <div className="space-y-6">
      <Section
        title="Weekly hours"
        description="Customers can only book inside these hours. A closing time earlier than opening means you close after midnight."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((r) => Object.fromEntries(ORDER.map((d) => [d, { ...r[1] }])))}
          >
            Copy Monday to every day
          </Button>
        }
      >
        <div className="divide-y divide-line">
          {ORDER.map((d) => {
            const r = rows[d];
            const overnight = !r.closed && r.close <= r.open;
            return (
              <div key={d} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-28 font-semibold">{WEEKDAYS[d]}</span>
                <Toggle checked={!r.closed} onChange={(v) => set(d, { closed: !v })} label={r.closed ? "Closed" : "Open"} />
                <div className={cn("flex items-center gap-2", r.closed && "pointer-events-none opacity-30")}>
                  <Input type="time" value={r.open} onChange={(e) => set(d, { open: e.target.value })} className="w-32" aria-label={`${WEEKDAYS[d]} opening time`} />
                  <span className="text-muted">to</span>
                  <Input type="time" value={r.close} onChange={(e) => set(d, { close: e.target.value })} className="w-32" aria-label={`${WEEKDAYS[d]} closing time`} />
                  {overnight && <span className="text-xs text-rift">closes after midnight</span>}
                </div>
              </div>
            );
          })}
        </div>
        <SaveBar saver={saver} dirty={isDirty(initial, rows)} onSave={save} />
      </Section>
      <Closures closures={closures} />
    </div>
  );
}

function Closures({ closures }: { closures: Closure[] }) {
  const today = istDate();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const saver = useSaver();
  const sb = supabaseBrowser();
  // Adds and removals show straight away; each rolls back if its save fails
  const [added, setAdded] = useState<Closure[]>([]);
  const [gone, setGone] = useState<string[]>([]);
  const upcoming = [...closures, ...added.filter((a) => !closures.some((c) => c.date === a.date))]
    .filter((c) => c.date >= today && !gone.includes(c.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  async function add() {
    const row = { date, reason: reason.trim() };
    setAdded((l) => [...l.filter((c) => c.date !== row.date), row]);
    setGone((g) => g.filter((d) => d !== row.date));
    setDate("");
    setReason("");
    if (!(await saver.run(() => sb.from("closures").upsert(row)))) {
      setAdded((l) => l.filter((c) => c !== row));
      setDate(row.date);
      setReason(row.reason);
    }
  }
  async function remove(day: string) {
    setGone((g) => [...g, day]);
    setAdded((l) => l.filter((c) => c.date !== day));
    if (!(await saver.run(() => sb.from("closures").delete().eq("date", day)))) setGone((g) => g.filter((d) => d !== day));
  }

  return (
    <Section title="Holidays and closed days" description="Online booking is turned off for these dates. Staff can still add bookings on the dashboard.">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!date) return saver.setError("Pick the day you're closed.");
          await add();
        }}
      >
        <div className="w-48">
          <DateField value={date} min={today} onChange={setDate} placeholder="Pick a day" aria-label="Date" />
        </div>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Diwali" maxLength={80} className="max-w-64" aria-label="Reason" />
        <Button type="submit" variant="outline">
          Add closed day
        </Button>
      </form>
      {saver.error && <p className="mt-2 text-sm text-rose-300">{saver.error}</p>}
      {upcoming.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No closed days coming up.</p>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-2xl border border-line">
          {upcoming.map((c) => (
            <li key={c.date} className="flex items-center gap-3 px-4 py-3">
              <span className="font-semibold">{fmtLongDay(c.date)}</span>
              <span className="text-muted">{c.reason}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto text-rose-300"
                onClick={() => remove(c.date)}
                aria-label={`Reopen ${fmtLongDay(c.date)}`}
              >
                <Trash2 className="size-3.5" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
