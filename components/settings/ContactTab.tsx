"use client";
import { useState } from "react";
import { Field, Input } from "@/components/ui";
import { displayPhone, normalizePhone } from "@/lib/phone";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { isDirty, SaveBar, Section, useSaver } from "./shared";

export function ContactTab({ settings }: { settings: Settings }) {
  const initial = {
    whatsapp: displayPhone(settings.whatsapp_number),
    phone: settings.phone ? displayPhone(settings.phone) : "",
    instagram: settings.instagram,
    address: settings.address,
    maps_url: settings.maps_url ?? "",
  };
  const [c, setC] = useState(initial);
  const saver = useSaver();
  const set = (k: keyof typeof c, v: string) => setC((p) => ({ ...p, [k]: v }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    const wa = normalizePhone(c.whatsapp);
    if (!wa) return saver.setError("The WhatsApp number doesn't look right.");
    const phone = c.phone.trim() ? normalizePhone(c.phone) : null;
    if (c.phone.trim() && !phone) return saver.setError("The phone number doesn't look right.");
    const ig = c.instagram.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    if (!/^[A-Za-z0-9._]{0,30}$/.test(ig)) return saver.setError("Enter just the Instagram username, like multiverse_cafe.");
    const maps = c.maps_url.trim();
    if (maps && !maps.startsWith("https://")) return saver.setError("The Maps link should start with https://");
    saver.run(() =>
      supabaseBrowser()
        .from("settings")
        .update({ whatsapp_number: wa, phone, instagram: ig, address: c.address.trim(), maps_url: maps || null })
        .eq("id", 1),
    );
  }

  return (
    <form onSubmit={save}>
      <Section title="Contact and location" description="Shown on the booking page and used for every WhatsApp button.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="WhatsApp number" hint="Customers message this number. Staff confirmations are sent from your own WhatsApp.">
            <Input value={c.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Phone for calls (optional)" hint="Leave empty to use the WhatsApp number.">
            <Input value={c.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
          </Field>
          <Field label="Instagram username">
            <Input value={c.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="multiverse_cafe" />
          </Field>
          <Field label="Address">
            <Input value={c.address} onChange={(e) => set("address", e.target.value)} maxLength={120} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Google Maps link" hint="In Google Maps, tap Share and copy the link.">
              <Input value={c.maps_url} onChange={(e) => set("maps_url", e.target.value)} placeholder="https://maps.app.goo.gl/…" />
            </Field>
          </div>
        </div>
        <SaveBar saver={saver} dirty={isDirty(initial, c)} />
      </Section>
    </form>
  );
}
