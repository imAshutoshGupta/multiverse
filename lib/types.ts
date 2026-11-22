export type BookingStatus =
  | "pending"
  | "confirmed"
  | "arrived"
  | "completed"
  | "cancelled"
  | "no_show";

export type BookingSource = "staff" | "online";

export interface DayHours {
  open?: string; // "HH:MM"
  close?: string;
  closed?: boolean;
}

/** Keyed by weekday, "0" = Sunday. Missing days use open_time / close_time. */
export type WeeklyHours = Partial<Record<string, DayHours>>;

export interface Settings {
  id: number;
  cafe_name: string;
  tagline: string;
  about: string;
  whatsapp_number: string;
  phone: string | null;
  instagram: string;
  address: string;
  maps_url: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  color_primary: string;
  color_accent: string;
  color_background: string;
  font_display: string;
  font_body: string;
  announcement: string | null;
  house_rules: string;
  open_time: string; // "HH:MM:SS"
  close_time: string;
  weekly_hours: WeeklyHours | null;
  slot_minutes: number;
  min_booking_minutes: number;
  max_booking_minutes: number;
  advance_days: number;
  lead_minutes: number;
  max_pending_per_phone: number;
  online_booking_enabled: boolean;
  msg_confirm: string | null;
  msg_decline: string | null;
  msg_reminder: string | null;
}

export type Pricing = "per_station" | "per_player";

/** A "world": a kind of station (PS5, VR, Projector…) with its own look and price. */
export interface StationType {
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  image_url: string | null;
  hourly_rate: number;
  pricing: Pricing;
  sort_order: number;
  active: boolean;
}

export interface Station {
  id: string;
  name: string;
  type: string;
  /** null = use the world's price */
  hourly_rate: number | null;
  max_players: number;
  active: boolean;
  sort_order: number;
}

export type GameKind = "game" | "experience";

/** Something people come to play: a video game, or a real-world experience like the RC site. */
export interface Game {
  id: string;
  name: string;
  kind: GameKind;
  blurb: string;
  cover_url: string | null;
  image_source: "upload" | "rawg" | null;
  rawg_id: number | null;
  featured: boolean;
  sort_order: number;
  active: boolean;
  /** Worlds it runs on. Empty = every world. */
  worlds: string[];
}

/** Worlds a game can be played on (all worlds if it isn't linked to any). */
export function worldsForGame<T extends { name: string }>(game: Pick<Game, "worlds">, worlds: T[]): T[] {
  return game.worlds.length ? worlds.filter((w) => game.worlds.includes(w.name)) : worlds;
}

export interface Closure {
  date: string;
  reason: string;
}

export interface Booking {
  id: string;
  station_id: string;
  customer_name: string;
  phone: string | null;
  game_id: string | null;
  starts_at: string;
  ends_at: string;
  party_size: number;
  status: BookingStatus;
  source: BookingSource;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusyInterval {
  station_id: string;
  starts_at: string;
  ends_at: string;
}

/** Statuses that occupy a station (mirrors the DB exclusion constraint). */
export const BLOCKING_STATUSES: BookingStatus[] = ["pending", "confirmed", "arrived"];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  arrived: "Playing",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "No-show",
};
