"use client";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * Phones: the extra filters sit behind a "More filters" toggle so the analytics
 * aren't pushed a screen down. From `sm` up they're always shown, in the parent grid.
 */
export function MoreFilters({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="col-span-2 flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-muted transition hover:text-ink sm:hidden"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        {open ? "Fewer filters" : "More filters"}
        {active > 0 && (
          <span className="grid min-w-5 place-items-center rounded-full bg-portal px-1.5 text-[11px] font-bold text-on-portal">{active}</span>
        )}
        <ChevronDown className={`ml-auto size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div className={`${open ? "contents" : "hidden"} sm:contents`}>{children}</div>
    </>
  );
}
