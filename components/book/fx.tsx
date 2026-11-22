"use client";
// Motion toolkit for the public landing page: smooth scroll, 3D tilt, magnetic
// buttons, text reveals, a scroll-velocity marquee and a fitted wordmark.
// Everything degrades to a still page under prefers-reduced-motion, and pointer
// effects only run for a real mouse/trackpad.
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import {
  motion,
  useAnimationFrame,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from "motion/react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui";

export const EASE = [0.16, 1, 0.3, 1] as const;
export const FINE_POINTER = "(hover: hover) and (pointer: fine)";

/* ---------------------------------------------------------------- media */

export function useMedia(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => false,
  );
}

/* --------------------------------------------------------- smooth scroll */

let lenis: Lenis | null = null;

/** Inertial scrolling for the whole page. Render once. */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const l = new Lenis({ autoRaf: true, lerp: 0.1, allowNestedScroll: true });
    lenis = l;
    return () => {
      l.destroy();
      if (lenis === l) lenis = null;
    };
  }, []);
  return null;
}

export function scrollToEl(target: string | HTMLElement, offset = 0) {
  const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.5 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { duration: 1.8 });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

/** Freeze the page behind a modal (the modal itself scrolls natively). */
export function setScrollPaused(paused: boolean) {
  if (paused) lenis?.stop();
  else lenis?.start();
}

/* ----------------------------------------------------------------- tilt */

const TILT_SPRING = { stiffness: 260, damping: 20, mass: 0.6 };

/**
 * 3D tilt toward the pointer. Children can read --px/--py (-1..1) for inner
 * parallax and --gx/--gy (%) for glare. Flattens instantly on click so shared
 * layout animations measure an untilted card.
 */
export function Tilt({
  children,
  className,
  style,
  max = 10,
  lift = 1.03,
  disabled,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  max?: number;
  lift?: number;
  disabled?: boolean;
}) {
  const fine = useMedia(FINE_POINTER);
  const reduce = useReducedMotion();
  const on = fine && !reduce && !disabled;
  const rx = useSpring(0, TILT_SPRING);
  const ry = useSpring(0, TILT_SPRING);
  const s = useSpring(1, TILT_SPRING);
  const rect = useRef<DOMRect | null>(null);

  function setVars(el: HTMLElement, px: number, py: number) {
    el.style.setProperty("--px", px.toFixed(3));
    el.style.setProperty("--py", py.toFixed(3));
    el.style.setProperty("--gx", `${((px + 1) * 50).toFixed(1)}%`);
    el.style.setProperty("--gy", `${((py + 1) * 50).toFixed(1)}%`);
  }

  function enter(e: ReactPointerEvent<HTMLDivElement>) {
    if (!on || e.pointerType !== "mouse") return;
    rect.current = e.currentTarget.getBoundingClientRect();
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!on || e.pointerType !== "mouse") return;
    const r = (rect.current ??= e.currentTarget.getBoundingClientRect());
    const px = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const py = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    ry.set(px * max);
    rx.set(-py * max);
    s.set(lift);
    setVars(e.currentTarget, px, py);
  }
  function leave(e: ReactPointerEvent<HTMLDivElement>) {
    rect.current = null;
    rx.set(0);
    ry.set(0);
    s.set(1);
    setVars(e.currentTarget, 0, 0);
  }
  function flatten(e: React.MouseEvent<HTMLDivElement>) {
    rect.current = null;
    rx.jump(0);
    ry.jump(0);
    s.jump(1);
    e.currentTarget.style.transform = "none";
    setVars(e.currentTarget, 0, 0);
  }

  return (
    <motion.div
      onPointerEnter={enter}
      onPointerMove={move}
      onPointerLeave={leave}
      onClickCapture={flatten}
      data-tilt={on ? "" : undefined}
      className={cn("group/tilt", className)}
      style={{ ...style, rotateX: rx, rotateY: ry, scale: s, transformPerspective: 900 }}
    >
      {children}
    </motion.div>
  );
}

/** Pointer-following light for a Tilt card. Place inside an overflow-hidden parent. */
export function Glare({ strength = 0.32 }: { strength?: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[2] opacity-0 transition-opacity duration-500 group-hover/tilt:opacity-100"
      style={{
        background: `radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgb(255 255 255 / ${strength}), transparent 55%)`,
        mixBlendMode: "overlay",
      }}
    />
  );
}

/* ------------------------------------------------------------- magnetic */

