"use server";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";

export interface RequestInput {
  date: string;
  stationType: string;
  startsAt: string; // ISO
  minutes: number;
  name: string;
  phone: string;
  partySize: number;
  gameId: string | null;
  notes: string;
  website: string; // honeypot: humans never see this field
}

export type RequestResult =
  | { ok: true; stationName: string; startsAt: string; endsAt: string }
  | { ok: false; error: string; refresh?: boolean };

const MESSAGES: Record<string, string> = {
  ONLINE_BOOKING_DISABLED: "Online booking is paused right now. Please call or WhatsApp us.",
  INVALID_NAME: "Please enter your name.",
  INVALID_PHONE: "Please enter a valid 10-digit mobile number.",
  INVALID_PARTY_SIZE: "Please choose how many players.",
  INVALID_DURATION: "Please choose how long you want to play.",
  OUTSIDE_HOURS: "That time is outside our opening hours.",
  CLOSED: "We're closed that day. Please pick another day.",
  IN_THE_PAST: "That slot has already started. Please pick a later time.",
  TOO_FAR_AHEAD: "That day is too far ahead to book online. Please pick a closer day.",
  INVALID_GAME: "Please pick a game from the list.",
  GAME_NOT_ON_WORLD: "That game isn't available there. Pick another place to play it.",
  TOO_MANY_PENDING: "You already have requests waiting. We'll confirm them shortly on WhatsApp.",
  RATE_LIMITED: "We're getting a lot of requests. Please try again in a few minutes.",
  SLOT_TAKEN: "That time just filled up. Please pick another time.",
};

// Best-effort per-IP limiter (per server instance). The database enforces the real limits.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 8;
}

export async function requestBooking(input: RequestInput): Promise<RequestResult> {
  if (input.website) {
    // Bot filled the hidden field: pretend success, store nothing.
    return { ok: true, stationName: input.stationType, startsAt: input.startsAt, endsAt: input.startsAt };
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (limited(ip)) return { ok: false, error: MESSAGES.RATE_LIMITED };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("request_booking", {
    p_date: input.date,
    p_station_type: input.stationType,
    p_starts_at: input.startsAt,
    p_minutes: input.minutes,
    p_name: input.name,
    p_phone: input.phone,
    p_party_size: input.partySize,
    p_game_id: input.gameId,
    p_notes: input.notes,
  });
  if (error) {
    const msg = MESSAGES[error.message];
    if (!msg) console.error("request_booking failed", error);
    return {
      ok: false,
      error: msg ?? "Something went wrong. Please try again or WhatsApp us.",
      refresh: error.message === "SLOT_TAKEN",
    };
  }
  const r = data as { station_name: string; starts_at: string; ends_at: string };
  return { ok: true, stationName: r.station_name, startsAt: r.starts_at, endsAt: r.ends_at };
}
