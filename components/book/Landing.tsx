"use client";
import { ArrowUp, ArrowUpRight, AtSign, Clock, MapPin, MessageCircle, Phone, Search, X } from "lucide-react";
import { AnimatePresence, motion, MotionConfig, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import {
  CursorGlow,
  EASE,
  Glare,
  Magnetic,
  Reveal,
  RevealWords,
  ScrollProgress,
  scrollToEl,
  scrollToTop,
  setScrollPaused,
  SmoothScroll,
  Tilt,
  VelocityMarquee,
  Wordmark,
} from "./fx";
import { Hero } from "./Hero";

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
  const [scrolled, setScrolled] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  // Header turns into a floating pill once you scroll, and gets out of the way while scrolling down
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 24);
    if (Math.abs(y - prev) < 4) return;
    setHeaderHidden(y > prev && y > 700);
  });

  // Mobile: show the floating "Find a game" only once the hero's own button scrolls away
  useEffect(() => {
    const el = heroCta.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroCtaVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The page behind the booking panel stays put
  useEffect(() => {
    setScrollPaused(sel !== null);
    return () => setScrollPaused(false);
  }, [sel]);

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
  const posters = sortedGames.filter((g) => g.cover_url).slice(0, 8);
  const usesRawg = games.some((g) => g.image_source === "rawg");
  const freeOf = (w: World) => (busyToday && now ? freeNow(w.stations, busyToday, new Date(now)) : null);

  function openGame(g: Game) {
    const playable = worldsForGame(g, worlds);
    if (playable.length) setSel({ world: playable[0].name, gameId: g.id });
  }

  function startBooking() {
    scrollToEl(games.length ? "#play" : "#worlds");
  }

  return (
    <MotionConfig reducedMotion="user">
      <SmoothScroll />
      <ScrollProgress />
      <CursorGlow />
      <div className="relative flex min-h-dvh flex-col overflow-x-clip pb-24 sm:pb-0">
        {settings.announcement && (
          <div className="relative z-20 bg-rift px-5 py-2.5 text-center text-sm font-semibold text-on-rift">
            {settings.announcement}
          </div>
        )}

        {/* Top bar */}
        <header
          className={cn(
            "sticky top-0 z-40 px-3 pt-3 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-5",
            headerHidden && "-translate-y-[130%]",
          )}
        >
          <div
            className={cn(
              "mx-auto flex items-center gap-3 rounded-full border py-2 transition-[max-width,background-color,border-color,padding,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              scrolled
                ? "max-w-5xl border-line bg-void/90 pl-3 pr-2 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)] md:bg-void/60 md:backdrop-blur-xl"
                : "max-w-[100rem] border-transparent px-2 sm:px-5",
            )}
          >
            <motion.button
              onClick={scrollToTop}
              aria-label={`${settings.cafe_name}, back to top`}
              className="flex cursor-pointer items-center gap-3"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
            >
              <motion.span
                className="inline-flex"
                initial={{ rotate: -200, scale: 0.4 }}
                animate={{ rotate: 0, scale: 1 }}
                whileHover={{ rotate: 180 }}
                transition={{ type: "spring", stiffness: 140, damping: 14 }}
              >
                <Logo src={settings.logo_url} name={settings.cafe_name} />
              </motion.span>
              <span className="font-display text-base font-semibold tracking-tight sm:text-lg">{settings.cafe_name}</span>
            </motion.button>
            <motion.div
              className="ml-auto flex items-center gap-2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
            >
              <OpenPill state={state} />
              {canBook && (
                <button
                  onClick={startBooking}
                  className="btn-shine hidden h-10 cursor-pointer items-center rounded-full bg-portal px-5 text-sm font-semibold text-on-portal transition hover:bg-portal-strong sm:inline-flex"
                >
                  Book a slot
                </button>
              )}
            </motion.div>
          </div>
        </header>

        <Hero lines={lines} imageUrl={settings.hero_image_url} posters={posters} worlds={worlds}>
          {settings.about && <p className="mt-4 max-w-xl text-base text-muted sm:mt-6 sm:text-xl">{settings.about}</p>}
          <div ref={heroCta} className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-8 sm:gap-3">
            {canBook ? (
              <Magnetic>
                <button
                  onClick={startBooking}
                  className="btn-shine btn-shine-loop inline-flex h-12 cursor-pointer items-center rounded-full bg-portal px-6 text-[15px] font-semibold sm:h-14 sm:px-8 sm:text-base text-on-portal shadow-[0_18px_50px_-18px_var(--color-portal)] transition hover:bg-portal-strong active:scale-[0.98]"
                >
                  Find a game
                </button>
              </Magnetic>
            ) : null}
            <Magnetic>
              <a
                href={waLink(wa, `Hi ${settings.cafe_name}! I'd like to book a slot.`)}
                target="_blank"
                rel="noreferrer"
                className="pill-fill inline-flex h-12 items-center gap-2 rounded-full border border-line bg-void/70 px-5 text-[15px] font-semibold sm:h-14 sm:px-6 sm:text-base md:bg-void/40 md:backdrop-blur"
              >
                <MessageCircle className="size-4 sm:size-5" aria-hidden /> WhatsApp us
              </a>
            </Magnetic>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted sm:mt-6">
            <span className="flex items-center gap-2">
              <MapPin className="size-4" aria-hidden /> {settings.address}
            </span>
            {state?.open &&
              worlds.map((w, i) => (
                <LiveChip key={w.name} world={w} free={freeOf(w)} index={i} />
              ))}
          </div>
        </Hero>

        {games.length > 0 && <TapeBand names={sortedGames.map((g) => g.name)} />}

        {/* What do you want to play? */}
        {games.length > 0 && (
          <section id="play" className="relative z-10 scroll-mt-2 px-5 pb-20 pt-6 sm:px-10 sm:pb-28 sm:pt-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
                <RevealWords text="What do you want to play?" />
              </h2>
              {!canBook && <p className="text-muted">Online booking is paused. Message us to book.</p>}
            </div>

            <div
              className="sticky z-20 -mx-5 mt-6 bg-void/95 px-5 py-3 md:bg-void/85 md:backdrop-blur-xl transition-[top] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:-mx-10 sm:px-10"
              style={{ top: headerHidden ? 0 : 72 }}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <label className="relative block transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:w-80 lg:focus-within:w-[26rem]">
                  <span className="sr-only">Search games</span>
                  <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search, e.g. GTA, FIFA, Tekken"
                    className="h-12 w-full rounded-full border border-line bg-panel pl-12 pr-10 text-base outline-none transition placeholder:text-muted/70 focus:border-portal focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-portal)_22%,transparent),0_12px_40px_-12px_var(--color-portal)]"
                  />
                  <AnimatePresence>
                    {query && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                        onClick={() => setQuery("")}
                        className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted hover:text-ink"
                        aria-label="Clear search"
                      >
                        <X className="size-4" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </label>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0" role="group" aria-label="Filter">
                  {filters.map((f) => {
                    const active = filter === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        aria-pressed={active}
                        className={cn(
                          "relative isolate inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors duration-300",
                          active ? "border-transparent text-void" : "border-line hover:border-ink/30",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="filter-pill"
                            className="absolute inset-0 -z-10 rounded-full bg-ink"
                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                          />
                        )}
                        {f.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: f.color }} />}
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {shown.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 rounded-3xl border border-dashed border-line p-8 text-center"
              >
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
              </motion.div>
            ) : (
              <motion.ul layout className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
                <AnimatePresence initial={false}>
                  {shown.map((g, i) => (
                    <motion.li
                      key={g.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    >
                      <Reveal y={80} rotateX={32} delay={(i % 5) * 0.07} style={{ transformOrigin: "50% 100%" }}>
                        <GameCard
                          game={g}
                          playable={worldsForGame(g, worlds)}
                          allWorlds={types}
                          hidden={sel?.gameId === g.id}
                          canBook={canBook}
                          onOpen={() => openGame(g)}
                        />
                      </Reveal>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
          </section>
        )}

        {/* Or just book a station */}
        {worlds.length > 0 && (
          <section id="worlds" className="relative z-10 scroll-mt-6 px-5 py-14 sm:px-10 sm:py-20">
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
              <RevealWords text={games.length ? "Or just book a station" : "Pick your world"} />
            </h2>
            <Reveal delay={0.15} y={16}>
              <p className="mt-2 text-muted">Decide what to play when you get here.</p>
            </Reveal>
            <div className="no-scrollbar -mx-5 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 pt-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
              {worlds.map((w, i) => (
                <Reveal
                  key={w.name}
                  className="w-[80%] shrink-0 snap-start sm:w-auto"
                  y={90}
                  rotateX={24}
                  delay={i * 0.1}
                  style={{ transformOrigin: "50% 100%" }}
                >
                  <WorldCard
                    world={w}
                    hidden={sel?.world === w.name && !sel.gameId}
                    free={freeOf(w)}
                    isOpen={state?.open ?? null}
                    onOpen={canBook ? () => setSel({ world: w.name, gameId: null }) : undefined}
                  />
                </Reveal>
              ))}
            </div>
          </section>
        )}

        {/* Visit */}
        <VisitSection>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
              <RevealWords text="Hours" />
            </h2>
            <WeekHours settings={settings} closures={closures} now={now} />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
              <RevealWords text="Find us" />
            </h2>
            <Reveal delay={0.1} y={20}>
              <p className="mt-6 text-lg">{settings.address}</p>
            </Reveal>
            <motion.div
              className="mt-6 flex flex-wrap gap-2"
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "0px 0px -8% 0px" }}
              variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.15 } } }}
            >
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
            </motion.div>
            {rules.length > 0 && (
              <>
                <h3 className="mt-12 font-display text-lg font-semibold">Good to know</h3>
                <motion.ul
                  className="mt-3 space-y-2 text-muted"
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                  variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                >
                  {rules.map((r, i) => (
                    <motion.li
                      key={i}
                      className="flex gap-3"
                      variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE } } }}
                    >
                      <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-rift" />
                      {r}
                    </motion.li>
                  ))}
                </motion.ul>
              </>
            )}
          </div>
        </VisitSection>

        <footer className="relative z-10 mt-auto border-t border-line px-5 pt-14 sm:px-10 sm:pt-20">
          <Wordmark text={settings.cafe_name} />
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-sm text-muted">
            {usesRawg ? (
              <span>
                Game images from{" "}
                <a href="https://rawg.io" target="_blank" rel="noreferrer" className="underline hover:text-ink">
                  RAWG
                </a>
              </span>
            ) : (
              <span>{settings.address}</span>
            )}
            <div className="flex items-center gap-5">
              <a href="/staff" className="hover:text-ink">
                Staff login
              </a>
              <button onClick={scrollToTop} className="group inline-flex cursor-pointer items-center gap-1.5 hover:text-ink">
                Back to top
                <ArrowUp className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5" aria-hidden />
              </button>
            </div>
          </div>
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
                className="btn-shine btn-shine-loop h-14 w-full cursor-pointer rounded-full bg-portal text-base font-semibold text-on-portal shadow-[0_12px_40px_-12px_var(--color-portal)]"
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

