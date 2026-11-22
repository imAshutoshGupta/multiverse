"use client";
// The landing hero: a pinned 3D scene. The cafe's posters float at different
// depths inside a tilted orbit ring, the camera follows the pointer, and
// scrolling flies the camera forward through them while a starfield warps past.
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "motion/react";
import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui";
import type { Game } from "@/lib/types";
import type { World } from "./BookingPanel";
import { EASE, FINE_POINTER } from "./fx";

type MV = MotionValue<number>;

export function Hero({
  lines,
  imageUrl,
  posters,
  worlds,
  children,
}: {
  lines: string[];
  imageUrl: string | null;
  posters: Game[];
  worlds: World[];
  /** Copy and buttons under the headline */
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Pointer position across the window, -1..1, eased
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 45, damping: 16 });
  const sy = useSpring(my, { stiffness: 45, damping: 16 });
  useEffect(() => {
    if (reduce || !matchMedia(FINE_POINTER).matches) return;
    const move = (e: PointerEvent) => {
      mx.set((e.clientX / innerWidth) * 2 - 1);
      my.set((e.clientY / innerHeight) * 2 - 1);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, [reduce, mx, my]);

  const fade = useTransform(p, [0, 0.36], [1, 0]);
  const rise = useTransform(p, [0, 0.5], [0, -70]);

  const scene = imageUrl ? (
    <PhotoScene src={imageUrl} p={p} sx={sx} sy={sy} reduce={reduce} />
  ) : posters.length >= 4 ? (
    <PosterField posters={posters} p={p} sx={sx} sy={sy} reduce={reduce} />
  ) : (
    <PlanetScene worlds={worlds} p={p} sx={sx} sy={sy} reduce={reduce} />
  );

  return (
    // The outer box is taller than the screen so the scene stays pinned while it plays
    <div ref={ref} className={cn("relative -mt-20", !reduce && "h-[155svh]")}>
      <section className="sticky top-0 isolate flex min-h-svh flex-col justify-end overflow-hidden px-5 pb-12 pt-32 sm:px-10 sm:pb-16">
        <Starfield p={p} sx={sx} sy={sy} reduce={reduce} />
        {scene}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-linear-to-t from-void via-void/60 to-transparent md:via-void/30"
        />

        <motion.div className="relative" style={reduce ? undefined : { opacity: fade }}>
          <h1 className="font-display text-[clamp(2.4rem,6.2vw,6rem)] font-bold leading-[0.98] tracking-[-0.02em] md:max-w-[62%]">
            {lines.map((line, i) => (
              <HeroLine key={i} text={line} index={i} count={lines.length} p={p} reduce={reduce} />
            ))}
          </h1>
          <motion.div style={reduce ? undefined : { y: rise }}>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + lines.length * 0.16, duration: 0.9, ease: EASE }}
            >
              {children}
            </motion.div>
          </motion.div>
        </motion.div>

        <ScrollCue p={p} />
      </section>
    </div>
  );
}

