import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/Skeletons";
import { SettingsShell } from "@/components/settings/SettingsShell";
import { parseTab } from "@/components/settings/tabs";
import { loadCatalog } from "@/lib/catalog";
import { rawgEnabled } from "@/lib/rawg";
import { adminEnabled } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ searchParams }: PageProps<"/staff/settings">) {
  return (
    <Suspense fallback={<PageSkeleton label="Loading settings" />}>
      <SettingsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SettingsContent({ searchParams }: Pick<PageProps<"/staff/settings">, "searchParams">) {
  const { tab } = await searchParams;
  const { settings, types, stations, games, closures, isOwner } = await loadCatalog();
  if (!isOwner) {
    return <main className="mx-auto max-w-md px-6 py-24 text-center text-muted">Only the owner can change settings.</main>;
  }
  const initialTab = parseTab(tab);
  return (
    <SettingsShell
      initialTab={initialTab}
      settings={settings}
      types={types}
      stations={stations}
      games={games}
      closures={closures}
      staffEnabled={adminEnabled}
      rawgEnabled={rawgEnabled}
    />
  );
}
