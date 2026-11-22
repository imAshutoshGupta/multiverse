import "server-only";

// RAWG.io video game database. Free with attribution: https://rawg.io/apidocs
const KEY = process.env.RAWG_API_KEY ?? "";
export const rawgEnabled = Boolean(KEY);

export interface RawgGame {
  id: number;
  name: string;
  released: string | null;
  image: string | null;
  platforms: string[]; // platform slugs, e.g. "playstation5", "pc"
}

/**
 * 1280px-wide image from RAWG's CDN (their full-size images are several MB).
 * RAWG art is landscape but posters are 3:4, so only ~45% of the width is shown;
 * 640px left ~300px visible, which blurs on phone screens. 1280px is ~170 KB.
 */
function resized(url: string | null): string | null {
  if (!url) return null;
  return url.replace("media.rawg.io/media/", "media.rawg.io/media/resize/1280/-/");
}

export async function rawgSearch(query: string): Promise<RawgGame[]> {
  if (!rawgEnabled) throw new Error("Add RAWG_API_KEY to the server environment to search for posters.");
  const q = query.trim().slice(0, 80);
  if (!q) return [];
  const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(KEY)}&search=${encodeURIComponent(q)}&page_size=8&search_precise=true`;
  const res = await fetch(url, { headers: { "User-Agent": "cafe-booking-app" }, cache: "no-store" });
  if (!res.ok) throw new Error(`RAWG search failed (${res.status}). Check the API key.`);
  const body = (await res.json()) as {
    results?: {
      id: number;
      name: string;
      released: string | null;
      background_image: string | null;
      platforms?: { platform: { slug: string } }[] | null;
    }[];
  };
  return (body.results ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    released: g.released,
    image: resized(g.background_image),
    platforms: (g.platforms ?? []).map((p) => p.platform.slug),
  }));
}

/** Guess which of the cafe's worlds a game runs on from RAWG platform slugs. */
export function suggestWorlds(platforms: string[], worlds: string[]): string[] {
  const has = (re: RegExp) => platforms.some((p) => re.test(p));
  return worlds.filter((w) => {
    const n = w.toLowerCase();
    if (/ps5|ps 5|playstation|ps4|\bps\b/.test(n)) return has(/^playstation(5|4)$/);
    if (/xbox/.test(n)) return has(/^xbox/);
    if (/\bpc\b|computer|desktop|steam/.test(n)) return has(/^pc$/);
    if (/switch|nintendo/.test(n)) return has(/^nintendo-switch/);
    return false;
  });
}
