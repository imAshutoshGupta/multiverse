import "server-only";
import { redirect } from "next/navigation";
import { withWorlds } from "./publicCatalog";
import { isConfigured } from "./supabase/env";
import { getStaff, supabaseServer } from "./supabase/server";
import type { Closure, Settings, Station, StationType } from "./types";

/** Settings + all worlds, stations, games and closures, plus the signed-in staff profile. */
export async function loadCatalog() {
  if (!isConfigured) redirect("/book"); // shows the setup notice
  // The catalogue tables are readable by anyone, so don't wait for the staff
  // lookup (shared with the layout via cache()) before querying them.
  const supabase = await supabaseServer();
  const [{ user, profile }, settings, types, stations, games, closures, links] = await Promise.all([
    getStaff(),
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("station_types").select("*").order("sort_order").order("name"),
    supabase.from("stations").select("*").order("sort_order").order("name"),
    supabase.from("games").select("*").order("sort_order").order("name"),
    supabase.from("closures").select("date, reason").order("date"),
    supabase.from("game_worlds").select("game_id, world"),
  ]);
  if (settings.error) throw new Error(settings.error.message);
  return {
    supabase,
    user,
    isOwner: profile?.role === "owner",
    settings: settings.data as Settings,
    types: (types.data ?? []) as StationType[],
    stations: (stations.data ?? []) as Station[],
    games: withWorlds(games.data ?? [], links.data ?? []),
    closures: (closures.data ?? []) as Closure[],
  };
}