/** One headline line: words flip up in 3D, then lines drift apart as you scroll. */
function HeroLine({ text, index, count, p, reduce }: { text: string; index: number; count: number; p: MV; reduce: boolean }) {
  // Upper lines rise faster, so the headline pulls apart as it leaves
  const y = useTransform(p, [0, 0.5], [0, -(40 + (count - 1 - index) * 70)]);
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <motion.span className="block pb-[0.06em] [perspective:900px]" style={reduce ? undefined : { y }}>
      <span className="block text-balance">
        {words.map((w, j) => (
          <Fragment key={j}>
            <motion.span
              className="inline-block origin-bottom"
              initial={{ opacity: 0, rotateX: -95, y: "40%" }}
              animate={{ opacity: 1, rotateX: 0, y: "0%" }}
              transition={{ delay: 0.3 + index * 0.16 + j * 0.06, duration: 1.15, ease: EASE }}
            >
              {w}
            </motion.span>
            {j < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </motion.span>
  );
}

/* ----------------------------------------------------------- poster field */

// Poster placement inside the field: centre (x, y) in %, width in %, depth in px, tilt in deg
const SLOTS = [
  { x: 50, y: 34, w: 29, z: 140, r: -6 },
  { x: 82, y: 20, w: 25, z: -60, r: 5 },
  { x: 74, y: 68, w: 27, z: 40, r: -3 },
  { x: 26, y: 64, w: 22, z: -300, r: 8 },
  { x: 99, y: 56, w: 21, z: -420, r: -9 },
  { x: 20, y: 18, w: 18, z: -560, r: 4 },
  { x: 56, y: 96, w: 19, z: -640, r: 7 },
  { x: 42, y: 4, w: 15, z: -780, r: -5 },
];

function PosterField({ posters, p, sx, sy, reduce }: { posters: Game[]; p: MV; sx: MV; sy: MV; reduce: boolean }) {
  const rotateY = useTransform(sx, (v) => -12 + v * 14);
  const rotateX = useTransform(sy, (v) => 7 - v * 9);
  const z = useTransform(p, [0, 0.55], [0, 1350]);
  const fade = useTransform(p, [0.2, 0.55], [1, 0]);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[58%] [mask-image:linear-gradient(to_bottom,black_50%,transparent)] md:inset-y-0 md:left-auto md:right-0 md:h-full md:w-[64%] md:[mask-image:linear-gradient(to_left,black_50%,transparent)]"
      style={{ perspective: 1100, opacity: reduce ? 1 : fade }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          rotateX: reduce ? 7 : rotateX,
          rotateY: reduce ? -12 : rotateY,
          z: reduce ? 0 : z,
        }}
      >
        <div
          className="absolute left-[56%] top-[46%] aspect-square w-[70%] rounded-full"
          style={{
            transform: "translate(-50%, -50%) translateZ(-900px)",
            background: "radial-gradient(closest-side, color-mix(in oklab, var(--color-portal) 55%, transparent), transparent)",
          }}
        />
        <OrbitRing />
        {SLOTS.map((s, i) => (
          <Poster key={i} game={posters[i % posters.length]} slot={s} index={i} />
        ))}
      </motion.div>
    </motion.div>
  );
}

function Poster({ game, slot, index }: { game: Game; slot: (typeof SLOTS)[number]; index: number }) {
  const dim = Math.min(0.62, Math.max(0, -slot.z / 1150));
  const delay = 0.1 + index * 0.08;
  return (
    <motion.div
      className="absolute aspect-[3/4]"
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.w}%`, x: "-50%", y: "-50%", rotateZ: slot.r, rotateY: (50 - slot.x) * 0.22 }}
      initial={{ z: -2400, opacity: 0 }}
      animate={{ z: slot.z, opacity: 1 }}
      transition={{ z: { duration: 2, ease: EASE, delay }, opacity: { duration: 0.9, delay } }}
    >
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-[18px] shadow-[0_40px_80px_-24px_rgb(0_0_0/0.85)] ring-1 ring-white/10"
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 6 + (index % 4) * 1.3, repeat: Infinity, ease: "easeInOut", delay: index * 0.4 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded posters from any host */}
        <img
          src={game.cover_url!}
          alt=""
          loading={index < 4 ? "eager" : "lazy"}
          decoding="async"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-linear-to-tr from-transparent via-transparent to-white/15" />
        {dim > 0 && <div className="absolute inset-0 bg-void" style={{ opacity: dim }} />}
      </motion.div>
    </motion.div>
  );
}

const RING_MASK = "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))";
const RING_GLOW_MASK = "radial-gradient(farthest-side, transparent calc(100% - 22px), #000 calc(100% - 10px), transparent)";
const RING_FILL =
  "conic-gradient(from 0deg, transparent 0deg, var(--color-portal) 70deg, var(--color-rift) 150deg, transparent 210deg, var(--color-portal) 300deg, transparent 360deg)";

/** The logo's orbit, scaled up: a tilted ring with light running around it. */
function OrbitRing() {
  return (
    <div
      className="absolute left-[58%] top-[52%] aspect-square w-[110%]"
      style={{ transform: "translate(-50%, -50%) translateZ(-140px) rotateX(64deg)", transformStyle: "preserve-3d" }}
    >
      <motion.div
        className="absolute inset-0 rounded-full opacity-90 blur-lg"
        style={{ background: RING_FILL, maskImage: RING_GLOW_MASK, WebkitMaskImage: RING_GLOW_MASK }}
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ background: RING_FILL, maskImage: RING_MASK, WebkitMaskImage: RING_MASK }}
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

/* ----------------------------------------------------- fallback scenes */

function PhotoScene({ src, p, sx, sy, reduce }: { src: string; p: MV; sx: MV; sy: MV; reduce: boolean }) {
  const scale = useTransform(p, [0, 1], [1.1, 1.4]);
  const y = useTransform(p, [0, 1], ["0%", "16%"]);
  const px = useTransform(sx, (v) => v * -18);
  const py = useTransform(sy, (v) => v * -12);
  return (
    <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
      <motion.div className="absolute inset-0" style={reduce ? { scale: 1.05 } : { scale, y }}>
        <motion.img
          src={src}
          alt=""
          decoding="async"
          className="absolute inset-[-3%] h-[106%] w-[106%] object-cover opacity-50"
          style={reduce ? undefined : { x: px, y: py }}
          initial={{ scale: 1.15, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.5 }}
          transition={{ duration: 1.8, ease: EASE }}
        />
      </motion.div>
      <div className="absolute inset-0 bg-linear-to-t from-void via-void/70 to-void/20" />
    </div>
  );
}

const PLANETS = [
  { size: 56, top: 8, left: 36, depth: 1 },
  { size: 24, top: 46, left: 8, depth: 1.8 },
  { size: 15, top: 4, left: 14, depth: 2.6 },
  { size: 10, top: 66, left: 74, depth: 3.2 },
  { size: 7, top: 30, left: 2, depth: 4 },
];

function PlanetScene({ worlds, p, sx, sy, reduce }: { worlds: World[]; p: MV; sx: MV; sy: MV; reduce: boolean }) {
  const spin = useTransform(p, [0, 1], [-14, 30]);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-16 -z-10 h-[40%] md:inset-x-auto md:right-0 md:top-0 md:h-full md:w-[42%]"
    >
      <motion.svg
        className="absolute inset-0 h-full w-full text-line"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        style={reduce ? { rotate: -14 } : { rotate: spin }}
      >
        <ellipse cx="58" cy="40" rx="50" ry="22" stroke="currentColor" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      </motion.svg>
      <div className="absolute inset-0 mx-auto aspect-square max-h-full max-w-full md:top-1/2 md:-translate-y-1/2">
        {worlds.slice(0, 5).map((w, i) => (
          <Planet key={w.name} color={w.color} spot={PLANETS[i]} index={i} p={p} sx={sx} sy={sy} reduce={reduce} />
        ))}
      </div>
    </div>
  );
}

function Planet({
  color,
  spot,
  index,
  p,
  sx,
  sy,
  reduce,
}: {
  color: string;
  spot: (typeof PLANETS)[number];
  index: number;
  p: MV;
  sx: MV;
  sy: MV;
  reduce: boolean;
}) {
  const x = useTransform(sx, (v) => v * -22 * spot.depth);
  const py = useTransform(sy, (v) => v * -16 * spot.depth);
  const sy2 = useTransform(p, [0, 1], [0, -220 * spot.depth]);
  const y = useTransform(() => py.get() + sy2.get());
  return (
    <motion.div
      className="absolute aspect-square"
      style={{ width: `${spot.size}%`, top: `${spot.top}%`, left: `${spot.left}%`, ...(reduce ? {} : { x, y }) }}
    >
      <motion.div
        className="h-full w-full rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 30%, color-mix(in oklab, ${color} 55%, white) 0%, ${color} 38%, color-mix(in oklab, ${color} 45%, black) 100%)`,
          boxShadow: `0 0 90px -16px ${color}`,
        }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 + index * 0.1, duration: 1.3, ease: EASE }}
      />
    </motion.div>
  );
}

