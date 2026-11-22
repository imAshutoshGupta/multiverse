"use client";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { GameLoader } from "./GameLoader";

/**
 * Full-screen "warp" shown while the app jumps to another area (signing in or
 * out). It covers the old page until that page unmounts, and looks like the
 * loading screen on the other side, so the hand-off is seamless.
 * Rendered into <body> so a transformed or blurred parent can't trap it.
 */
export function WarpOverlay({ show, label, kicker, tips }: { show: boolean; label: string; kicker?: string; tips?: string[] }) {
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  // Opened after a click, so this only bails out if misused during server render
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <div className="warp-overlay cosmos fixed inset-0 z-[100] grid place-items-center overflow-hidden px-6">
      <div aria-hidden className="warp-burst pointer-events-none absolute left-1/2 top-1/2 size-[140vmax] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div aria-hidden className="warp-streaks pointer-events-none absolute inset-0" />
      <GameLoader label={label} kicker={kicker} tips={tips} className="relative" />
    </div>,
    document.body,
  );
}
