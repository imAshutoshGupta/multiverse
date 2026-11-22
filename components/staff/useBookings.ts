"use client";
import { useEffect, useRef, useState } from "react";
import { bookingsOverlapping, type InitialBookings } from "@/lib/bookingsWindow";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Booking, BookingStatus } from "@/lib/types";

interface Loaded {
  key: string;
  bookings: Booking[] | null;
  error: string | null;
}

/**
 * Bookings overlapping [from, to), kept live via Supabase Realtime.
 * `initial` (loaded on the server) is shown straight away when it's for the same window.
 *
 * Results are tagged with the window they were loaded for. When the window changes
 * (e.g. the board moves to the next day) the hook returns `null` until that window's
 * bookings arrive, so the previous day's bookings are never shown on the new day.
 */
export function useLiveBookings(
  from: string,
  to: string,
  opts: { status?: BookingStatus; initial?: InitialBookings | null } = {},
) {
  const { status, initial } = opts;
  const key = `${from}|${to}|${status ?? ""}`;
  const seeded = initial && initial.from === from && initial.to === to ? initial.bookings : null;
  const [loaded, setLoaded] = useState<Loaded | null>(() => (seeded ? { key, bookings: seeded, error: null } : null));
  const skipFirstLoad = useRef(seeded !== null);

  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      bookingsOverlapping(sb, from, to, status).then(({ data, error }) => {
        if (!alive) return;
        setLoaded((prev) => ({
          key,
          // On a failed refresh keep what this window already showed, never another window's rows.
          bookings: error ? (prev?.key === key ? prev.bookings : null) : data,
          error: error ? error.message : null,
        }));
      });
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(load, 150);
    };
    // Server data is already on screen: refetch once the live channel is up instead,
    // to catch anything that changed between the server render and subscribing.
    const seededNow = skipFirstLoad.current;
    skipFirstLoad.current = false;
    if (!seededNow) load();
    let caughtUp = !seededNow;
    const ch = sb
      .channel(`bookings-${from}-${to}-${status ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, debounced)
      .subscribe((state) => {
        if (state === "SUBSCRIBED" && !caughtUp) {
          caughtUp = true;
          load();
        }
      });
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      sb.removeChannel(ch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [from, to, status, key]);

  // Coming back to the server-rendered window: show its data at once while the refetch runs.
  const current = loaded?.key === key ? loaded : seeded ? { key, bookings: seeded, error: null } : null;
  return { bookings: current?.bookings ?? null, error: current?.error ?? null };
}

export function bookingErrorMessage(e: { code?: string; message: string }): string {
  if (e.code === "23P01") return "That station is already booked for part of this time.";
  if (e.code === "23514") return "Please check the details (name, phone, time).";
  if (e.code === "42501") return "You don't have permission to do that.";
  if (e.code === "PGRST204" || e.code === "42P01" || e.code === "PGRST205")
    return "Payments need a database update: run supabase/migrations/0006_payments.sql in the Supabase SQL Editor.";
  return e.message;
}
