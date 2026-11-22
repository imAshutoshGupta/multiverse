import { bookingPrice } from "@/lib/availability";
import { parseFilters, queryBookings } from "@/lib/bookingQuery";
import { loadCatalog } from "@/lib/catalog";
import { displayPhone } from "@/lib/phone";
import { requestToday } from "@/lib/serverTime";
import { businessDateOf, fmtTime, minutesBetween } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/types";

function csvCell(v: string | number | null | undefined) {
  let s = String(v ?? "");
  // Stop Excel treating cells as formulas
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const { supabase, user, settings, stations, types, games } = await loadCatalog();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const filters = parseFilters(new URL(request.url).searchParams, await requestToday());
  const rows = await queryBookings(supabase, settings, filters);
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const gameById = new Map(games.map((g) => [g.id, g]));

  const header = ["Date", "Start", "End", "Minutes", "Station", "Type", "Customer", "Phone", "Players", "Game", "Status", "Source", "Amount (INR)", "Notes"];
  const lines = rows.map((b) => {
    const st = stationById.get(b.station_id);
    const mins = minutesBetween(b.starts_at, b.ends_at);
    return [
      businessDateOf(b.starts_at, settings),
      fmtTime(b.starts_at).replace(" ", " "),
      fmtTime(b.ends_at).replace(" ", " "),
      mins,
      st?.name,
      st?.type,
      b.customer_name,
      displayPhone(b.phone).replace(/^\+/, ""),
      b.party_size,
      b.game_id ? gameById.get(b.game_id)?.name : "",
      STATUS_LABEL[b.status],
      b.source,
      st ? bookingPrice(st, types, mins, b.party_size) : "",
      b.notes,
    ]
      .map(csvCell)
      .join(",");
  });
  // BOM so Excel opens UTF-8 (₹, names) correctly
  const body = "﻿" + [header.join(","), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="multiverse-bookings-${filters.from}-to-${filters.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
