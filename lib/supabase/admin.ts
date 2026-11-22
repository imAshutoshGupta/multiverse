import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

// Server-only key that bypasses RLS. Never expose it to the browser (no NEXT_PUBLIC_ prefix).
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const adminEnabled = Boolean(SUPABASE_URL && SECRET);

export function supabaseAdmin() {
  if (!adminEnabled) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
}
