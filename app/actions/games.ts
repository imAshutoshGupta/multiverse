"use server";
import { rawgSearch, suggestWorlds, type RawgGame } from "@/lib/rawg";
import { getStaff } from "@/lib/supabase/server";

export type GameSearchResult = RawgGame & { suggestedWorlds: string[] };

/** Owner-only poster search (keeps the RAWG key on the server). */
export async function searchGames(
  query: string,
  worlds: string[],
): Promise<{ ok: true; results: GameSearchResult[] } | { ok: false; error: string }> {
  const { profile } = await getStaff();
  if (profile?.role !== "owner") return { ok: false, error: "Only the owner can search for posters." };
  try {
    const results = await rawgSearch(query);
    return { ok: true, results: results.map((r) => ({ ...r, suggestedWorlds: suggestWorlds(r.platforms, worlds) })) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Search failed." };
  }
}
