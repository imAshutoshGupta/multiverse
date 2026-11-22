import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/Skeletons";
import { Requests } from "@/components/staff/Requests";
import { bookingsOverlapping, FAR_FUTURE, type InitialBookings } from "@/lib/bookingsWindow";
import { loadCatalog } from "@/lib/catalog";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Requests" };

export default function RequestsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequestsContent />
    </Suspense>
  );
}

async function RequestsContent() {
  // Load the pending list alongside the catalogue so it's on screen at first paint.
  const [{ settings, stations, types, games }, initialPending] = await Promise.all([loadCatalog(), loadPending()]);
  return <Requests settings={settings} stations={stations} types={types} games={games} initialPending={initialPending} />;
}

/** Pending requests that haven't finished yet; the page keeps them live from there. */
async function loadPending(): Promise<InitialBookings | null> {
  const supabase = await supabaseServer(); // marks the render as request-time before reading the clock
  const from = new Date().toISOString();
  const { data, error } = await bookingsOverlapping(supabase, from, FAR_FUTURE, "pending");
  return error ? null : { from, to: FAR_FUTURE, bookings: data };
}
