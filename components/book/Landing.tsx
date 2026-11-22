"use client";
import { AtSign, Clock, MapPin, MessageCircle, Phone, Search, X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { WorldIcon } from "@/components/brand/Icon";
import { cn } from "@/components/ui";
import { formatINR, freeNow, priceLabel } from "@/lib/availability";
import { onColor } from "@/lib/brand";
import { telLink, waLink } from "@/lib/phone";
import type { PublicCatalog } from "@/lib/publicCatalog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, fmtClock, fmtDay, fmtTime, hoursForWeekday, istDate, openState, WEEKDAYS, weekday } from "@/lib/time";
import { worldsForGame, type BusyInterval, type Game } from "@/lib/types";
import { useClock } from "@/lib/useClock";
import { BookingPanel, type World } from "./BookingPanel";

const EASE = [0.2, 0.8, 0.2, 1] as const;

type Selection = { world: string; gameId: string | null };

export function Landing({ catalog }: { catalog: PublicCatalog }) {
  const { settings, types, stations, games, closures } = catalog;
  const now = useClock();
  const [busyToday, setBusyToday] = useState<BusyInterval[] | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const heroCta = useRef<HTMLDivElement>(null);
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);

  // Mobile: show the floating "Book a slot" only once the hero's own button scrolls away
  useEffect(() => {
    const el = heroCta.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroCtaVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Bookable worlds = active worlds with at least one active station
  const worlds: World[] = useMemo(
    () =>
      types
        .map((t) => {
          const own = stations.filter((s) => s.type === t.name);
          return {
            ...t,
            stations: own.map((s) => ({ id: s.id, max_players: s.max_players })),
            maxPlayers: Math.max(0, ...own.map((s) => s.max_players)),
          };
        })
        .filter((w) => w.stations.length > 0),
    [types, stations],
  );

  // Featured first, then the owner's order
  const sortedGames = useMemo(
    () => [...games].sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort_order - b.sort_order),
    [games],
  );

  const filters = useMemo(() => {
    const out: { id: string; label: string; color?: string }[] = [{ id: "all", label: "All" }];
    for (const w of worlds) {
      if (games.some((g) => g.kind === "game" && worldsForGame(g, worlds).some((x) => x.name === w.name))) {
        out.push({ id: `world:${w.name}`, label: w.name, color: w.color });
      }
    }
    if (games.some((g) => g.kind === "experience")) out.push({ id: "experience", label: "Experiences" });
    return out;
  }, [worlds, games]);

  const shown = sortedGames.filter((g) => {
    if (query.trim() && !g.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === "experience") return g.kind === "experience";
    if (filter.startsWith("world:")) {
      const w = filter.slice(6);
      return g.kind === "game" && worldsForGame(g, worlds).some((x) => x.name === w);
    }
    return true;
  });

  // Live "free now" counts
  useEffect(() => {
    let alive = true;
    const load = () => {
      const today = istDate();
      Promise.all([today, addDays(today, -1)].map((d) => supabaseBrowser().rpc("get_availability", { p_date: d }))).then(
        (res) => {
          if (!alive) return;
          setBusyToday(res.flatMap((r) => (r.data ?? []) as BusyInterval[]));
        },
      );
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const state = now ? openState(new Date(now), settings, closures) : null;
  const lines = settings.tagline.split("\n").map((l) => l.trim()).filter(Boolean);
  const rules = settings.house_rules.split("\n").map((l) => l.trim()).filter(Boolean);
  const wa = settings.whatsapp_number;
  const call = settings.phone ?? wa;
  const canBook = settings.online_booking_enabled && worlds.length > 0;
  const activeWorld = sel ? (worlds.find((w) => w.name === sel.world) ?? null) : null;
  const activeGame = sel?.gameId ? (games.find((g) => g.id === sel.gameId) ?? null) : null;
  const posters = sortedGames.filter((g) => g.cover_url).slice(0, 6);
  const usesRawg = games.some((g) => g.image_source === "rawg");

  function openGame(g: Game) {
    const playable = worldsForGame(g, worlds);
    if (playable.length) setSel({ world: playable[0].name, gameId: g.id });
  }

  function startBooking() {
    document.getElementById("play")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-dvh flex-col overflow-x-clip pb-24 sm:pb-0">
        {settings.announcement && (
          <div className="relative z-20 bg-rift px-5 py-2.5 text-center text-sm font-semibold text-on-rift">
            {settings.announcement}
          </div>
        )}

        {/* Top bar */}
        <header className="relative z-20 flex items-center gap-3 px-5 pt-5 sm:px-10 sm:pt-7">
          <Logo src={settings.logo_url} name={settings.cafe_name} />
          <span className="font-display text-base font-semibold tracking-tight sm:text-lg">{settings.cafe_name}</span>
          <div className="ml-auto flex items-center gap-2">
            <OpenPill state={state} />
            {canBook && (
              <button
                onClick={startBooking}
                className="hidden h-10 cursor-pointer items-center rounded-full bg-portal px-5 text-sm font-semibold text-on-portal transition hover:bg-portal-strong sm:inline-flex"
              >
                Book a slot
              </button>
            )}
          </div>
        </header>

        {/* Hero */}
        <section className="relative isolate -mt-20 flex min-h-[92svh] flex-col justify-end px-5 pb-12 pt-32 sm:px-10 sm:pb-16">
          {settings.hero_image_url ? (
            <div aria-hidden className="absolute inset-0 -z-10">
              <Img src={settings.hero_image_url} className="h-full w-full object-cover opacity-45" />
              <div className="absolute inset-0 bg-linear-to-t from-void via-void/70 to-void/20" />
            </div>
          ) : posters.length >= 4 ? (
            <PosterWall games={posters} />
          ) : (
            <Planets worlds={worlds} />
          )}

          <h1 className="font-display text-[clamp(2.4rem,6.2vw,6rem)] font-bold leading-[0.98] tracking-[-0.02em] md:max-w-[62%]">
            {lines.map((line, i) => (
              <span key={i} className="block overflow-hidden pb-[0.06em]">
                <motion.span
                  className="block text-balance"
                  initial={{ y: "105%" }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.1 + i * 0.14, duration: 0.9, ease: EASE }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + lines.length * 0.14, duration: 0.6, ease: EASE }}
          >
            {settings.about && <p className="mt-6 max-w-xl text-lg text-muted sm:text-xl">{settings.about}</p>}
            <div ref={heroCta} className="mt-8 flex flex-wrap items-center gap-3">
              {canBook ? (
                <button
                  onClick={startBooking}
                  className="inline-flex h-14 cursor-pointer items-center rounded-full bg-portal px-8 text-base font-semibold text-on-portal transition hover:bg-portal-strong active:scale-[0.98]"
                >
                  Find a game
                </button>
              ) : null}
              <a
                href={waLink(wa, `Hi ${settings.cafe_name}! I'd like to book a slot.`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-14 items-center gap-2 rounded-full border border-line px-6 text-base font-semibold transition hover:border-ink/40"
              >
                <MessageCircle className="size-5" aria-hidden /> WhatsApp us
              </a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-sm text-muted">
              <MapPin className="size-4" aria-hidden /> {settings.address}
            </p>
          </motion.div>
        </section>

        {/* What do you want to play? */}
        {games.length > 0 && (
          <section id="play" className="scroll-mt-4 px-5 pb-16 pt-6 sm:px-10 sm:pb-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">What do you want to play?</h2>
              {!canBook && <p className="text-muted">Online booking is paused. Message us to book.</p>}
            </div>

            <div className="sticky top-0 z-20 -mx-5 mt-6 bg-void/90 px-5 py-3 backdrop-blur sm:-mx-10 sm:px-10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <label className="relative block lg:w-80">
                  <span className="sr-only">Search games</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search, e.g. GTA, FIFA, Tekken"
                    className="h-12 w-full rounded-full border border-line bg-panel pl-12 pr-10 text-base outline-none transition placeholder:text-muted/70 focus:border-portal focus:ring-4 focus:ring-portal/20"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted hover:text-ink"
                      aria-label="Clear search"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </label>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0" role="group" aria-label="Filter">
                  {filters.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      aria-pressed={filter === f.id}
                      className={cn(
                        "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition",
                        filter === f.id ? "border-transparent bg-ink text-void" : "border-line hover:border-ink/30",
                      )}
                    >
                      {f.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: f.color }} />}
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {shown.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-line p-8 text-center">
                <p className="text-lg">We don&apos;t have &ldquo;{query}&rdquo; listed.</p>
                <p className="mt-1 text-muted">We may still have it, or be able to set it up.</p>
                <a
                  href={waLink(wa, `Hi! Do you have ${query}?`)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#25D366] px-5 font-semibold text-[#06210f]"
                >
                  <MessageCircle className="size-4" aria-hidden /> Ask us on WhatsApp
                </a>
              </div>
            ) : (
              <motion.ul layout className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                <AnimatePresence initial={false}>
                  {shown.map((g) => (
                    <motion.li
                      key={g.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                    >
                      <GameCard
                        game={g}
                        playable={worldsForGame(g, worlds)}
                        allWorlds={types}
                        hidden={sel?.gameId === g.id}
                        canBook={canBook}
                        onOpen={() => openGame(g)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </section>
        )}

        {/* Or just book a station */}
        {worlds.length > 0 && (
          <section id="worlds" className="scroll-mt-6 px-5 py-12 sm:px-10 sm:py-16">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
              {games.length ? "Or just book a station" : "Pick your world"}
            </h2>
            <p className="mt-2 text-muted">Decide what to play when you get here.</p>
            <div className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
              {worlds.map((w) => (
                <WorldCard
                  key={w.name}
                  world={w}
                  hidden={sel?.world === w.name && !sel.gameId}
                  free={busyToday && now ? freeNow(w.stations, busyToday, new Date(now)) : null}
                  isOpen={state?.open ?? null}
                  onOpen={canBook ? () => setSel({ world: w.name, gameId: null }) : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {/* Visit */}
        <section className="grid gap-10 px-5 py-16 sm:px-10 md:grid-cols-2 md:py-20">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">Hours</h2>
            <WeekHours settings={settings} closures={closures} now={now} />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">Find us</h2>
            <p className="mt-6 text-lg">{settings.address}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {settings.maps_url && (
                <ContactLink href={settings.maps_url} icon={<MapPin className="size-4" />}>
                  Open in Maps
                </ContactLink>
              )}
              <ContactLink href={waLink(wa, "Hi!")} icon={<MessageCircle className="size-4" />}>
                WhatsApp
              </ContactLink>
              <ContactLink href={telLink(call)} icon={<Phone className="size-4" />} external={false}>
                Call us
              </ContactLink>
              {settings.instagram && (
                <ContactLink href={`https://instagram.com/${settings.instagram}`} icon={<AtSign className="size-4" />}>
                  {settings.instagram}
                </ContactLink>
              )}
            </div>
            {rules.length > 0 && (
              <>
                <h3 className="mt-12 font-display text-lg font-semibold">Good to know</h3>
                <ul className="mt-3 space-y-2 text-muted">
                  {rules.map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-rift" />
                      {r}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-6 text-sm text-muted sm:px-10">
          <span>{settings.cafe_name}</span>
          {usesRawg && (
            <span>
              Game images from{" "}
              <a href="https://rawg.io" target="_blank" rel="noreferrer" className="underline hover:text-ink">
                RAWG
              </a>
            </span>
          )}
          <a href="/staff" className="hover:text-ink">
            Staff login
          </a>
        </footer>

        {/* Mobile: booking is always one tap away */}
        <AnimatePresence>
          {canBook && !sel && !heroCtaVisible && (
            <motion.div
              initial={{ y: 90, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 90, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 sm:hidden"
            >
              <button
                onClick={startBooking}
                className="h-14 w-full cursor-pointer rounded-full bg-portal text-base font-semibold text-on-portal shadow-[0_12px_40px_-12px_var(--color-portal)]"
              >
                Find a game
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeWorld && (
            <BookingPanel
              key="panel"
              world={activeWorld}
              worlds={activeGame ? worldsForGame(activeGame, worlds) : worlds}
              game={activeGame}
              onSwitch={(name) => setSel((s) => (s ? { ...s, world: name } : s))}
              onClose={() => setSel(null)}
              settings={settings}
              games={games}
              closures={closures}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

function GameCard({
  game,
  playable,
  allWorlds,
  hidden,
  canBook,
  onOpen,
}: {
  game: Game;
  playable: World[];
  allWorlds: PublicCatalog["types"];
  hidden: boolean;
  canBook: boolean;
  onOpen: () => void;
}) {
  const linked = game.worlds.length ? allWorlds.filter((w) => game.worlds.includes(w.name)) : [];
  const accent = (playable[0] ?? linked[0])?.color ?? "#7C5CFF";
  const comingSoon = playable.length === 0;
  const cheapest = playable.length ? Math.min(...playable.map((w) => Number(w.hourly_rate))) : null;
  const icon = (playable[0] ?? linked[0])?.icon ?? "gamepad";
  const labels = (playable.length ? playable : linked).map((w) => w.name);

  return (
    <div className="relative aspect-[3/4]">
      {!hidden && (
        <motion.button
          layoutId={`game-${game.id}`}
          onClick={onOpen}
          disabled={comingSoon || !canBook}
          className="group absolute inset-0 flex cursor-pointer flex-col justify-end overflow-hidden text-left disabled:cursor-default"
          style={{ borderRadius: 22, backgroundColor: "var(--color-panel)" }}
          whileHover={comingSoon || !canBook ? undefined : { y: -4 }}
          whileTap={comingSoon || !canBook ? undefined : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {game.cover_url ? (
            <Img
              src={game.cover_url}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105",
                comingSoon && "grayscale",
              )}
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{ background: `radial-gradient(120% 80% at 80% 0%, ${accent}, color-mix(in oklab, ${accent} 20%, var(--color-void)) 70%)` }}
            >
              <WorldIcon
                name={game.kind === "experience" ? icon : "gamepad"}
                className="absolute right-[-12%] top-[6%] size-[70%] opacity-25"
                strokeWidth={1}
              />
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/30 to-transparent" />

          <div className="relative flex flex-col gap-1.5 p-3.5 text-white sm:p-4">
            {game.featured && !comingSoon && (
              <span className="mb-1 self-start rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: accent, color: onColor(accent) }}>
                {game.kind === "experience" ? "Only here" : "Popular"}
              </span>
            )}
            {comingSoon && (
              <span className="mb-1 self-start rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-black">Coming soon</span>
            )}
            <p className="font-display text-base font-bold leading-tight sm:text-lg">{game.name}</p>
            {game.blurb && <p className="line-clamp-2 text-xs text-white/75 sm:text-sm">{game.blurb}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-white/85">
              {labels.slice(0, 3).map((l) => (
                <span key={l} className="rounded-full bg-white/15 px-2 py-0.5 backdrop-blur">
                  {l}
                </span>
              ))}
              {cheapest !== null && <span className="ml-auto text-white/70">from {formatINR(cheapest)}/hr</span>}
            </div>
          </div>
        </motion.button>
      )}
    </div>
  );
}

function WorldCard({
  world,
  hidden,
  free,
  isOpen,
  onOpen,
}: {
  world: World;
  hidden: boolean;
  free: number | null;
  isOpen: boolean | null;
  onOpen?: () => void;
}) {
  const fg = onColor(world.color);
  const total = world.stations.length;
  const status =
    isOpen !== true
      ? null
      : free === null
        ? null
        : free === 0
          ? "All in use"
          : total === 1
            ? "Free now"
            : `${free} of ${total} free`;
  return (
    <div className="relative h-44 w-[72%] shrink-0 snap-start sm:w-auto">
      {!hidden && (
        <motion.button
          layoutId={`world-${world.name}`}
          onClick={onOpen}
          disabled={!onOpen}
          style={{ backgroundColor: world.color, color: fg, borderRadius: 22 }}
          className="group absolute inset-0 flex cursor-pointer flex-col justify-between overflow-hidden p-5 text-left disabled:cursor-default"
          whileHover={onOpen ? { y: -3 } : undefined}
          whileTap={onOpen ? { scale: 0.985 } : undefined}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {world.image_url && (
            <Img src={world.image_url} className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity" />
          )}
          <div className="relative flex items-start justify-between gap-3">
            <WorldIcon name={world.icon} className="size-8" strokeWidth={1.5} />
            {status && (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${fg}1f` }}>
                {free !== null && free > 0 && (
                  <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full" style={{ backgroundColor: fg }} />
                )}
                {status}
              </span>
            )}
          </div>
          <div className="relative">
            <h3 className="font-display text-2xl font-bold leading-none tracking-tight">{world.name}</h3>
            <p className="mt-2 text-sm opacity-80">
              {priceLabel(world)}, up to {world.maxPlayers} player{world.maxPlayers > 1 ? "s" : ""}
            </p>
          </div>
        </motion.button>
      )}
    </div>
  );
}

/** Tilted wall of the cafe's game posters (shown when there's no hero photo). */
function PosterWall({ games }: { games: Game[] }) {
  const cols = [games.filter((_, i) => i % 3 === 0), games.filter((_, i) => i % 3 === 1), games.filter((_, i) => i % 3 === 2)];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46%] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)] md:inset-x-auto md:right-0 md:h-full md:w-[46%] md:[mask-image:linear-gradient(to_left,black_60%,transparent)]"
    >
      <div className="absolute -right-[8%] -top-[12%] flex w-[120%] rotate-[-10deg] gap-3 md:gap-4">
        {cols.map((col, c) => (
          <motion.div
            key={c}
            className="flex flex-1 flex-col gap-3 md:gap-4"
            style={{ marginTop: c === 1 ? "18%" : c === 2 ? "6%" : 0 }}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + c * 0.12, duration: 1, ease: EASE }}
          >
            {[...col, ...col].slice(0, 3).map((g, i) => (
              <Img key={`${g.id}-${i}`} src={g.cover_url!} className="aspect-[3/4] w-full rounded-2xl object-cover shadow-2xl" />
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** Decorative cluster of "worlds" in their own colours, kept clear of the headline. */
function Planets({ worlds }: { worlds: World[] }) {
  const list = worlds.slice(0, 5);
  const layout = [
    { size: 56, top: 8, left: 36 },
    { size: 24, top: 46, left: 8 },
    { size: 15, top: 4, left: 14 },
    { size: 10, top: 66, left: 74 },
    { size: 7, top: 30, left: 2 },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-16 -z-10 h-[38%] md:inset-x-auto md:right-0 md:top-0 md:h-full md:w-[40%]"
    >
      <svg className="absolute inset-0 h-full w-full text-line" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
        <ellipse cx="58" cy="40" rx="50" ry="22" stroke="currentColor" strokeWidth="0.25" vectorEffect="non-scaling-stroke" transform="rotate(-14 58 40)" />
      </svg>
      <div className="absolute inset-0 mx-auto aspect-square max-h-full max-w-full md:top-1/2 md:-translate-y-1/2">
        {list.map((w, i) => {
          const l = layout[i];
          return (
            <motion.div
              key={w.name}
              className="absolute aspect-square rounded-full"
              style={{
                width: `${l.size}%`,
                top: `${l.top}%`,
                left: `${l.left}%`,
                background: `radial-gradient(circle at 32% 30%, color-mix(in oklab, ${w.color} 55%, white) 0%, ${w.color} 38%, color-mix(in oklab, ${w.color} 45%, black) 100%)`,
                boxShadow: `0 0 90px -16px ${w.color}`,
              }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 1.1, ease: EASE }}
            />
          );
        })}
      </div>
    </div>
  );
}

function OpenPill({ state }: { state: ReturnType<typeof openState> | null }) {
  if (!state) return <span className="h-9 w-32 rounded-full bg-panel" aria-hidden />;
  const label = state.open
    ? `Open till ${fmtTime(state.until)}`
    : state.opensAt
      ? `Opens ${istDate(state.opensAt) === istDate() ? "" : fmtDay(istDate(state.opensAt)) + ", "}${fmtTime(state.opensAt)}`
      : "Closed";
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-void/60 px-3.5 text-xs font-semibold backdrop-blur sm:text-sm">
      <span className={cn("size-2 rounded-full", state.open ? "bg-[#35e08a]" : "bg-muted")} aria-hidden />
      {label}
    </span>
  );
}

function WeekHours({
  settings,
  closures,
  now,
}: {
  settings: PublicCatalog["settings"];
  closures: PublicCatalog["closures"];
  now: number | null;
}) {
  const today = now ? istDate(new Date(now)) : null;
  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday first
  const upcoming = today ? closures.filter((c) => c.date >= today && c.date <= addDays(today, 30)) : [];
  return (
    <>
      <dl className="mt-6 divide-y divide-line border-y border-line">
        {order.map((d) => {
          const h = hoursForWeekday(d, settings);
          const isToday = today !== null && weekday(today) === d;
          return (
            <div key={d} className={cn("flex justify-between gap-4 py-3", isToday && "font-semibold text-rift")}>
              <dt>{WEEKDAYS[d]}</dt>
              <dd className={cn(!isToday && "text-muted")}>
                {h.closed ? "Closed" : `${fmtClock(h.open)} – ${fmtClock(h.close)}`}
              </dd>
            </div>
          );
        })}
      </dl>
      {upcoming.length > 0 && (
        <div className="mt-6 space-y-1 text-sm">
          {upcoming.map((c) => (
            <p key={c.date} className="flex items-center gap-2 text-muted">
              <Clock className="size-4" aria-hidden /> Closed {fmtDay(c.date)}
              {c.reason ? ` for ${c.reason}` : ""}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function ContactLink({
  href,
  icon,
  children,
  external = true,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold transition hover:border-ink/40"
    >
      {icon}
      {children}
    </a>
  );
}

export function Logo({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return <Img src={src} alt={name} className="rounded-xl object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <circle cx="32" cy="32" r="22" fill="none" stroke="var(--color-portal)" strokeWidth="4" />
      <ellipse cx="32" cy="32" rx="28" ry="9" fill="none" stroke="var(--color-rift)" strokeWidth="3" transform="rotate(-24 32 32)" />
      <circle cx="32" cy="32" r="7" fill="var(--color-ink)" />
    </svg>
  );
}

/** Plain <img> for owner-uploaded media (any size/host, no build-time config). */
export function Img({ alt = "", ...props }: React.ComponentProps<"img">) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} loading="lazy" decoding="async" {...props} />;
}