export function Magnetic({
  children,
  className,
  strength = 0.28,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const fine = useMedia(FINE_POINTER);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 240, damping: 16, mass: 0.4 });
  const y = useSpring(0, { stiffness: 240, damping: 16, mass: 0.4 });
  const on = fine && !reduce;
  return (
    <motion.div
      className={cn("inline-flex", className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (!on || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        const cx = r.left - x.get() + r.width / 2;
        const cy = r.top - y.get() + r.height / 2;
        x.set((e.clientX - cx) * strength);
        y.set((e.clientY - cy) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------- reveals */

// The mask (not the hidden word inside it) is what gets observed: a word pushed
// fully outside its overflow-hidden mask never counts as "in view".
const WORD = {
  hidden: { y: "115%", rotate: 7 },
  show: (d: number) => ({ y: "0%", rotate: 0, transition: { duration: 0.95, ease: EASE, delay: d } }),
};

/** Words rise out of a mask, one after another, when scrolled into view. */
export function RevealWords({ text, delay = 0, stagger = 0.055 }: { text: string; delay?: number; stagger?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={i}>
          <motion.span
            className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] align-bottom"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
          >
            <motion.span className="inline-block origin-bottom-left" variants={WORD} custom={delay + i * stagger}>
              {w}
            </motion.span>
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

export function Reveal({
  children,
  className,
  style,
  delay = 0,
  y = 36,
  rotateX = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  y?: number;
  rotateX?: number;
}) {
  return (
    <motion.div
      className={className}
      style={{ ...style, transformPerspective: 1100 }}
      initial={{ opacity: 0, y, rotateX }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.9, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------ velocity marquee */

/** Endless strip that speeds up, reverses and skews with scroll velocity. */
export function VelocityMarquee({
  children,
  speed = 3,
  className,
}: {
  children: ReactNode;
  /** % of one copy per second; negative runs right */
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const reduce = useReducedMotion();
  const base = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [0, 1000], [0, 5], { clamp: false });
  const skew = useTransform(velocity, [-2500, 0, 2500], [10, 0, -10]);
  const x = useTransform(base, (v) => `${wrap(-50, 0, v)}%`);
  const dir = useRef(1);

  useAnimationFrame((_, delta) => {
    if (reduce || !inView) return;
    const f = factor.get();
    if (f < 0) dir.current = -1;
    else if (f > 0) dir.current = 1;
    let by = dir.current * -speed * (delta / 1000) * 0.5;
    by += by * Math.abs(f);
    base.set(base.get() + by);
  });

  return (
    <div ref={ref} aria-hidden className={cn("overflow-hidden whitespace-nowrap", className)}>
      <motion.div className="flex w-max will-change-transform" style={{ x, skewX: reduce ? 0 : skew }}>
        <div className="flex shrink-0">{children}</div>
        <div className="flex shrink-0">{children}</div>
      </motion.div>
    </div>
  );
}

/* ---------------------------------------------------------- page chrome */

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left"
      style={{ scaleX, background: "linear-gradient(90deg, var(--color-portal), var(--color-rift))" }}
    />
  );
}

/** Soft light that trails the cursor across the page. */
export function CursorGlow() {
  const fine = useMedia(FINE_POINTER);
  const reduce = useReducedMotion();
  const x = useSpring(-800, { stiffness: 110, damping: 24, mass: 0.6 });
  const y = useSpring(-800, { stiffness: 110, damping: 24, mass: 0.6 });
  const on = fine && !reduce;
  useEffect(() => {
    if (!on) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, [on, x, y]);
  if (!on) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[1] size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.14] mix-blend-screen"
      style={{ x, y, background: "radial-gradient(closest-side, var(--color-portal), transparent)" }}
    />
  );
}

/* ------------------------------------------------------------- wordmark */

/** The cafe's name stretched edge to edge; letters rise in and hop on hover. */
export function Wordmark({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const b = box.current;
      const l = line.current;
      if (!b || !l) return;
      const current = parseFloat(getComputedStyle(l).fontSize) || 100;
      const w = l.scrollWidth;
      if (w > 0) l.style.fontSize = `${(current * b.clientWidth) / w}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={box} className="w-full">
      <motion.p
        ref={line}
        aria-label={text}
        className="w-max whitespace-nowrap font-display font-bold leading-[0.82] tracking-[-0.04em]"
        style={{ fontSize: "11vw" }}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "0px 0px -5% 0px" }}
        variants={{ show: { transition: { staggerChildren: 0.035 } } }}
      >
        {[...text].map((ch, i) => (
          <span key={i} aria-hidden className="-mt-[0.16em] inline-block overflow-hidden pb-[0.08em] pt-[0.16em] align-bottom">
            <motion.span
              className="wordmark-letter inline-block"
              variants={{
                hidden: { y: "105%" },
                show: { y: "0%", transition: { type: "spring", stiffness: 160, damping: 18 } },
              }}
              whileHover={{ y: "-9%", transition: { type: "spring", stiffness: 420, damping: 14 } }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          </span>
        ))}
      </motion.p>
    </div>
  );
}
