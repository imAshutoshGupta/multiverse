"use client";
import confetti from "canvas-confetti";
import { ArrowLeft, Check, MessageCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { requestBooking, type RequestResult } from "@/app/book/actions";
import { WorldIcon } from "@/components/brand/Icon";
import { cn, ErrorNote } from "@/components/ui";
import { availableStarts, estimatePrice, formatINR, priceLabel } from "@/lib/availability";
import { onColor } from "@/lib/brand";
import { normalizePhone, waLink } from "@/lib/phone";
import type { PublicCatalog } from "@/lib/publicCatalog";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addDays, businessWindow, daySlots, fmtDay, fmtDuration, fmtLongDay, fmtTime, istDate } from "@/lib/time";
import type { BusyInterval, Game, StationType } from "@/lib/types";

export type World = StationType & { stations: { id: string; max_players: number }[]; maxPlayers: number };

const STEPS = ["When", "You", "Send"] as const;

export function BookingPanel({
  world,
  worlds,
  game,
  onSwitch,
  onClose,
  settings,
  games,
  closures,
}: {
  world: World;
  /** Worlds the customer can switch to (for a game: the worlds it runs on) */
  worlds: World[];
  game: Game | null;
  onSwitch: (name: string) => void;
  onClose: () => void;
  settings: PublicCatalog["settings"];
  games: PublicCatalog["games"];
  closures: PublicCatalog["closures"];
}) {
  const today = istDate();
  const cover = game?.cover_url ?? null;
  const fg = cover ? "#ffffff" : onColor(world.color);
  const closeRef = useRef<HTMLButtonElement>(null);

  const days = useMemo(
    () =>
      Array.from({ length: settings.advance_days + 1 }, (_, i) => {
        const d = addDays(today, i);
        return { date: d, closed: businessWindow(d, settings, closures).closed };
      }),
    [today, settings, closures],
  );

  const durations = useMemo(() => {
    const step = Math.max(settings.slot_minutes, 30);
    const min = Math.ceil(Math.max(settings.min_booking_minutes, settings.slot_minutes) / step) * step;
    const out: number[] = [];
    for (let m = min; m <= settings.max_booking_minutes; m += step) out.push(m);
    return out.length ? out : [settings.max_booking_minutes];
  }, [settings]);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [date, setDate] = useState(() => days.find((d) => !d.closed)?.date ?? today);
  const [party, setParty] = useState(1);
  const [minutes, setMinutes] = useState(() => (durations.includes(60) ? 60 : durations[0]));
  const [start, setStart] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ date: string; list: BusyInterval[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gameId, setGameId] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Extract<RequestResult, { ok: true }> | null>(null);
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);

  const players = Math.min(party, Math.max(1, world.maxPlayers));

  // Lock page scroll, close on Escape, focus the panel
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Busy times for the chosen day (plus the night before, for after-midnight slots)
  useEffect(() => {
    let alive = true;
    const sb = supabaseBrowser();
    const load = () =>
      Promise.all([sb.rpc("get_availability", { p_date: date }), sb.rpc("get_availability", { p_date: addDays(date, -1) })]).then(
        ([a, b]) => {
          if (!alive) return;
          if (a.error || b.error) return setLoadError(true);
          setLoadError(false);
          setBusy({ date, list: [...((a.data ?? []) as BusyInterval[]), ...((b.data ?? []) as BusyInterval[])] });
        },
      );
    load();
    const t = setInterval(load, 45_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [date, reload]);

  const win = businessWindow(date, settings, closures);
  // Only stations that fit the group
  const stationsHere = useMemo(() => world.stations.filter((s) => s.max_players >= players), [world.stations, players]);
  const starts = useMemo(() => {
    if (!busy || busy.date !== date || win.closed) return null;
    return availableStarts({
      slots: daySlots(date, settings, closures),
      closesAt: win.closesAt,
      durationMin: minutes,
      stations: stationsHere,
      busy: busy.list,
      leadMinutes: settings.lead_minutes,
    });
  }, [busy, date, win.closed, win.closesAt, settings, closures, minutes, stationsHere]);

  const chosen = start && starts?.some((s) => s.start.toISOString() === start && s.freeStations > 0) ? start : null;
  const endIso = chosen ? new Date(new Date(chosen).getTime() + minutes * 60_000).toISOString() : null;
  const price = estimatePrice(world.hourly_rate, minutes, players, world.pricing);
  const phoneOk = normalizePhone(phone) !== null;
  const worldGames = games.filter((g) => !g.worlds.length || g.worlds.includes(world.name));
  const canNext = step === 0 ? Boolean(chosen) : step === 1 ? name.trim().length >= 2 && phoneOk : !pending;

  const groups = useMemo(() => {
    if (!starts) return [];
    const nextMidnight = new Date(`${addDays(date, 1)}T00:00:00+05:30`).getTime();
    const label = (d: Date) => {
      if (d.getTime() >= nextMidnight) return "After midnight";
      const h = new Date(d.getTime() + 330 * 60_000).getUTCHours(); // hour in IST
      if (h < 12) return "Morning";
      if (h < 17) return "Afternoon";
      if (h < 21) return "Evening";
      return "Night";
    };
    const out: { label: string; items: typeof starts }[] = [];
    for (const s of starts) {
      const l = label(s.start);
      const g = out.find((x) => x.label === l);
      if (g) g.items.push(s);
      else out.push({ label: l, items: [s] });
    }
    return out;
  }, [starts, date]);

  function go(n: number) {
    setDir(n > step ? 1 : -1);
    setStep(n);
    setError(null);
  }

  function submit() {
    if (!chosen) return go(0);
    setError(null);
    startTransition(async () => {
      const r = await requestBooking({
        date,
        stationType: world.name,
        startsAt: chosen,
        minutes,
        name: name.trim(),
        phone,
        partySize: players,
        gameId: game?.id ?? (gameId || null),
        notes,
        website,
      });
      if (r.ok) {
        setDone(r);
        confetti({
          particleCount: 140,
          spread: 75,
          origin: { y: 0.35 },
          colors: [world.color, settings.color_accent, "#ffffff"],
          disableForReducedMotion: true,
        });
      } else {
        setError(r.error);
        if (r.refresh) {
          setReload((x) => x + 1);
          go(0);
        }
      }
    });
  }

  const summary = chosen && endIso ? `${fmtDay(date)}, ${fmtTime(chosen)}–${fmtTime(endIso)}` : null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="panel-title" className="fixed inset-0 z-50 flex flex-col">
      {/* The tapped card (game poster or world colour) expands into the panel */}
      <motion.div
        layoutId={game ? `game-${game.id}` : `world-${world.name}`}
        className="absolute inset-0 overflow-hidden"
        style={{ backgroundColor: world.color, borderRadius: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
      >
        {cover && (
          <>
            <motion.img layout src={cover} alt="" className="absolute inset-x-0 top-0 h-[55%] w-full object-cover" />
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(to bottom, rgb(0 0 0 / 0.35), rgb(0 0 0 / 0.55) 30%, color-mix(in oklab, ${world.color} 35%, black) 55%)` }}
            />
          </>
        )}
      </motion.div>

      <motion.div
        className="relative flex min-h-0 flex-1 flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.25 } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      >
        {/* Header in the world's colour */}
        <header className="px-4 pb-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8" style={{ color: fg }}>
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            {step > 0 && !done ? (
              <button
                onClick={() => go(step - 1)}
                className="grid size-11 cursor-pointer place-items-center rounded-full transition hover:bg-black/10"
                aria-label="Back"
              >
                <ArrowLeft className="size-5" />
              </button>
            ) : (
              <span className="size-11" />
            )}
            {!done && (
              <ol className="mx-auto flex items-center gap-1.5 text-sm font-semibold" aria-label="Steps">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-xs transition",
                        i <= step ? "opacity-100" : "opacity-40",
                      )}
                      style={{ backgroundColor: i <= step ? fg : "transparent", color: i <= step ? world.color : fg, border: `1.5px solid ${fg}` }}
                    >
                      {i < step ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={cn("hidden sm:inline", i !== step && "opacity-50")}>{s}</span>
                    {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 opacity-40 sm:w-8" style={{ backgroundColor: fg }} />}
                  </li>
                ))}
              </ol>
            )}
            <button
              ref={closeRef}
              onClick={onClose}
              className="ml-auto grid size-11 cursor-pointer place-items-center rounded-full transition hover:bg-black/10"
              aria-label="Close booking"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className={cn("mx-auto flex max-w-3xl items-end gap-4", cover ? "mt-16 sm:mt-24" : "mt-4")}>
            {!game && <WorldIcon name={world.icon} className="size-12 shrink-0" strokeWidth={1.5} />}
            <div className="min-w-0">
              <h2 id="panel-title" className="text-balance font-display text-3xl font-bold leading-none tracking-tight sm:text-5xl">
                {game ? game.name : world.name}
              </h2>
              <p className="mt-2 text-sm font-medium opacity-85">
                {game ? `${game.kind === "experience" ? "At" : "On"} ${world.name}, ${priceLabel(world)}` : priceLabel(world)}
              </p>
            </div>
          </div>
          {game && worlds.length > 1 && !done && step === 0 && (
            <div className="mx-auto mt-4 max-w-3xl">
              <p className="mb-2 text-xs font-semibold opacity-80">Where do you want to play?</p>
              <div className="no-scrollbar flex gap-2 overflow-x-auto" role="radiogroup" aria-label="Where to play">
                {worlds.map((w) => {
                  const on = w.name === world.name;
                  return (
                    <button
                      key={w.name}
                      role="radio"
                      aria-checked={on}
                      onClick={() => onSwitch(w.name)}
                      className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
                      style={on ? { backgroundColor: w.color, color: onColor(w.color) } : { backgroundColor: "rgb(255 255 255 / 0.14)", color: fg }}
                    >
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: on ? onColor(w.color) : w.color }} />
                      {w.name}
                      <span className="opacity-75">{formatINR(w.hourly_rate)}/hr</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!game && worlds.length > 1 && !done && step === 0 && (
            <div className="no-scrollbar mx-auto mt-4 flex max-w-3xl gap-2 overflow-x-auto">
              {worlds
                .filter((w) => w.name !== world.name)
                .map((w) => (
                  <button
                    key={w.name}
                    onClick={() => onSwitch(w.name)}
                    className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition hover:opacity-100"
                    style={{ backgroundColor: `${fg}1a`, opacity: 0.85 }}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: w.color, outline: `1.5px solid ${fg}` }} />
                    Switch to {w.name}
                  </button>
                ))}
            </div>
          )}
        </header>

        {/* Sheet */}
        <div className="relative flex min-h-0 flex-1 flex-col rounded-t-[28px] bg-void text-ink">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto max-w-3xl px-4 pb-8 pt-6 sm:px-8">
              {done ? (
                <Success
                  done={done}
                  world={world}
                  game={game}
                  date={date}
                  players={players}
                  name={name}
                  settings={settings}
                  onClose={onClose}
                />
              ) : (
                <AnimatePresence mode="wait" custom={dir} initial={false}>
                  <motion.div
                    key={step}
                    custom={dir}
                    initial={{ opacity: 0, x: dir * 32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: dir * -32 }}
                    transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    {step === 0 && (
                      <div className="space-y-8">
                        <Group title="Day">
                          <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pb-1 sm:-mx-8 sm:scroll-px-8 sm:px-8 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-2.5rem),transparent)]">
                            {days.map((d, i) => {
                              const [wd, ...rest] = fmtDay(d.date).split(" ");
                              return (
                                <Chip
                                  key={d.date}
                                  active={d.date === date}
                                  disabled={d.closed}
                                  onClick={() => {
                                    setDate(d.date);
                                    setStart(null);
                                  }}
                                  className="min-w-[4.75rem] snap-start flex-col py-2"
                                  activeColor={world.color}
                                >
                                  <span className="text-xs opacity-75">
                                    {i === 0 ? "Today" : i === 1 ? "Tomorrow" : wd.replace(",", "")}
                                  </span>
                                  <span className="font-display text-base">{d.closed ? "Closed" : rest.join(" ")}</span>
                                </Chip>
                              );
                            })}
                          </div>
                        </Group>

                        <div className="grid gap-8 sm:grid-cols-2">
                          {world.maxPlayers > 1 && (
                            <Group title="Players">
                              <div className="flex flex-wrap gap-2">
                                {Array.from({ length: Math.min(world.maxPlayers, 12) }, (_, i) => i + 1).map((n) => (
                                  <Chip key={n} active={n === players} onClick={() => setParty(n)} className="w-12" activeColor={world.color}>
                                    {n}
                                  </Chip>
                                ))}
                              </div>
                            </Group>
                          )}
                          <Group title="How long">
                            <div className="flex flex-wrap gap-2">
                              {durations.map((m) => (
                                <Chip key={m} active={m === minutes} onClick={() => setMinutes(m)} activeColor={world.color}>
                                  {fmtDuration(m)}
                                </Chip>
                              ))}
                            </div>
                          </Group>
                        </div>

                        <Group title="Start time">
                          {loadError && <ErrorNote>Free times didn&apos;t load. Check your connection and try again.</ErrorNote>}
                          {win.closed ? (
                            <Empty>
                              We&apos;re closed on {fmtLongDay(date)}
                              {win.reason ? ` for ${win.reason}` : ""}. Pick another day.
                            </Empty>
                          ) : !starts ? (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                              {Array.from({ length: 10 }).map((_, i) => (
                                <div key={i} className="h-12 animate-pulse rounded-2xl bg-panel" />
                              ))}
                            </div>
                          ) : starts.every((s) => s.freeStations === 0) ? (
                            <Empty>
                              No {world.name} times free for {fmtDuration(minutes)} on {fmtLongDay(date)}. Try a shorter
                              time or another day.
                            </Empty>
                          ) : (
                            <div className="space-y-5">
                              {groups.map((g) => (
                                <div key={g.label}>
                                  <p className="mb-2 text-sm text-muted">{g.label}</p>
                                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                                    {g.items.map((s) => {
                                      const iso = s.start.toISOString();
                                      const free = s.freeStations > 0;
                                      return (
                                        <Chip
                                          key={iso}
                                          disabled={!free}
                                          active={iso === chosen}
                                          onClick={() => setStart(iso)}
                                          className="flex-col py-2"
                                          activeColor={world.color}
                                        >
                                          <span className={cn(!free && "line-through")}>{fmtTime(s.start)}</span>
                                          {free && s.freeStations === 1 && stationsHere.length > 1 && (
                                            <span className="text-[11px] font-medium text-rift">Last one</span>
                                          )}
                                        </Chip>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </Group>
                      </div>
                    )}

                    {step === 1 && (
                      <div className="space-y-6">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <TextField label="Your name" value={name} onChange={setName} autoComplete="name" maxLength={80} autoFocus />
                          <TextField
                            label="WhatsApp number"
                            value={phone}
                            onChange={setPhone}
                            autoComplete="tel"
                            inputMode="tel"
                            placeholder="98765 43210"
                            hint={phone && !phoneOk ? "Enter a 10-digit mobile number" : "We confirm your booking here"}
                          />
                        </div>
                        {!game && worldGames.length > 0 && (
                          <Group title="Game (optional)">
                            <div className="flex flex-wrap gap-2">
                              <Chip active={!gameId} onClick={() => setGameId("")} activeColor={world.color}>
                                Decide later
                              </Chip>
                              {worldGames.map((g) => (
                                <Chip key={g.id} active={gameId === g.id} onClick={() => setGameId(g.id)} activeColor={world.color}>
                                  {g.name}
                                </Chip>
                              ))}
                            </div>
                          </Group>
                        )}
                        <TextField
                          label="Anything we should know? (optional)"
                          value={notes}
                          onChange={setNotes}
                          maxLength={500}
                          placeholder="Birthday, tournament practice, need extra controllers…"
                          multiline
                        />
                        {/* Honeypot: hidden from people, irresistible to bots */}
                        <input
                          type="text"
                          name="website"
                          tabIndex={-1}
                          autoComplete="off"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="absolute -left-[9999px] h-0 w-0 opacity-0"
                          aria-hidden
                        />
                      </div>
                    )}

                    {step === 2 && (
                      <div className="space-y-6">
                        <dl className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-panel">
                          <Row label={game ? "Where" : "World"}>{world.name}</Row>
                          <Row label="When">{summary}</Row>
                          <Row label="Players">{players}</Row>
                          {(game || gameId) && <Row label={game?.kind === "experience" ? "Experience" : "Game"}>{game?.name ?? games.find((g) => g.id === gameId)?.name}</Row>}
                          <Row label="Name">{name.trim()}</Row>
                          <Row label="WhatsApp">{phone}</Row>
                          <Row label="Estimated price">
                            <span className="font-display text-xl">{formatINR(price)}</span>
                          </Row>
                        </dl>
                        <p className="text-sm text-muted">
                          We hold this slot for you and confirm on WhatsApp. You pay at the cafe.
                        </p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              )}
              {error && !done && (
                <div className="mt-6">
                  <ErrorNote>{error}</ErrorNote>
                </div>
              )}
            </div>
          </div>

          {/* Action bar */}
          {!done && (
            <div className="border-t border-line bg-void/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-8">
              <div className="mx-auto flex max-w-3xl items-center gap-4">
                <div className="min-w-0 flex-1 text-sm">
                  {summary ? (
                    <>
                      <p className="truncate font-semibold">{summary}</p>
                      <p className="text-muted">
                        {players} player{players > 1 ? "s" : ""}, about {formatINR(price)}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted">Pick a start time</p>
                  )}
                </div>
                <button
                  onClick={() => (step < 2 ? go(step + 1) : submit())}
                  disabled={!canNext}
                  className="inline-flex h-13 shrink-0 cursor-pointer items-center rounded-full px-7 text-base font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ backgroundColor: world.color, color: fg }}
                >
                  {step < 2 ? "Continue" : pending ? "Sending…" : "Send request"}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function Success({
  done,
  world,
  game,
  date,
  players,
  name,
  settings,
  onClose,
}: {
  done: Extract<RequestResult, { ok: true }>;
  world: World;
  game: Game | null;
  date: string;
  players: number;
  name: string;
  settings: PublicCatalog["settings"];
  onClose: () => void;
}) {
  const fg = onColor(world.color);
  const msg =
    `Hi ${settings.cafe_name}! I just requested a booking:\n` +
    `${game ? `${game.name} on ` : ""}${world.name}, ${fmtDay(date)}, ${fmtTime(done.startsAt)}–${fmtTime(done.endsAt)}\n` +
    `${players} player${players > 1 ? "s" : ""}. Name: ${name.trim()}`;
  return (
    <motion.div
      className="py-6 text-center"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      <motion.div
        className="mx-auto grid size-20 place-items-center rounded-full"
        style={{ backgroundColor: world.color, color: fg }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.1 }}
      >
        <Check className="size-10" strokeWidth={3} />
      </motion.div>
      <h3 className="mt-6 font-display text-3xl font-bold tracking-tight">Request sent</h3>
      <p className="mx-auto mt-3 max-w-md text-lg">
        {game ? `${game.name} on ${world.name}` : world.name}, {fmtLongDay(date)}, {fmtTime(done.startsAt)} – {fmtTime(done.endsAt)}
      </p>
      <p className="mx-auto mt-3 max-w-md text-muted">
        Your slot is held. We&apos;ll confirm on WhatsApp shortly. Message us if you need to change anything.
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <a
          href={waLink(settings.whatsapp_number, msg)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 font-semibold text-[#06210f]"
        >
          <MessageCircle className="size-5" aria-hidden /> Message us on WhatsApp
        </a>
        <button
          onClick={onClose}
          className="inline-flex h-13 cursor-pointer items-center justify-center rounded-full border border-line px-6 font-semibold hover:border-ink/40"
        >
          Done
        </button>
      </div>
    </motion.div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 font-display text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-3xl border border-dashed border-line p-5 text-muted">{children}</p>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  hint,
  multiline,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  multiline?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const cls =
    "w-full rounded-2xl border border-line bg-panel px-4 text-base text-ink outline-none transition placeholder:text-muted/60 focus:border-portal focus:ring-4 focus:ring-portal/20";
  return (
    <label className="flex flex-col gap-2">
      <span className="font-display text-sm font-semibold">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          maxLength={rest.maxLength}
          placeholder={rest.placeholder}
          className={cn(cls, "py-3")}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cn(cls, "h-13")} {...rest} />
      )}
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

function Chip({
  active,
  className,
  activeColor,
  style,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean; activeColor?: string }) {
  const color = activeColor ?? "var(--color-portal)";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-muted/45",
        active ? "border-transparent" : "border-line bg-panel hover:border-ink/30",
        className,
      )}
      style={active ? { backgroundColor: color, color: activeColor ? onColor(activeColor) : "var(--color-on-portal)", ...style } : style}
      {...props}
    />
  );
}
