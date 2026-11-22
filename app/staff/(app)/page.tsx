import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/Skeletons";
import { Board } from "@/components/board/Board";
import { bookingsOverlapping, type InitialBookings } from "@/lib/bookingsWindow";
import { loadCatalog } from "@/lib/catalog";
import { getPublicCatalog, isCatalog } from "@/lib/publicCatalog";
import { requestToday } from "@/lib/serverTime";
import { supabaseServer } from "@/lib/supabase/server";
import { businessWindow, parseDateParam } from "@/lib/time";
import type { Closure, Settings } from "@/lib/types";

export const metadata: Metadata = { title: "Board" };

export default function BoardPage({ searchParams }: PageProps<"/staff">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <BoardContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BoardContent({ searchParams }: Pick<PageProps<"/staff">, "searchParams">) {
  const { date } = await searchParams;
  // "Today" comes from the clock, so it's resolved at request time (never in a prefetch).
  const day = parseDateParam(date, await requestToday());
  // Opening hours come from the cached public catalogue, so the day's bookings
  // load alongside the staff catalogue rather than after it.
  const cached = await getPublicCatalog();
  const [{ settings, stations, types, games, closures, isOwner }, initialBookings] = await Promise.all([
    loadCatalog(),
    isCatalog(cached) ? loadBookings(day, cached.settings, cached.closures) : null,
  ]);
  return (
    <Board
      initialDate={day}
      initialBookings={initialBookings}
      settings={settings}
      stations={stations}
      types={types}
      games={games}
      closures={closures}
      isOwner={isOwner}
    />
  );
}

/** The day's bookings for the first paint; the board keeps them live from there. */
async function loadBookings(day: string, settings: Settings, closures: Closure[]): Promise<InitialBookings | null> {
  const { opensAt, closesAt } = businessWindow(day, settings, closures);
  const from = opensAt.toISOString();
  const to = closesAt.toISOString();
  const { data, error } = await bookingsOverlapping(await supabaseServer(), from, to);
  return error ? null : { from, to, bookings: data };
}
