"use client";
import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { fmtDuration } from "@/lib/time";
import type { Settings } from "@/lib/types";
import { isDirty, SaveBar, Section, Toggle, useSaver } from "./shared";

const DURATIONS = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720];

export function RulesTab({ settings }: { settings: Settings }) {
  const initial = {
    online_booking_enabled: settings.online_booking_enabled,
    slot_minutes: settings.slot_minutes,
    min_booking_minutes: settings.min_booking_minutes,
    max_booking_minutes: settings.max_booking_minutes,
    advance_days: settings.advance_days,
    lead_minutes: settings.lead_minutes,
    max_pending_per_phone: settings.max_pending_per_phone,
    announcement: settings.announcement ?? "",
    house_rules: settings.house_rules,
  };
  const [r, setR] = useState(initial);
  const saver = useSaver();
  const set = <K extends keyof typeof r>(k: K, v: (typeof r)[K]) => setR((p) => ({ ...p, [k]: v }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (r.min_booking_minutes > r.max_booking_minutes) return saver.setError("The shortest booking can't be longer than the longest.");
    saver.run(() =>
      supabaseBrowser()
        .from("settings")
        .update({ ...r, announcement: r.announcement.trim() || null, house_rules: r.house_rules.trim() })
        .eq("id", 1),
    );
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Section title="Online booking">
        <Toggle
          checked={r.online_booking_enabled}
          onChange={(v) => set("online_booking_enabled", v)}
          label="Accept booking requests on the website"
          description="Turn off during busy events. The page will ask people to WhatsApp you instead."
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Time slots every">
            <Select value={r.slot_minutes} onChange={(e) => set("slot_minutes", Number(e.target.value))}>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
            </Select>
          </Field>
          <Field label="Shortest booking">
            <Select value={r.min_booking_minutes} onChange={(e) => set("min_booking_minutes", Number(e.target.value))}>
              {DURATIONS.filter((d) => d <= 240).map((d) => (
                <option key={d} value={d}>
                  {fmtDuration(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Longest booking">
            <Select value={r.max_booking_minutes} onChange={(e) => set("max_booking_minutes", Number(e.target.value))}>
              {DURATIONS.filter((d) => d >= 60).map((d) => (
                <option key={d} value={d}>
                  {fmtDuration(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Book up to (days ahead)">
            <Input type="number" min={1} max={90} value={r.advance_days} onChange={(e) => set("advance_days", Math.min(90, Math.max(1, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Minimum notice">
            <Select value={r.lead_minutes} onChange={(e) => set("lead_minutes", Number(e.target.value))}>
              <option value={0}>None, book right up to the start</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={240}>4 hours</option>
              <option value={1440}>1 day</option>
            </Select>
          </Field>
          <Field label="Open requests per phone" hint="Stops one person holding lots of slots.">
            <Input
              type="number"
              min={1}
              max={20}
              value={r.max_pending_per_phone}
              onChange={(e) => set("max_pending_per_phone", Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
            />
          </Field>
        </div>
      </Section>

      <Section title="Announcement" description="A bar at the very top of the booking page. Leave empty to hide it.">
        <Input
          value={r.announcement}
          onChange={(e) => set("announcement", e.target.value)}
          maxLength={200}
          placeholder="FIFA tournament this Saturday, 6 pm. Book your team slot now!"
        />
      </Section>

      <Section title="Good to know" description="House rules shown near the bottom of the booking page. One per line.">
        <Textarea value={r.house_rules} onChange={(e) => set("house_rules", e.target.value)} rows={5} maxLength={2000} />
      </Section>

      <SaveBar saver={saver} dirty={isDirty(initial, r)} />
    </form>
  );
}
