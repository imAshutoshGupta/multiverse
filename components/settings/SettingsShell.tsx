"use client";
import { useState } from "react";
import { cn } from "@/components/ui";
import type { Closure, Game, Settings, Station, StationType } from "@/lib/types";
import { BrandingTab } from "./BrandingTab";
import { ContactTab } from "./ContactTab";
import { GamesTab } from "./GamesTab";
import { HoursTab } from "./HoursTab";
import { MessagesTab } from "./MessagesTab";
import { RulesTab } from "./RulesTab";
import { StaffTab } from "./StaffTab";
import { StationsTab } from "./StationsTab";
import { TABS, type TabId } from "./tabs";
import { WorldsTab } from "./WorldsTab";



export function SettingsShell({
  initialTab,
  settings,
  types,
  stations,
  games,
  closures,
  staffEnabled,
  rawgEnabled,
}: {
  initialTab: TabId;
  settings: Settings;
  types: StationType[];
  stations: Station[];
  games: Game[];
  closures: Closure[];
  staffEnabled: boolean;
  rawgEnabled: boolean;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const select = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", `/staff/settings?tab=${id}`);
  };
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
        <h1 className="mb-3 font-display text-2xl font-semibold">Settings</h1>
        <ul className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                onClick={() => select(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "flex h-10 w-full shrink-0 cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition",
                  tab === id ? "bg-portal text-on-portal" : "text-muted hover:bg-tint/5 hover:text-ink",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            </li>
          ))}
        </ul>
        <a href="/book" target="_blank" className="mt-4 hidden text-sm text-muted underline hover:text-ink lg:block">
          Open the booking page
        </a>
      </nav>
      <div className="min-w-0">
        {tab === "branding" && <BrandingTab settings={settings} />}
        {tab === "worlds" && <WorldsTab types={types} stations={stations} />}
        {tab === "stations" && <StationsTab stations={stations} types={types} />}
        {tab === "games" && <GamesTab games={games} types={types} rawgEnabled={rawgEnabled} />}
        {tab === "hours" && <HoursTab settings={settings} closures={closures} />}
        {tab === "rules" && <RulesTab settings={settings} />}
        {tab === "contact" && <ContactTab settings={settings} />}
        {tab === "messages" && <MessagesTab settings={settings} />}
        {tab === "staff" && <StaffTab enabled={staffEnabled} />}
      </div>
    </main>
  );
}