/* ------------------------------------------------------------------ bits */

function LiveChip({ world, free, index }: { world: World; free: number | null; index: number }) {
  if (free === null) return null;
  const total = world.stations.length;
  const label = free === 0 ? "all in use" : total === 1 ? "free now" : `${free} of ${total} free`;
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 22, delay: index * 0.08 }}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-void/70 px-3 py-1.5 text-xs font-semibold text-ink md:bg-void/50 md:backdrop-blur"
    >
      <span className="relative flex size-2" aria-hidden>
        {free > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-[#35e08a] opacity-70" />}
        <span className={cn("relative size-2 rounded-full", free > 0 ? "bg-[#35e08a]" : "bg-muted")} />
      </span>
      {world.name}: {label}
    </motion.span>
  );
}

/** Two crossed tapes of game names that react to how fast you scroll. */
function TapeBand({ names }: { names: string[] }) {
  const list = names.length < 6 ? [...names, ...names, ...names] : names;
  return (
    <div aria-hidden className="relative z-10 py-8 sm:py-16">
      <div className="relative -mx-[5%] w-[110%] -rotate-[3deg] bg-portal py-3 text-on-portal shadow-[0_30px_80px_-30px_var(--color-portal)] sm:py-4">
        <VelocityMarquee speed={3}>
          {list.map((n, i) => (
            <span key={i} className="flex items-center gap-6 pr-6 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {n}
              <Sparkle className="size-5 text-rift sm:size-7" />
            </span>
          ))}
        </VelocityMarquee>
      </div>
      <div className="relative -mx-[5%] -mt-6 w-[110%] rotate-[2deg] border-y border-line bg-void/95 py-3 sm:-mt-8 sm:py-4 md:bg-void/85 md:backdrop-blur">
        <VelocityMarquee speed={-2.2}>
          {[...list].reverse().map((n, i) => (
            <span key={i} className="text-outline flex items-center gap-6 pr-6 font-display text-3xl font-bold tracking-tight sm:text-5xl">
              {n}
              <Sparkle className="size-4 text-portal sm:size-6" />
            </span>
          ))}
        </VelocityMarquee>
      </div>
    </div>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} fill="currentColor" aria-hidden>
      <path d="M12 0c.6 6.4 5.6 11.4 12 12-6.4.6-11.4 5.6-12 12-.6-6.4-5.6-11.4-12-12C6.4 11.4 11.4 6.4 12 0Z" />
    </svg>
  );
}

