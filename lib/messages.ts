import { fmtDay, fmtTime, istDate } from "./time";
import type { Booking, Settings } from "./types";

export const PLACEHOLDERS = [
  { key: "name", label: "Customer name" },
  { key: "cafe", label: "Cafe name" },
  { key: "station", label: "Station" },
  { key: "world", label: "World (PS5, VR…)" },
  { key: "game", label: "Game" },
  { key: "date", label: "Day" },
  { key: "time", label: "Start–end time" },
  { key: "players", label: "Players" },
  { key: "address", label: "Address" },
] as const;

export const DEFAULT_TEMPLATES = {
  confirm:
    "Hi {name}! Your booking at {cafe} is confirmed ✅\n\n🎮 {station}\n🗓️ {date}, {time}\n👥 {players}\n\n📍 {address}\nSee you there!",
  decline:
    "Hi {name}, sorry! We couldn't confirm your {world} slot on {date}, {time}. Reply here and we'll find you another time. – {cafe}",
  reminder: "Hi {name}, a reminder of your {station} slot today, {time} at {cafe}. See you soon! 🎮",
};

export type TemplateKind = keyof typeof DEFAULT_TEMPLATES;

export function renderTemplate(
  template: string,
  s: Pick<Settings, "cafe_name" | "address">,
  b: Pick<Booking, "customer_name" | "starts_at" | "ends_at" | "party_size">,
  station: { name: string; type: string },
  game?: string | null,
): string {
  const values: Record<string, string> = {
    name: b.customer_name,
    cafe: s.cafe_name,
    station: station.name,
    world: station.type,
    date: fmtDay(istDate(new Date(b.starts_at))),
    time: `${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)}`,
    players: `${b.party_size} player${b.party_size > 1 ? "s" : ""}`,
    address: s.address,
    game: game ?? "",
  };
  return template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

function templateFor(s: Settings, kind: TemplateKind) {
  const custom = kind === "confirm" ? s.msg_confirm : kind === "decline" ? s.msg_decline : s.msg_reminder;
  return custom?.trim() ? custom : DEFAULT_TEMPLATES[kind];
}

export function message(
  kind: TemplateKind,
  s: Settings,
  b: Booking,
  station: { name: string; type: string },
  game?: string | null,
) {
  return renderTemplate(templateFor(s, kind), s, b, station, game);
}
