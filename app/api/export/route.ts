import { buildRows } from "@/lib/analytics";
import { parseFilters, queryBookings } from "@/lib/bookingQuery";
import { loadCatalog } from "@/lib/catalog";
import { matchesPayFilter } from "@/lib/payments";
import { buildReport } from "@/lib/report";
import { requestToday } from "@/lib/serverTime";
import { fmtTime } from "@/lib/time";

/** Excel report (.xlsx) for the filtered bookings: Summary, Bookings, Payments, Customers, Daily. */
export async function GET(request: Request) {
  const { supabase, user, settings, stations, types, games } = await loadCatalog();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const filters = parseFilters(new URL(request.url).searchParams, await requestToday());
  const [loaded, staff] = await Promise.all([
    queryBookings(supabase, settings, filters, stations),
    supabase.from("staff_profiles").select("user_id, display_name"),
  ]);
  const rows = buildRows(loaded, { stations, games, types, settings }).filter((r) => matchesPayFilter(r.pay, filters.pay));
  const staffNames = new Map((staff.data ?? []).map((s) => [s.user_id as string, (s.display_name as string | null) || "Staff"]));
  const now = new Date();

  const file = buildReport(rows, {
    cafe: settings.cafe_name,
    filters,
    stations,
    staffNames,
    gameNames: new Map(games.map((g) => [g.id, g.name])),
    generatedAt: `${now.toISOString().slice(0, 10)} ${fmtTime(now)} IST`,
  });
  const name = `${settings.cafe_name.replace(/[^\w-]+/g, "-").toLowerCase() || "bookings"}-report-${filters.from}-to-${filters.to}.xlsx`;
  return new Response(file as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
