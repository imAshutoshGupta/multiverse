"use client";
import { useEffect, useRef, useState } from "react";
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
  const tabsRef = useRef<HTMLUListElement>(null);
  // Phones: the tab row scrolls sideways; keep the open tab in view (without moving the page)
  const revealTab = (el: HTMLElement | null | undefined, smooth: boolean) => {
    const ul = tabsRef.current;
    if (!ul || !el || ul.scrollWidth <= ul.clientWidth) return;
    const left = el.getBoundingClientRect().left - ul.getBoundingClientRect().left + ul.scrollLeft - 16;
    ul.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    revealTab(tabsRef.current?.querySelector<HTMLElement>('[aria-current="page"]'), false);
  }, []);
  const select = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, "", `/staff/settings?tab=${id}`);
  };
  return (
    // minmax(0, …) stops the long tab row from widening the page on phones (it scrolls instead)
    <main className="mx-auto grid w-full max-w-6xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <h1 className="mb-3 font-display text-2xl font-semibold">Settings</h1>
        <ul ref={tabsRef} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {TABS.map(({ id, label, icon: Icon }) => (
            <li key={id} className="shrink-0">
              <button
                onClick={(e) => {
                  select(id);
                  revealTab(e.currentTarget, true);
                }}
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
