import "server-only";
import { createClient } from "@supabase/supabase-js";
import { cacheLife, cacheTag } from "next/cache";
import { isConfigured, SUPABASE_KEY, SUPABASE_URL } from "./supabase/env";
import type { Closure, Game, Settings, Station, StationType } from "./types";

export const CATALOG_TAG = "catalog";

export interface PublicCatalog {
  settings: Settings;
  types: StationType[];
  stations: Pick<Station, "id" | "type" | "max_players" | "active">[];
  games: Game[];
  closures: Closure[];
}

/**
 * Everything the public needs (no customer data), cached so the booking page is
 * instant. Settings saves call updateTag(CATALOG_TAG) to refresh it.
 */
export type CatalogProblem = { problem: "outdated" | "error"; message: string };

export async function getPublicCatalog(): Promise<PublicCatalog | CatalogProblem | null> {
  "use cache";
  cacheTag(CATALOG_TAG);
  if (!isConfigured) {
    cacheLife("minutes");
    return null;
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const [settings, types, stations, games, closures, links] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("station_types").select("*").eq("active", true).order("sort_order").order("name"),
    sb.from("stations").select("id, type, max_players, active").eq("active", true),
    sb.from("games").select("*").eq("active", true).order("sort_order").order("name"),
    sb.from("closures").select("date, reason").order("date"),
    sb.from("game_worlds").select("game_id, world"),
  ]);
  if (settings.error) {
    cacheLife("minutes"); // retry soon rather than caching a failure ("seconds" would make the page dynamic)
    console.error("Could not load settings:", settings.error.message);
    return { problem: "error", message: settings.error.message };
  }
  if (!("tagline" in settings.data) || types.error || links.error) {
    cacheLife("minutes");
    const message = "The database needs updating: run the newest files in supabase/migrations (0003, 0004…) in the Supabase SQL Editor.";
    console.error(message);
    return { problem: "outdated", message };
  }
  cacheLife("hours"); // owner saves call updateTag(CATALOG_TAG) for instant updates
  return {
    settings: settings.data as Settings,
    types: (types.data ?? []) as StationType[],
    stations: (stations.data ?? []) as PublicCatalog["stations"],
    games: withWorlds(games.data ?? [], links.data ?? []),
    closures: (closures.data ?? []) as Closure[],
  };
}

export function isCatalog(c: PublicCatalog | CatalogProblem | null): c is PublicCatalog {
  return Boolean(c && !("problem" in c));
}

type GameRow = Omit<Game, "worlds">;
export function withWorlds(games: GameRow[], links: { game_id: string; world: string }[]): Game[] {
  return games.map((g) => ({ ...g, worlds: links.filter((l) => l.game_id === g.id).map((l) => l.world) }));
}
