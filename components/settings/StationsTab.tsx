"use client";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { WorldIcon } from "@/components/brand/Icon";
import { Button, cn, Field, Input, Select } from "@/components/ui";
import { formatINR } from "@/lib/availability";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station, StationType } from "@/lib/types";
import { reorder, Section, Toggle, useSaver } from "./shared";

export function StationsTab({ stations, types }: { stations: Station[]; types: StationType[] }) {
  const mover = useSaver();
  if (types.length === 0) {
    return (
      <Section title="Stations">
        <p className="text-muted">Add a world first (Settings, Worlds), then add its stations here.</p>
      </Section>
    );
  }
  return (
    <div className="space-y-6">
      <AddStations stations={stations} types={types} />
      {types.map((t) => {
        const list = stations.filter((s) => s.type === t.name);
        return (
          <Section
            key={t.name}
            title={t.name}
            description={`${list.length} station${list.length === 1 ? "" : "s"}. Default price ${formatINR(t.hourly_rate)} an hour.`}
            action={<WorldIcon name={t.icon} className="size-6" />}
          >
            {list.length === 0 ? (
              <p className="text-sm text-muted">No stations yet. Customers won&apos;t see this world until it has one.</p>
            ) : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_0.7fr_auto] gap-2 px-1 text-xs font-semibold text-muted md:grid">
                  <span>Name</span>
                  <span>World</span>
                  <span>Own price (₹/hr)</span>
                  <span>Max players</span>
                  <span className="w-52" />
                </div>
                {list.map((s, i) => (
                  <StationRow
                    key={s.id}
                    station={s}
                    types={types}
                    canUp={i > 0}
                    canDown={i < list.length - 1}
                    onMove={(dir) => mover.run(() => reorder("stations", "id", list, i, i + dir))}
                  />
                ))}
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
}

function AddStations({ stations, types }: { stations: Station[]; types: StationType[] }) {
  const [type, setType] = useState(types[0].name);
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState("");
  const [players, setPlayers] = useState(4);
  const saver = useSaver();
  const existing = stations.filter((s) => s.type === type);
  const base = prefix.trim() || `${type} · Station`;
  // Continue numbering after the highest existing "<base> N"
  const nums = existing.map((s) => Number(s.name.match(/(\d+)\s*$/)?.[1] ?? 0));
  const startAt = (nums.length ? Math.max(...nums) : 0) + 1;
  const names = Array.from({ length: count }, (_, i) => (count === 1 && prefix.trim() ? prefix.trim() : `${base} ${startAt + i}`));
  const maxSort = Math.max(0, ...stations.map((s) => s.sort_order));

  return (
    <Section title="Add stations" description="A station is one bookable seat, console, room or table. Add several at once.">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_0.6fr_1.4fr_0.6fr_auto] lg:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await saver.run(() =>
            supabaseBrowser()
              .from("stations")
              .insert(names.map((name, i) => ({ name, type, max_players: players, hourly_rate: null, sort_order: maxSort + (i + 1) * 10 }))),
          );
          if (ok) {
            setCount(1);
            setPrefix("");
          }
        }}
      >
        <Field label="World">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {types.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How many">
          <Input type="number" min={1} max={30} value={count} onChange={(e) => setCount(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
        </Field>
        <Field label={count === 1 ? "Name (optional)" : "Name prefix (optional)"}>
          <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={`${type} · Station`} maxLength={50} />
        </Field>
        <Field label="Max players">
          <Input type="number" min={1} max={50} value={players} onChange={(e) => setPlayers(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
        </Field>
        <Button type="submit" disabled={saver.saving}>
          Add {count > 1 ? `${count} stations` : "station"}
        </Button>
      </form>
      <p className="mt-3 text-sm text-muted">
        Will add: {names.slice(0, 4).join(", ")}
        {names.length > 4 ? ` and ${names.length - 4} more` : ""}
      </p>
      {saver.error && <p className="mt-2 text-sm text-rose-300">{saver.error}</p>}
    </Section>
  );
}

function StationRow({
  station,
  types,
  canUp,
  canDown,
  onMove,
}: {
  station: Station;
  types: StationType[];
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [s, setS] = useState(station);
  const saver = useSaver();
  const sb = supabaseBrowser();
  const world = types.find((t) => t.name === s.type);
  const dirty =
    s.name !== station.name ||
    s.type !== station.type ||
    (s.hourly_rate ?? null) !== (station.hourly_rate === null ? null : Number(station.hourly_rate)) ||
    s.max_players !== station.max_players;

  return (
    <div className={cn("rounded-2xl p-1", !station.active && "opacity-50")}>
      <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-[1.6fr_1fr_0.8fr_0.7fr_auto]">
        <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} aria-label="Station name" className="col-span-2 md:col-span-1" />
        <Select value={s.type} onChange={(e) => setS({ ...s, type: e.target.value })} aria-label="World">
          {types.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={0}
          value={s.hourly_rate ?? ""}
          placeholder={world ? `${world.hourly_rate} (world)` : ""}
          onChange={(e) => setS({ ...s, hourly_rate: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
          aria-label="Own price per hour"
        />
        <Input
          type="number"
          min={1}
          max={50}
          value={s.max_players}
          onChange={(e) => setS({ ...s, max_players: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
          aria-label="Max players"
        />
        <div className="col-span-2 flex w-52 items-center gap-1 md:col-span-1">
          {dirty ? (
            <Button
              size="sm"
              disabled={saver.saving || !s.name.trim()}
              onClick={() =>
                saver.run(() =>
                  sb
                    .from("stations")
                    .update({ name: s.name.trim(), type: s.type, hourly_rate: s.hourly_rate, max_players: s.max_players })
                    .eq("id", station.id),
                )
              }
            >
              Save
            </Button>
          ) : (
            <Toggle
              checked={station.active}
              onChange={(v) => saver.run(() => sb.from("stations").update({ active: v }).eq("id", station.id))}
              label={station.active ? "On" : "Off"}
            />
          )}
          <span className="ml-auto" />
          <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={!canUp} aria-label="Move up">
            <ArrowUp className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={!canDown} aria-label="Move down">
            <ArrowDown className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-rose-300"
            onClick={() => saver.run(() => sb.from("stations").delete().eq("id", station.id))}
            aria-label={`Delete ${station.name}`}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
      {saver.error && <p className="px-1 pt-1 text-sm text-rose-300">{saver.error}</p>}
    </div>
  );
}
