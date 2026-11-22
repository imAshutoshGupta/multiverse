"use server";
import { refresh, updateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/publicCatalog";
import { getStaff } from "@/lib/supabase/server";

/**
 * After a settings write: expire the cached public catalogue (owners only) and re-render the
 * current page. Either call ships the fresh page in this action's response, so callers don't
 * need a separate router.refresh().
 */
export async function refreshCatalog() {
  const { profile } = await getStaff();
  if (profile?.role === "owner") updateTag(CATALOG_TAG);
  else refresh();
}
