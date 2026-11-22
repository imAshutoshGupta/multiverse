"use client";
import { ArrowDown, ArrowUp, ImageIcon, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { searchGames, type GameSearchResult } from "@/app/actions/games";
import { WorldIcon } from "@/components/brand/Icon";
import { Button, cn, ErrorNote, Input, Modal, Select } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Game, GameKind, StationType } from "@/lib/types";
import { ImageUpload, reorder, Section, Toggle, useSaver } from "./shared";

type Saver = ReturnType<typeof useSaver>;

export function GamesTab({ games, types, rawgEnabled }: { games: Game[]; types: StationType[]; rawgEnabled: boolean }) {
  const saver = useSaver();
  const worldNames = types.map((t) => t.name);
  const missing = games.filter((g) => !g.cover_url && g.kind === "game");

  return (
    <div className="space-y-6">
      <AddGame games={games} worlds={worldNames} rawgEnabled={rawgEnabled} saver={saver} />

      {rawgEnabled && missing.length > 0 && <FillPosters missing={missing} worlds={worldNames} saver={saver} />}

      {games.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {games.map((g, i) => (
            <GameCard
              key={g.id}
              game={g}
              types={types}
              rawgEnabled={rawgEnabled}
              canUp={i > 0}
              canDown={i < games.length - 1}
              onMove={(dir) => saver.run(() => reorder("games", "id", games, i, i + dir))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

async function insertGame(
  row: Partial<Game> & { name: string },
  worlds: string[],
): Promise<{ error: { message: string; code?: string } | null }> {
  const sb = supabaseBrowser();
  const { data, error } = await sb.from("games").insert(row).select("id").single();
  if (error) return { error };
  if (worlds.length) {
    const links = await sb.from("game_worlds").insert(worlds.map((w) => ({ game_id: data.id, world: w })));
    if (links.error) return { error: links.error };
  }
  return { error: null };
}

function AddGame({ games, worlds, rawgEnabled, saver }: { games: Game[]; worlds: string[]; rawgEnabled: boolean; saver: Saver }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<GameKind>("game");
  const nextOrder = (Math.max(0, ...games.map((g) => g.sort_order)) || 0) + 10;
  const has = (n: string) => games.some((g) => g.name.toLowerCase() === n.toLowerCase());

  return (
    <Section
      title="Add a game or experience"
      description={
        rawgEnabled
          ? "Type a game's name and pick it from the results to add it with its poster. Its worlds are ticked from the platforms it's on."
          : "Add the games you have. Experiences are things that aren't video games, like the RC JCB and dumper."
      }
    >
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grand Theft Auto VI" maxLength={80} className="max-w-80" />
        <Select value={kind} onChange={(e) => setKind(e.target.value as GameKind)} className="w-40" aria-label="Type">
          <option value="game">Video game</option>
          <option value="experience">Experience</option>
        </Select>
        <Button
          variant={rawgEnabled && kind === "game" ? "outline" : "primary"}
          disabled={!name.trim() || saver.saving}
          onClick={async () => {
            const ok = await saver.run(() => insertGame({ name: name.trim(), kind, sort_order: nextOrder }, []));
            if (ok) setName("");
          }}
        >
          {rawgEnabled && kind === "game" ? "Add without poster" : "Add"}
        </Button>
      </div>
      {saver.error && <p className="mt-2 text-sm text-rose-300">{saver.error}</p>}
      {rawgEnabled && kind === "game" && (
        <PosterResults
          query={name}
          worlds={worlds}
          onPick={async (r) => {
            if (has(r.name)) return saver.setError(`${r.name} is already on the list.`);
            const ok = await saver.run(() =>
              insertGame(
                { name: r.name, kind: "game", cover_url: r.image, image_source: "rawg", rawg_id: r.id, sort_order: nextOrder },
                r.suggestedWorlds,
              ),
            );
            if (ok) setName("");
          }}
        />
      )}
      {!rawgEnabled && (
        <p className="mt-4 text-sm text-muted">
          Want posters found automatically? Get a free key at{" "}
          <a href="https://rawg.io/apidocs" target="_blank" rel="noreferrer" className="underline hover:text-ink">
            rawg.io/apidocs
          </a>{" "}
          and add it to the server as <code className="text-ink">RAWG_API_KEY</code>. You can always upload your own photos instead.
        </p>
      )}
    </Section>
  );
}

/** Debounced RAWG search results as a pickable grid. */
function PosterResults({ query, worlds, onPick }: { query: string; worlds: string[]; onPick: (r: GameSearchResult) => void }) {
  const [state, setState] = useState<{ q: string; results: GameSearchResult[]; error: string | null } | null>(null);
  const q = query.trim();
  const worldKey = worlds.join("|"); // stable dependency (the array is rebuilt each render)

  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      searchGames(q, worldKey ? worldKey.split("|") : []).then((r) => {
        if (!alive) return;
        setState(r.ok ? { q, results: r.results, error: null } : { q, results: [], error: r.error });
      });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, worldKey]);

  if (q.length < 2) return null;
  const loading = !state || state.q !== q;
  return (
    <div className="mt-4">
      {state?.error && <ErrorNote>{state.error}</ErrorNote>}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" /> Searching…
        </p>
      ) : state.results.length === 0 ? (
        <p className="text-sm text-muted">No matches. Check the spelling, or add it without a poster.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {state.results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onPick(r)}
                className="group w-full cursor-pointer overflow-hidden rounded-2xl border border-line bg-panel-2 text-left transition hover:border-portal"
              >
                <div className="aspect-[3/4] bg-panel">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" />
                  ) : (
                    <div className="grid h-full place-items-center text-muted">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-tight">{r.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {r.released?.slice(0, 4) ?? "TBA"}
                    {r.suggestedWorlds.length ? `, on ${r.suggestedWorlds.join(", ")}` : ""}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FillPosters({ missing, worlds, saver }: { missing: Game[]; worlds: string[]; saver: Saver }) {
  const [progress, setProgress] = useState<{ done: number; found: number } | null>(null);
  const sb = supabaseBrowser();

  async function run() {
    setProgress({ done: 0, found: 0 });
    let found = 0;
    await saver.run(async () => {
      for (let i = 0; i < missing.length; i++) {
        const g = missing[i];
        const r = await searchGames(g.name, worlds);
        const hit = r.ok ? r.results.find((x) => x.image) : undefined;
        if (hit) {
          found++;
          const { error } = await sb.from("games").update({ cover_url: hit.image, image_source: "rawg", rawg_id: hit.id }).eq("id", g.id);
          if (error) return { error };
          if (!g.worlds.length && hit.suggestedWorlds.length) {
            await sb.from("game_worlds").insert(hit.suggestedWorlds.map((w) => ({ game_id: g.id, world: w })));
          }
        }
        setProgress({ done: i + 1, found });
      }
      return { error: null };
    });
  }

  return (
    <Section
      title={`${missing.length} game${missing.length === 1 ? " has" : "s have"} no poster`}
      description="Find posters for all of them in one go. You can change any of them afterwards."
      action={
        <Button onClick={run} disabled={saver.saving}>
          <Sparkles className="size-4" />
          {saver.saving && progress ? `Finding ${progress.done}/${missing.length}…` : "Find posters"}
        </Button>
      }
    >
      <p className="text-sm text-muted">{missing.map((g) => g.name).join(", ")}</p>
      {progress && !saver.saving && (
        <p className="mt-2 text-sm text-[#35e08a]">
          Found {progress.found} of {missing.length}.
          {progress.found < missing.length ? " Upload photos for the rest." : ""}
        </p>
      )}
    </Section>
  );
}

function GameCard({
  game,
  types,
  rawgEnabled,
  canUp,
  canDown,
  onMove,
}: {
  game: Game;
  types: StationType[];
  rawgEnabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [name, setName] = useState(game.name);
  const [blurb, setBlurb] = useState(game.blurb);
  const [picking, setPicking] = useState(false);
  const saver = useSaver();
  const sb = supabaseBrowser();
  const update = (patch: Partial<Game>) => saver.run(() => sb.from("games").update(patch).eq("id", game.id));
  const textDirty = name.trim() !== game.name || blurb.trim() !== game.blurb;

  function toggleWorld(w: string) {
    const on = game.worlds.includes(w);
    saver.run(() =>
      on
        ? sb.from("game_worlds").delete().eq("game_id", game.id).eq("world", w)
        : sb.from("game_worlds").insert({ game_id: game.id, world: w }),
    );
  }

  return (
    <li className={cn("rounded-3xl border border-line bg-panel p-4 sm:p-5", !game.active && "opacity-60")}>
      <div className="flex gap-4">
        <div className="flex flex-col gap-2">
          <ImageUpload
            label="Poster"
            folder="games"
            value={game.cover_url}
            onChange={(v) => update({ cover_url: v, image_source: v ? "upload" : null, rawg_id: null })}
            className="aspect-[3/4] w-24"
          />
          {rawgEnabled && game.kind === "game" && (
            <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
              <Search className="size-3.5" /> Find poster
            </Button>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Name" className="font-semibold" />
          <Input value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={160} placeholder="One line, e.g. Fight night, one controller each." aria-label="Short description" />
          {textDirty && name.trim() && (
            <Button size="sm" onClick={() => update({ name: name.trim(), blurb: blurb.trim() })} disabled={saver.saving}>
              Save
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={game.kind} onChange={(e) => update({ kind: e.target.value as GameKind })} className="h-9 w-36 text-xs" aria-label="Type">
              <option value="game">Video game</option>
              <option value="experience">Experience</option>
            </Select>
            <Toggle checked={game.featured} onChange={(v) => update({ featured: v })} label="Popular" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">Plays on {game.worlds.length ? "" : "(none ticked = every world)"}</p>
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => {
                const on = game.worlds.includes(t.name);
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => toggleWorld(t.name)}
                    aria-pressed={on}
                    disabled={saver.saving}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
                      on ? "border-transparent" : "border-line text-muted hover:border-ink/30",
                    )}
                    style={on ? { backgroundColor: t.color, color: "#0b0b1a" } : undefined}
                  >
                    <WorldIcon name={t.icon} className="size-3.5" />
                    {t.name}
                    {!t.active && <span className="opacity-60">(off)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
        <Toggle checked={game.active} onChange={(v) => update({ active: v })} label={game.active ? "Shown" : "Hidden"} />
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" onClick={() => onMove(-1)} disabled={!canUp} aria-label="Move up">
          <ArrowUp className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onMove(1)} disabled={!canDown} aria-label="Move down">
          <ArrowDown className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-rose-300"
          onClick={() => saver.run(() => sb.from("games").delete().eq("id", game.id))}
          aria-label={`Delete ${game.name}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {saver.error && <p className="mt-2 text-sm text-rose-300">{saver.error}</p>}

      <Modal open={picking} onClose={() => setPicking(false)} title={`Poster for ${game.name}`}>
        <PickPoster
          initial={game.name}
          worlds={types.map((t) => t.name)}
          onPick={async (r) => {
            const ok = await update({ cover_url: r.image, image_source: "rawg", rawg_id: r.id });
            if (ok) setPicking(false);
          }}
        />
      </Modal>
    </li>
  );
}

function PickPoster({ initial, worlds, onPick }: { initial: string; worlds: string[]; onPick: (r: GameSearchResult) => void }) {
  const [q, setQ] = useState(initial);
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for the game" autoFocus />
      <PosterResults query={q} worlds={worlds} onPick={(r) => r.image && onPick(r)} />
    </div>
  );
}
