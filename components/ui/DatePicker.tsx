"use client";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { addDays, istDate } from "@/lib/time";

const WIDTH = 296; // px
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const monthFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
const longFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fieldFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
// Phones: half-width fields can't fit the year, so leave it out
const shortFieldFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

const utc = (date: string) => new Date(`${date}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const monthOf = (date: string) => date.slice(0, 7); // "YYYY-MM"
function shiftMonth(month: string, n: number) {
  const d = utc(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return monthOf(ymd(d));
}
/** Day `day` of `month`, clamped to that month's length. */
function dayIn(month: string, day: number) {
  const last = utc(`${shiftMonth(month, 1)}-01`);
  last.setUTCDate(0);
  return `${month}-${String(Math.min(day, last.getUTCDate())).padStart(2, "0")}`;
}
/** Six full weeks (Sunday first) covering the month. */
function monthGrid(month: string): string[] {
  const first = utc(`${month}-01`);
  const start = addDays(`${month}-01`, -first.getUTCDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export type TriggerProps = {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  "aria-haspopup": "dialog";
  "aria-expanded": boolean;
};

/**
 * App-styled date picker: a calendar popover opened from any trigger.
 * Dates are "YYYY-MM-DD" (IST business dates). `closed` marks days the shop is shut.
 */
export function DatePicker({
  value,
  onChange,
  trigger,
  closed,
  min,
  label = "Pick a date",
}: {
  /** "YYYY-MM-DD", or "" for none yet */
  value: string;
  onChange: (date: string) => void;
  trigger: (props: TriggerProps) => ReactNode;
  closed?: Map<string, string | null>;
  /** Earliest date that can be picked */
  min?: string;
  label?: string;
}) {
  const today = istDate();
  const start = value || (min && min > today ? min : today);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthOf(start));
  const [focus, setFocus] = useState(start);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false); // move DOM focus to `focus` after the next render
  const uid = useId();
  const tooEarly = (d: string) => Boolean(min && d < min);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(WIDTH, window.innerWidth - 16);
    // Centre under the trigger, kept on screen
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    setPos({ top: r.bottom + 8, left });
  }, []);

  const show = () => {
    setMonth(monthOf(start));
    setFocus(start);
    focusDay.current = true;
    place();
    setOpen(true);
  };
  const hide = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);
  const choose = (d: string) => {
    if (tooEarly(d)) return;
    if (d !== value) onChange(d);
    hide();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) hide(false);
    };
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, place, hide]);

  // Keyboard: keep DOM focus on the highlighted day
  useLayoutEffect(() => {
    if (!open || !focusDay.current) return;
    focusDay.current = false;
    pop.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus({ preventScroll: true });
  }, [open, focus, month]);

  const moveTo = (d: string) => {
    focusDay.current = true;
    setFocus(d);
    if (monthOf(d) !== month) setMonth(monthOf(d));
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const k = e.key;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (k === "Escape") {
      e.preventDefault();
      hide();
    } else if (k in step) {
      e.preventDefault();
      moveTo(addDays(focus, step[k]));
    } else if (k === "PageUp" || k === "PageDown") {
      e.preventDefault();
      moveTo(dayIn(shiftMonth(monthOf(focus), k === "PageUp" ? -1 : 1), Number(focus.slice(8))));
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      const dow = utc(focus).getUTCDay();
      moveTo(addDays(focus, k === "Home" ? -dow : 6 - dow));
    } else if (k === "Tab") {
      hide(false);
    }
  }

  const days = monthGrid(month);
  // Month arrows: the tabbable day follows into the new month (focus stays on the arrow)
  const flip = (n: number) => {
    const m = shiftMonth(month, n);
    setMonth(m);
    setFocus(dayIn(m, Number(focus.slice(8))));
  };

  return (
    <>
      {trigger({ ref: btn, onClick: () => (open ? hide() : show()), "aria-haspopup": "dialog", "aria-expanded": open })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ top: pos.top, left: pos.left, width: Math.min(WIDTH, window.innerWidth - 16) }}
            className="date-pop fixed z-[100] rounded-2xl border border-line bg-panel p-3 text-ink shadow-2xl shadow-black/60"
          >
            <div className="flex items-center gap-1">
              <div id={`${uid}-month`} className="min-w-0 flex-1 truncate pl-1 font-display text-base font-semibold" aria-live="polite">
                {monthFmt.format(utc(`${month}-01`))}
              </div>
              <button
                type="button"
                onClick={() => flip(-1)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-tint/5 hover:text-ink"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => flip(1)}
                className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-tint/5 hover:text-ink"
                aria-label="Next month"
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>

            <div role="grid" aria-labelledby={`${uid}-month`} className="mt-2">
              <div role="row" className="grid grid-cols-7">
                {WEEKDAYS.map((w) => (
                  <div key={w} role="columnheader" className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {w}
                  </div>
                ))}
              </div>
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} role="row" className="grid grid-cols-7 gap-y-0.5">
                  {days.slice(row * 7, row * 7 + 7).map((d) => {
                    const inMonth = monthOf(d) === month;
                    const isSel = d === value;
                    const isToday = d === today;
                    const shut = closed?.has(d);
                    const reason = closed?.get(d);
                    const off = tooEarly(d);
                    return (
                      <div key={d} role="gridcell" aria-selected={isSel} className="grid place-items-center">
                        <button
                          type="button"
                          data-date={d}
                          tabIndex={d === focus ? 0 : -1}
                          onClick={() => choose(d)}
                          aria-disabled={off || undefined}
                          aria-label={`${longFmt.format(utc(d))}${isToday ? ", today" : ""}${shut ? `, closed${reason ? `: ${reason}` : ""}` : ""}`}
                          title={shut ? `Closed${reason ? ` · ${reason}` : ""}` : undefined}
                          className={[
                            "relative grid size-9 cursor-pointer place-items-center rounded-xl text-sm tabular-nums outline-none transition",
                            "focus-visible:ring-2 focus-visible:ring-portal/60",
                            isSel
                              ? "bg-portal font-semibold text-on-portal shadow-lg shadow-portal/30"
                              : isToday
                                ? "font-semibold text-portal ring-1 ring-inset ring-portal/50 hover:bg-portal/10"
                                : inMonth
                                  ? "text-ink/90 hover:bg-tint/8"
                                  : "text-muted/40 hover:bg-tint/5 hover:text-muted",
                            shut && !isSel ? "text-muted line-through decoration-rose-400/60" : "",
                            off ? "pointer-events-none opacity-30" : "",
                          ].join(" ")}
                        >
                          {Number(d.slice(8))}
                          {shut && <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-rose-400" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3">
              {[
                [today, "Today"],
                [addDays(today, 1), "Tomorrow"],
              ]
                .filter(([d]) => !tooEarly(d))
                .map(([d, text]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => choose(d)}
                  className={[
                    "h-8 cursor-pointer rounded-lg border px-3 text-xs font-semibold transition",
                    d === value ? "border-portal/60 bg-portal/15 text-ink" : "border-line text-muted hover:border-portal/60 hover:text-ink",
                  ].join(" ")}
                >
                  {text}
                </button>
              ))}
              {closed && closed.size > 0 && (
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
                  <span aria-hidden className="size-1.5 rounded-full bg-rose-400" /> Closed
                </span>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Form field version: looks like an input, opens the calendar. Controlled (`value` + `onChange`)
 * or uncontrolled (`defaultValue`); with `name` it submits like <input type="date">.
 */
export function DateField({
  value,
  defaultValue = "",
  onChange,
  name,
  min,
  placeholder = "Pick a date",
  className,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (date: string) => void;
  name?: string;
  min?: string;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  return (
    <>
      <DatePicker
        value={current}
        min={min}
        label={ariaLabel}
        onChange={(d) => {
          if (value === undefined) setInner(d);
          onChange?.(d);
        }}
        trigger={(p) => (
          <button
            {...p}
            type="button"
            aria-label={ariaLabel ? `${ariaLabel}: ${current ? longFmt.format(utc(current)) : "not set"}` : undefined}
            className={[
              "flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 text-left text-sm outline-none transition",
              "hover:border-portal/50 focus-visible:border-portal focus-visible:ring-2 focus-visible:ring-portal/25",
              p["aria-expanded"] ? "border-portal ring-2 ring-portal/25" : "",
              className ?? "",
            ].join(" ")}
          >
            <span className={`min-w-0 flex-1 truncate ${current ? "text-ink" : "text-muted/60"}`}>
              {current ? (
                <>
                  <span className="sm:hidden">{shortFieldFmt.format(utc(current))}</span>
                  <span className="hidden sm:inline">{fieldFmt.format(utc(current))}</span>
                </>
              ) : (
                placeholder
              )}
            </span>
            <CalendarDays className="size-4 shrink-0 text-muted" aria-hidden />
          </button>
        )}
      />
      {name !== undefined && <input type="hidden" name={name} value={current} />}
    </>
  );
}