/* -------------------------------------------------------------- starfield */

/** Canvas stars that drift toward you, streak when you scroll down, and shift with the pointer. */
function Starfield({ p, sx, sy, reduce }: { p: MV; sx: MV; sy: MV; reduce: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue("--color-ink").trim() || "#ffffff";
    const tints = [css.getPropertyValue("--color-portal").trim() || "#7c5cff", css.getPropertyValue("--color-rift").trim() || "#ffc23d"];

    type Star = { x: number; y: number; z: number; c: string };
    const spawn = (far: boolean): Star => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: far ? 1 : 0.05 + Math.random() * 0.95,
      c: Math.random() < 0.8 ? ink : tints[Math.random() < 0.5 ? 0 : 1],
    });

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(280, Math.max(90, (w * h) / 5200)));
      stars = Array.from({ length: n }, () => spawn(false));
    };

    let speed = 0.0007;
    let last = p.get();
    let raf = 0;
    let running = false;

    const draw = () => {
      const now = p.get();
      const dp = now - last;
      last = now;
      speed += (0.0007 + Math.max(0, dp) * 3.2 - speed) * 0.08;
      const move = reduce ? 0 : speed;

      ctx.clearRect(0, 0, w, h);
      const f = Math.max(w, h) * 0.55;
      const wide = w >= 768;
      const cx = w * (wide ? 0.64 : 0.5);
      const cy = h * (wide ? 0.46 : 0.28);
      const ox = sx.get() * -40;
      const oy = sy.get() * -28;
      const streak = move > 0.003;
      ctx.lineCap = "round";

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const prevZ = s.z;
        s.z -= move;
        if (s.z <= 0.04) {
          stars[i] = spawn(true);
          continue;
        }
        const k = f / s.z;
        const depth = 1 - s.z;
        const x = cx + s.x * k + ox * depth;
        const y = cy + s.y * k + oy * depth;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) {
          stars[i] = spawn(true);
          continue;
        }
        const size = depth * 2.1 + 0.35;
        ctx.globalAlpha = Math.min(1, depth * 1.4) * 0.85;
        if (streak) {
          const kp = f / Math.min(1, prevZ + move * 6);
          ctx.strokeStyle = s.c;
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(cx + s.x * kp + ox * depth, cy + s.y * kp + oy * depth);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else {
          ctx.fillStyle = s.c;
          ctx.fillRect(x - size / 2, y - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    draw();
    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw();
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()));
    io.observe(canvas);
    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
    };
  }, [p, sx, sy, reduce]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-20 h-full w-full" />;
}

function ScrollCue({ p }: { p: MV }) {
  const opacity = useTransform(p, [0, 0.06], [1, 0]);
  return (
    <motion.div aria-hidden style={{ opacity }} className="absolute bottom-10 right-10 hidden h-16 w-px overflow-hidden bg-line md:block">
      <motion.span
        className="absolute inset-x-0 top-0 h-6 bg-ink"
        animate={{ y: ["-100%", "280%"] }}
        transition={{ duration: 1.7, repeat: Infinity, ease: [0.65, 0, 0.35, 1] }}
      />
    </motion.div>
  );
}
