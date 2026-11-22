// Game-style loading screens. Pure CSS (no hooks), so they work as Suspense
// fallbacks in the prerendered shell and show before any JavaScript runs.
import { Gamepad2 } from "lucide-react";

// Local copy: the one in components/ui is a client module, not callable from server components
const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const SEGMENTS = 12;

/** Per-page tips, like a game's loading screen. */
export const LOADER_TIPS: Record<string, string[]> = {
  "Loading dashboard": [
    "Tap any empty slot on the dashboard to add a booking.",
    "Use the arrows by the date to flip between days.",
    "Dashed amber blocks are requests waiting to be confirmed.",
  ],
  "Loading requests": [
    "Confirm a request and the customer gets a WhatsApp message.",
    "Decline with a note so the customer knows why.",
    "New requests pop in here live, no refresh needed.",
  ],
  "Crunching stats": [
    "The Excel report has every booking, payment and customer.",
    "Tap the Due card to see who still owes money.",
    "Quick ranges like Last 7 days are one tap away.",
  ],
  "Loading settings": [
    "Branding changes show on the booking page straight away.",
    "Switch a station off instead of deleting it.",
    "Add holidays under Hours to pause online booking.",
  ],
};

const DEFAULT_TIPS = LOADER_TIPS["Loading dashboard"];

/** The spinning portal with a controller at its core. */
function Portal({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("gl-portal relative grid size-24 place-items-center", className)}>
      <span className="gl-ring absolute inset-0 rounded-full" />
      <span className="gl-ring-dash absolute inset-[14%] rounded-full border border-dashed border-rift/45" />
      <span className="gl-orbit absolute inset-0">
        <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-rift shadow-[0_0_12px_var(--color-rift)]" />
      </span>
      <span className="gl-core absolute inset-[30%] rounded-full bg-portal/30 blur-md" />
      <Gamepad2 className="relative size-7 text-ink drop-shadow-[0_0_10px_var(--color-portal)]" />
    </div>
  );
}

/** Retro segmented bar whose blocks light up one after another, on a loop. */
export function SegmentBar({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex gap-1", className)}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className="gl-seg h-2 flex-1 rounded-[2px] bg-tint/10"
          style={{ animationDelay: `${(i * 1.4) / SEGMENTS}s` }}
        />
      ))}
    </div>
  );
}

/**
 * Full loading screen: portal, "LOADING …" title, block bar and rotating tips,
 * like a game between levels. `label` names what is loading.
 */
export function GameLoader({
  label = "Loading",
  kicker,
  tips = DEFAULT_TIPS,
  className,
}: {
  label?: string;
  /** Short status line above the title, e.g. "Player verified". */
  kicker?: string;
  tips?: string[];
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("gl-enter flex flex-col items-center text-center", className)}>
      <Portal />
      {kicker && (
        <p className="mt-6 -mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_var(--color-emerald-400)]" aria-hidden />
          {kicker}
        </p>
      )}
      <p className="mt-6 font-display text-sm font-bold uppercase tracking-[0.28em] text-ink">
        {label}
        <span className="gl-dots" aria-hidden />
      </p>
      <SegmentBar className="mt-4 w-56" />
      {tips.length > 0 && (
        <div className="mt-5 grid max-w-xs text-xs text-muted" aria-hidden>
          {tips.slice(0, 3).map((t, i) => (
            <p key={t} className="gl-tip [grid-area:1/1]" style={{ animationDelay: `${i * 3}s` }}>
              <span className="font-semibold text-rift">Tip · </span>
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small inline loader for a part of a page (a list, a panel) that is still fetching. */
export function LoadingStrip({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "gl-enter flex flex-col items-center justify-center gap-3 rounded-2xl border border-line/70 bg-panel/60 px-6 py-8",
        className,
      )}
    >
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-muted">
        {label}
        <span className="gl-dots" aria-hidden />
      </p>
      <SegmentBar className="w-40" />
    </div>
  );
}
