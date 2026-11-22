"use client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { WORLD_ICONS, WorldIcon } from "@/components/brand/Icon";
import { Button, cn, Field, Input, Select, Textarea } from "@/components/ui";
import { priceLabel } from "@/lib/availability";
import { onColor } from "@/lib/brand";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station, StationType } from "@/lib/types";
import { ColorField, ImageUpload, isDirty, reorder, SaveBar, Section, Toggle, usePending, usePendingOrder, useSaver } from "./shared";

const COLORS = ["#3D7BFF", "#21C46B", "#FF4F9A", "#FF8A3D", "#16C7D9", "#B36BFF", "#FFC23D", "#E5484D"];

export function WorldsTab({ types, stations }: { types: StationType[]; stations: Station[] }) {
  const [name, setName] = useState("");
  const saver = useSaver();
  const sb = supabaseBrowser();
  const [list, move] = usePendingOrder(types, (t) => t.name, (items, from, to) => saver.run(() => reorder("station_types", "name", items, from, to)));

  return (
    <div className="space-y-6">
      <Section
        title="Worlds"
        description="Each kind of thing customers can book, like PS5, PC, VR, a racing sim or a party room. Customers pick a world, then get the first free station in it."
      >
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            const ok = await saver.run(() =>
              sb.from("station_types").insert({
                name: n,
                color: COLORS[types.length % COLORS.length],
                sort_order: (types.length + 1) * 10,
                hourly_rate: 100,
              }),
            );
            if (ok) setName("");
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New world, e.g. Racing Sim" maxLength={40} className="max-w-72" />
          <Button type="submit" disabled={saver.saving || !name.trim()}>
            Add world
          </Button>
        </form>
        {saver.error && <p className="mt-2 text-sm text-rose-300">{saver.error}</p>}
      </Section>

      {list.map((t, i) => (
        <WorldEditor
          key={t.name}
          world={t}
          stationCount={stations.filter((s) => s.type === t.name).length}
          canUp={i > 0}
          canDown={i < list.length - 1}
          onMove={(dir) => move(i, i + dir)}
        />
      ))}
    </div>
  );
}

function WorldEditor({
  world,
  stationCount,
  canUp,
  canDown,
  onMove,
}: {
  world: StationType;
  stationCount: number;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [w, setW] = useState(world);
  const saver = useSaver();
  const sb = supabaseBrowser();
  const [view, apply] = usePending({ active: world.active });
  const [removing, setRemoving] = useState(false);
  async function remove() {
    setRemoving(true); // gone straight away; comes back with the error if the delete fails
    if (!(await saver.run(() => sb.from("station_types").delete().eq("name", world.name)))) setRemoving(false);
  }
  const set = <K extends keyof StationType>(k: K, v: StationType[K]) => setW((p) => ({ ...p, [k]: v }));
  const fg = onColor(w.color);
  if (removing) return null;

  return (
    <section className={cn("overflow-hidden rounded-3xl border border-line bg-panel transition-opacity", !view.active && "opacity-70")}>
      <div className="grid md:grid-cols-[18rem_1fr]">
        {/* Live card preview */}
        <div className="relative flex min-h-64 flex-col justify-between overflow-hidden p-5" style={{ backgroundColor: w.color, color: fg }}>
          {w.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={w.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity" />
          )}
          <WorldIcon name={w.icon} className="relative size-10" strokeWidth={1.5} />
          <div className="relative">
            <p className="font-display text-3xl font-bold leading-none">{w.name || "Untitled"}</p>
            {w.tagline && <p className="mt-2 text-sm font-medium opacity-85">{w.tagline}</p>}
            <p className="mt-3 text-xs opacity-75">
              {priceLabel(w)}
              <br />
              {stationCount} station{stationCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <form
          className="p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!w.name.trim()) return saver.setError("Give this world a name.");
            saver.run(() =>
              sb
                .from("station_types")
                .update({
                  name: w.name.trim(),
                  tagline: w.tagline.trim(),
                  description: w.description.trim(),
                  icon: w.icon,
                  color: w.color,
                  image_url: w.image_url,
                  hourly_rate: w.hourly_rate,
                  pricing: w.pricing,
                })
                .eq("name", world.name),
            );
          }}
        >
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Toggle
              checked={view.active}
              onChange={(v) => apply({ active: v }, () => saver.run(() => sb.from("station_types").update({ active: v }).eq("name", world.name)))}
              label={view.active ? "Shown to customers" : "Hidden from customers"}
            />
            <div className="ml-auto flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => onMove(-1)} disabled={!canUp} aria-label="Move up">
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onMove(1)} disabled={!canDown} aria-label="Move down">
                <ArrowDown className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-rose-300"
                disabled={stationCount > 0}
                title={stationCount > 0 ? "Move or delete its stations first" : undefined}
                onClick={remove}
              >
                <Trash2 className="size-4" /> Delete
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" hint={w.name !== world.name ? "Renaming updates its stations and games too." : undefined}>
              <Input value={w.name} onChange={(e) => set("name", e.target.value)} maxLength={40} />
            </Field>
            <Field label="Tagline">
              <Input value={w.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={80} placeholder="Couch co-op and FIFA nights" />
            </Field>
            <Field label="Price per hour (₹)">
              <Input type="number" min={0} value={w.hourly_rate} onChange={(e) => set("hourly_rate", Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label="Charged">
              <Select value={w.pricing} onChange={(e) => set("pricing", e.target.value as StationType["pricing"])}>
                <option value="per_station">Per station (the group shares the price)</option>
                <option value="per_player">Per player</option>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description">
                <Textarea value={w.description} onChange={(e) => set("description", e.target.value)} maxLength={400} rows={2} />
              </Field>
            </div>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_auto]">
            <div>
              <span className="text-xs font-semibold text-muted">Icon</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(WORLD_ICONS).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set("icon", key)}
                    title={label}
                    aria-label={label}
                    aria-pressed={w.icon === key}
                    className={cn(
                      "grid size-10 cursor-pointer place-items-center rounded-xl border transition",
                      w.icon === key ? "border-transparent" : "border-line hover:border-ink/30",
                    )}
                    style={w.icon === key ? { backgroundColor: w.color, color: fg } : undefined}
                  >
                    <WorldIcon name={key} className="size-5" />
                  </button>
                ))}
              </div>
            </div>
            <ColorField label="Colour" value={w.color} onChange={(v) => set("color", v)} />
          </div>
          <div className="mt-5">
            <ImageUpload
              label="Background photo (optional)"
              folder="worlds"
              value={w.image_url}
              onChange={(v) => set("image_url", v)}
              className="aspect-video w-48"
            />
          </div>
          {/* Position and visibility save on their own, so they don't count as unsaved edits */}
          <SaveBar saver={saver} dirty={isDirty({ ...world, sort_order: 0, active: true }, { ...w, sort_order: 0, active: true })} />
        </form>
      </div>
    </section>
  );
}