/** Hours and address, with the logo's orbit turning slowly behind as you scroll. */
function VisitSection({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const rotate = useTransform(scrollYProgress, [0, 1], [-40, 50]);
  const y = useTransform(scrollYProgress, [0, 1], [80, -80]);
  return (
    <section ref={ref} className="relative isolate z-10 grid gap-12 px-5 py-20 sm:px-10 md:grid-cols-2 md:py-28">
      <motion.svg
        aria-hidden
        viewBox="0 0 64 64"
        className="pointer-events-none absolute -right-40 top-40 -z-10 size-[26rem] opacity-[0.18] sm:size-[38rem] md:-right-72"
        style={{ rotate, y }}
      >
        <circle cx="32" cy="32" r="22" fill="none" stroke="var(--color-portal)" strokeWidth="0.6" />
        <ellipse cx="32" cy="32" rx="30" ry="9" fill="none" stroke="var(--color-rift)" strokeWidth="0.5" transform="rotate(-24 32 32)" />
        <circle cx="32" cy="32" r="5" fill="none" stroke="var(--color-ink)" strokeWidth="0.4" />
      </motion.svg>
      {children}
    </section>
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
  const interactive = !comingSoon && canBook;

  return (
    <Tilt className="relative aspect-[3/4]" max={11} disabled={!interactive}>
      {!hidden && (
        <motion.button
          layoutId={`game-${game.id}`}
          onClick={onOpen}
          disabled={!interactive}
          className="group absolute inset-0 flex cursor-pointer flex-col justify-end overflow-hidden text-left shadow-[0_30px_60px_-30px_rgb(0_0_0/0.9)] disabled:cursor-default"
          style={{ borderRadius: 22, backgroundColor: "var(--color-panel)" }}
          whileTap={interactive ? { scale: 0.97 } : undefined}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          {/* The picture sits deeper than the card: it slides against the tilt */}
          <div aria-hidden className="absolute -inset-[7%] transition-transform duration-500 ease-out" style={PARALLAX_DEEP}>
            {game.cover_url ? (
              <Img
                src={game.cover_url}
                className={cn(
                  "h-full w-full object-cover transition-[scale] duration-700 ease-out group-hover/tilt:scale-[1.06]",
                  comingSoon && "grayscale",
                )}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: `radial-gradient(120% 80% at 80% 0%, ${accent}, color-mix(in oklab, ${accent} 20%, var(--color-void)) 70%)` }}
              >
                <WorldIcon
                  name={game.kind === "experience" ? icon : "gamepad"}
                  className="absolute right-[-6%] top-[12%] size-[64%] opacity-25"
                  strokeWidth={1}
                />
              </div>
            )}
          </div>
          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/30 to-transparent" />
          {game.featured && interactive && <span aria-hidden className="foil opacity-20 group-hover/tilt:opacity-60" />}
          <Glare />

          <div
            className="relative z-[3] flex flex-col gap-1.5 p-3.5 text-white transition-transform duration-500 ease-out sm:p-4"
            style={PARALLAX_NEAR}
          >
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
                <span key={l} className="rounded-full bg-white/20 px-2 py-0.5 md:bg-white/15 md:backdrop-blur">
                  {l}
                </span>
              ))}
              {cheapest !== null && <span className="ml-auto text-white/70">from {formatINR(cheapest)}/hr</span>}
            </div>
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[4] rounded-[inherit] ring-1 ring-inset ring-white/10 transition duration-500 group-hover/tilt:ring-white/30"
          />
        </motion.button>
      )}
    </Tilt>
  );
}

