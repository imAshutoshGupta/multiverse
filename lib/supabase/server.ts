import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { connection } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/** One client per request (cache()), so concurrent callers share one session/refresh. */
export const supabaseServer = cache(async () => {
  // Signed-in data depends on the request and the clock (the auth client checks
  // token expiry with Date.now()), so never prerender or runtime-prefetch it.
  await connection();
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: proxy.ts refreshes the session instead.
        }
      },
    },
  });
});

export type StaffProfile = { user_id: string; display_name: string | null; role: "owner" | "staff" };

/**
 * Current user + staff profile (null if not signed in / not staff).
 *
 * Wrapped in cache() so the layout, the page and loadCatalog() share one result
 * per request. getClaims() verifies the session JWT locally against the
 * project's signing keys (ES256) instead of a round trip to Supabase Auth
 * like getUser(); it still refreshes an expired session.
 */
export const getStaff = cache(async () => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { supabase, user: null, profile: null };
  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? null };
  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("user_id, display_name, role")
    .eq("user_id", user.id)
    .maybeSingle();
  return { supabase, user, profile: profile as StaffProfile | null };
});
