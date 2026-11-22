import "server-only";
import { connection } from "next/server";
import { istDate } from "./time";

/**
 * Today's IST date for server rendering. With Cache Components, reading the
 * clock during a prerender or prefetch is an error ("blocking-prerender-current-time"),
 * so this marks the render as request-time first. Server code that needs
 * "today" should get it here rather than calling istDate() / new Date() directly.
 */
export async function requestToday(): Promise<string> {
  await connection();
  return istDate();
}
