"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type State = "idle" | "loading" | "done";

/** Start the bar for a navigation done in code (router.push and friends). */
export function startNavProgress() {
  window.dispatchEvent(new Event("nav-progress:start"));
}

/**
 * A thin glowing "XP bar" across the top while the next page is on its way.
 * Starts on an internal link click or a page-changing form submit, finishes
 * when the URL changes. Mount it inside <Suspense> (it reads search params).
 */
export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<State>("idle");
  const timers = useRef<number[]>([]);
  const first = useRef(true);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // The URL changed: fill the bar and fade it out
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clear();
    setState((s) => (s === "loading" ? "done" : s));
    timers.current.push(window.setTimeout(() => setState("idle"), 450));
  }, [path, search]);

  useEffect(() => {
    const start = () => {
      clear();
      setState("loading");
      // Never hang around if the navigation is abandoned
      timers.current.push(window.setTimeout(() => setState("idle"), 12000));
    };

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      // Same page (or only the #hash differs): nothing to load
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };

    // Plain GET forms (like the Analytics filters) load a new page
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement;
      if ((form.method || "get").toLowerCase() !== "get" || form.target === "_blank") return;
      start();
    };

    const onShow = () => setState("idle");

    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("nav-progress:start", start);
    window.addEventListener("pageshow", onShow);
    return () => {
      clear();
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("nav-progress:start", start);
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[110] h-[3px]">
      <div className={state === "loading" ? "nav-xp nav-xp-run" : "nav-xp nav-xp-done"} />
    </div>
  );
}
