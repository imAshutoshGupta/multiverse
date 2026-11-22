import type { BusyInterval, Pricing, Station, StationType } from "./types";

export interface SlotAvailability {
  start: Date;
  freeStations: number;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** Is `stationId` free for [start, end)? `ignoreId` skips a booking being edited. */
export function stationFree(
  stationId: string,
  start: number,
  end: number,
  busy: (BusyInterval & { id?: string })[],
  ignoreId?: string,
): boolean {
  return !busy.some(
    (b) =>
      b.station_id === stationId &&
      (!ignoreId || b.id !== ignoreId) &&
      overlaps(start, end, new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()),
  );
}

/**
 * For each candidate start slot, count stations (of the given set) free for the
 * whole duration. Slots before `earliest` or running past closing are excluded.
 */
export function availableStarts(opts: {
  slots: Date[];
  closesAt: Date;
  durationMin: number;
  stations: Pick<Station, "id">[];
  busy: BusyInterval[];
  now?: Date;
  leadMinutes?: number;
}): SlotAvailability[] {
  const { slots, closesAt, durationMin, stations, busy } = opts;
  const earliest = (opts.now ?? new Date()).getTime() + (opts.leadMinutes ?? 0) * 60_000;
  const dur = durationMin * 60_000;
  const out: SlotAvailability[] = [];
  for (const s of slots) {
    const start = s.getTime();
    const end = start + dur;
    if (start < earliest || end > closesAt.getTime()) continue;
    const free = stations.filter((st) => stationFree(st.id, start, end, busy)).length;
    out.push({ start: s, freeStations: free });
  }
  return out;
}

/** Stations free right now. */
export function freeNow(stations: Pick<Station, "id">[], busy: BusyInterval[], now: Date): number {
  const t = now.getTime();
  return stations.filter((st) => stationFree(st.id, t, t + 60_000, busy)).length;
}

/** Hourly rate for a station: its own price, else its world's. */
export function stationRate(station: Pick<Station, "hourly_rate" | "type">, types: StationType[]): number {
  if (station.hourly_rate !== null && station.hourly_rate !== undefined) return Number(station.hourly_rate);
  return Number(types.find((t) => t.name === station.type)?.hourly_rate ?? 0);
}

export function stationPricing(station: Pick<Station, "type">, types: StationType[]): Pricing {
  return types.find((t) => t.name === station.type)?.pricing ?? "per_station";
}

export function estimatePrice(hourlyRate: number, minutes: number, players = 1, pricing: Pricing = "per_station"): number {
  const people = pricing === "per_player" ? Math.max(1, players) : 1;
  return Math.round((Number(hourlyRate) * minutes * people) / 60);
}

/** Price of a booking on a given station. */
export function bookingPrice(
  station: Pick<Station, "hourly_rate" | "type"> | undefined,
  types: StationType[],
  minutes: number,
  players: number,
): number {
  if (!station) return 0;
  return estimatePrice(stationRate(station, types), minutes, players, stationPricing(station, types));
}

export function formatINR(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

export function priceLabel(t: Pick<StationType, "hourly_rate" | "pricing">): string {
  return `${formatINR(t.hourly_rate)} an hour${t.pricing === "per_player" ? " per player" : ""}`;
}
