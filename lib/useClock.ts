"use client";
import { useSyncExternalStore } from "react";

const TICK = 30_000;
const subscribe = (cb: () => void) => {
  const t = setInterval(cb, TICK);
  return () => clearInterval(t);
};
const getSnapshot = () => Math.floor(Date.now() / TICK) * TICK;
const getServerSnapshot = () => null;

/**
 * Current time (ms), ticking every 30s. Null during server render and hydration,
 * so time-dependent UI never mismatches between server and browser.
 */
export function useClock(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