const PARALLAX_DEEP: CSSProperties = { transform: "translate3d(calc(var(--px, 0) * -16px), calc(var(--py, 0) * -16px), 0)" };
const PARALLAX_NEAR: CSSProperties = { transform: "translate3d(calc(var(--px, 0) * 8px), calc(var(--py, 0) * 8px), 0)" };
const PARALLAX_ICON: CSSProperties = {
  transform: "translate3d(calc(var(--px, 0) * -30px), calc(var(--py, 0) * -24px), 0) rotate(-14deg)",
};

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
    <Tilt className="relative h-60 w-full sm:h-72" max={7} lift={1.02} disabled={!onOpen}>
      {!hidden && (
        <motion.button
          layoutId={`world-${world.name}`}
          onClick={onOpen}
          disabled={!onOpen}
          style={{ backgroundColor: world.color, color: fg, borderRadius: 28 }}
          className="group absolute inset-0 flex cursor-pointer flex-col justify-between overflow-hidden p-6 text-left shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)] disabled:cursor-default sm:p-7"
          whileTap={onOpen ? { scale: 0.98 } : undefined}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        >
          <span aria-hidden className="aurora pointer-events-none absolute -inset-1/2" style={{ "--c": world.color } as CSSProperties} />
          {world.image_url && (
            <div aria-hidden className="absolute -inset-[6%] transition-transform duration-500 ease-out" style={PARALLAX_DEEP}>
              <Img src={world.image_url} className="pointer-events-none h-full w-full object-cover opacity-30 mix-blend-luminosity" />
            </div>
          )}
          <div aria-hidden className="absolute -bottom-[22%] -right-[8%] size-[80%] transition-transform duration-700 ease-out" style={PARALLAX_ICON}>
            <WorldIcon
              name={world.icon}
              className="size-full opacity-[0.16] transition-transform duration-700 ease-out group-hover/tilt:rotate-[12deg] group-hover/tilt:scale-110"
              strokeWidth={1}
            />
          </div>
          <Glare strength={0.4} />

          <div className="relative z-[3] flex items-start justify-between gap-3" style={PARALLAX_NEAR}>
            <WorldIcon name={world.icon} className="size-8" strokeWidth={1.5} />
            {status && (
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${fg}1f` }}>
                {free !== null && free > 0 && (
                  <span className="relative mr-1.5 flex size-2" aria-hidden>
                    <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ backgroundColor: fg }} />
                    <span className="relative size-2 rounded-full" style={{ backgroundColor: fg }} />
                  </span>
                )}
                {status}
              </span>
            )}
          </div>
          <div className="relative z-[3] flex items-end justify-between gap-4" style={PARALLAX_NEAR}>
            <div>
              <h3 className="font-display text-3xl font-bold leading-none tracking-tight sm:text-4xl">{world.name}</h3>
              <p className="mt-2 text-sm opacity-80">
                {priceLabel(world)}, up to {world.maxPlayers} player{world.maxPlayers > 1 ? "s" : ""}
              </p>
            </div>
            {onOpen && (
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/tilt:rotate-45 group-hover/tilt:scale-110"
                style={{ backgroundColor: fg, color: world.color }}
              >
                <ArrowUpRight className="size-5" />
              </span>
            )}
          </div>
        </motion.button>
      )}
    </Tilt>
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
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-line bg-void/80 px-3.5 text-xs font-semibold sm:text-sm md:bg-void/60 md:backdrop-blur">
      <span className="relative flex size-2" aria-hidden>
        {state.open && <span className="absolute inset-0 animate-ping rounded-full bg-[#35e08a] opacity-70" />}
        <span className={cn("relative size-2 rounded-full", state.open ? "bg-[#35e08a]" : "bg-muted")} />
      </span>
      {label}
    </span>
  );
}

const ROW = {
  hidden: { opacity: 0, x: -20 },
  show: { opacity: 1, x: 0, transition: { duration: 0.6, ease: EASE } },
};

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
      <motion.dl
        className="mt-6 divide-y divide-line border-y border-line"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "0px 0px -8% 0px" }}
        variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } } }}
      >
        {order.map((d) => {
          const h = hoursForWeekday(d, settings);
          const isToday = today !== null && weekday(today) === d;
          return (
            <motion.div
              key={d}
              variants={ROW}
              className={cn("relative isolate flex justify-between gap-4 py-3", isToday && "font-semibold text-rift")}
            >
              {isToday && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-1 -left-3 -right-3 -z-10 origin-left rounded-xl bg-rift/10"
                  variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { delay: 0.55, duration: 0.9, ease: EASE } } }}
                />
              )}
              <dt>{WEEKDAYS[d]}</dt>
              <dd className={cn(!isToday && "text-muted")}>
                {h.closed ? "Closed" : `${fmtClock(h.open)} – ${fmtClock(h.close)}`}
              </dd>
            </motion.div>
          );
        })}
      </motion.dl>
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
    <motion.div variants={{ hidden: { opacity: 0, y: 16, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 300, damping: 22 } } }}>
      <Magnetic strength={0.22}>
        <a
          href={href}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
          className="pill-fill inline-flex h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"
        >
          {icon}
          {children}
        </a>
      </Magnetic>
    </motion.div>
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
