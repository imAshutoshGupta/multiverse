"use server";
import { updateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/publicCatalog";
import { getStaff } from "@/lib/supabase/server";

/** Refresh the cached public catalogue after the owner changes settings. */
export async function refreshCatalog() {
  const { profile } = await getStaff();
  if (profile?.role !== "owner") return;
  updateTag(CATALOG_TAG);
}
