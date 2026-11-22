"use client";
import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import {
  BODY_FONTS,
  contrast,
  DEFAULT_BODY,
  DEFAULT_DISPLAY,
  DISPLAY_FONTS,
  googleFontUrl,
  isFontName,
  onColor,
  type FontOption,
} from "@/lib/brand";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { ColorField, ImageUpload, isDirty, SaveBar, Section, useSaver } from "./shared";

type Brand = Pick<
  Settings,
  | "cafe_name"
  | "tagline"
  | "about"
  | "logo_url"
  | "hero_image_url"
  | "color_primary"
  | "color_accent"
  | "color_background"
  | "font_display"
  | "font_body"
>;

export function BrandingTab({ settings }: { settings: Settings }) {
  const initial: Brand = {
    cafe_name: settings.cafe_name,
    tagline: settings.tagline,
    about: settings.about,
    logo_url: settings.logo_url,
    hero_image_url: settings.hero_image_url,
    color_primary: settings.color_primary,
    color_accent: settings.color_accent,
    color_background: settings.color_background,
    font_display: settings.font_display,
    font_body: settings.font_body,
  };
  const [b, setB] = useState(initial);
  const saver = useSaver();
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setB((p) => ({ ...p, [k]: v }));
  const dirty = isDirty(initial, b);

  const textContrast = contrast(onColor(b.color_background) === "#ffffff" ? "#f2f0ff" : "#14132b", b.color_background);
  const buttonContrast = contrast(b.color_primary, b.color_background);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!b.cafe_name.trim()) return saver.setError("Enter the cafe's name.");
    if (!isFontName(b.font_display) || !isFontName(b.font_body)) return saver.setError("Font names can only use letters, numbers and spaces.");
    saver.run(() =>
      supabaseBrowser()
        .from("settings")
        .update({ ...b, cafe_name: b.cafe_name.trim(), tagline: b.tagline.trim(), about: b.about.trim() })
        .eq("id", 1),
    );
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <Section title="Name and words" description="This is the first thing customers read on the booking page.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Cafe name">
            <Input value={b.cafe_name} onChange={(e) => set("cafe_name", e.target.value)} maxLength={60} />
          </Field>
          <Field label="Short description" hint="One or two sentences under the headline.">
            <Textarea value={b.about} onChange={(e) => set("about", e.target.value)} maxLength={400} rows={2} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Headline" hint="Each line shows on its own line in the big headline.">
              <Textarea value={b.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={200} rows={3} className="font-display text-base" />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Logo and photo">
        <div className="flex flex-wrap gap-8">
          <ImageUpload
            label="Logo"
            folder="branding"
            value={b.logo_url}
            onChange={(v) => set("logo_url", v)}
            hint="Square PNG works best. Also used as the browser tab icon."
          />
          <ImageUpload
            label="Hero photo (optional)"
            folder="branding"
            value={b.hero_image_url}
            onChange={(v) => set("hero_image_url", v)}
            className="aspect-video w-56"
            hint="A wide photo of the cafe. Without one, the page shows your worlds as planets."
          />
        </div>
      </Section>

      <Section title="Colours">
        <div className="grid gap-6 sm:grid-cols-3">
          <ColorField label="Brand colour (buttons)" value={b.color_primary} onChange={(v) => set("color_primary", v)} />
          <ColorField label="Highlight (open now, today)" value={b.color_accent} onChange={(v) => set("color_accent", v)} />
          <ColorField label="Background" value={b.color_background} onChange={(v) => set("color_background", v)} />
        </div>
        {(textContrast < 4.5 || buttonContrast < 2) && (
          <p className="mt-4 rounded-2xl border border-rift/40 bg-rift/10 px-4 py-3 text-sm">
            {textContrast < 4.5
              ? "Text may be hard to read on this background. Try a darker or lighter background."
              : "The brand colour is close to the background, so buttons may be hard to spot."}
          </p>
        )}
      </Section>

      <Section title="Fonts" description="Pick from the list or type the name of any Google Font, such as the one on your signboard.">
        <div className="grid gap-6 md:grid-cols-2">
          <FontPicker label="Headings" options={DISPLAY_FONTS} value={b.font_display} bundled={DEFAULT_DISPLAY} onChange={(v) => set("font_display", v)} />
          <FontPicker label="Body text" options={BODY_FONTS} value={b.font_body} bundled={DEFAULT_BODY} onChange={(v) => set("font_body", v)} />
        </div>
      </Section>

      <Section title="Preview">
        <Preview b={b} />
      </Section>

      <SaveBar saver={saver} dirty={dirty} />
    </form>
  );
}

function FontPicker({
  label,
  options,
  value,
  bundled,
  onChange,
}: {
  label: string;
  options: FontOption[];
  value: string;
  bundled: string;
  onChange: (v: string) => void;
}) {
  const known = options.some((o) => o.name === value);
  const [custom, setCustom] = useState(!known);
  const url = googleFontUrl(value, bundled);
  return (
    <div className="flex flex-col gap-2">
      {url && <link rel="stylesheet" href={url} precedence="default" />}
      <Field label={label}>
        <Select
          value={custom ? "__custom" : value}
          onChange={(e) => {
            if (e.target.value === "__custom") setCustom(true);
            else {
              setCustom(false);
              onChange(e.target.value);
            }
          }}
        >
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}: {o.feel}
            </option>
          ))}
          <option value="__custom">Another Google Font…</option>
        </Select>
      </Field>
      {custom && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Exact name from fonts.google.com, e.g. Montserrat"
          maxLength={40}
        />
      )}
      <p className="truncate text-2xl" style={{ fontFamily: `"${value}", var(--font-body)` }}>
        The Multiverse 1234
      </p>
    </div>
  );
}

function Preview({ b }: { b: Brand }) {
  const fg = onColor(b.color_background) === "#ffffff" ? "#f2f0ff" : "#14132b";
  const lines = b.tagline.split("\n").filter((l) => l.trim());
  return (
    <div
      className="overflow-hidden rounded-3xl border border-line p-6 sm:p-10"
      style={{ backgroundColor: b.color_background, color: fg, fontFamily: `"${b.font_body}", var(--font-body)` }}
    >
      <div className="flex items-center gap-3">
        {b.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logo_url} alt="" className="size-9 rounded-lg object-contain" />
        ) : (
          <span className="size-9 rounded-full border-4" style={{ borderColor: b.color_primary }} />
        )}
        <span className="font-semibold" style={{ fontFamily: `"${b.font_display}", var(--font-display)` }}>
          {b.cafe_name}
        </span>
        <span className="ml-auto rounded-full px-3 py-1 text-xs font-semibold" style={{ border: `1px solid ${fg}33` }}>
          <span className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: "#35e08a" }} />
          Open till 11 pm
        </span>
      </div>
      <p
        className="mt-10 max-w-[15ch] text-[clamp(1.75rem,4vw,3rem)] font-bold leading-[0.98]"
        style={{ fontFamily: `"${b.font_display}", var(--font-display)` }}
      >
        {lines.map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
      </p>
      <p className="mt-4 max-w-md opacity-70">{b.about}</p>
      <div className="mt-6 flex gap-3">
        <span className="rounded-full px-6 py-3 text-sm font-semibold" style={{ backgroundColor: b.color_primary, color: onColor(b.color_primary) }}>
          Book a slot
        </span>
        <span className="rounded-full px-5 py-3 text-sm font-semibold" style={{ backgroundColor: b.color_accent, color: onColor(b.color_accent) }}>
          Today
        </span>
      </div>
    </div>
  );
}
