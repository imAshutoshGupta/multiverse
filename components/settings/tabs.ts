// Shared by the Settings page (server) and SettingsShell (client).
// Kept out of the "use client" file: server code can't read plain values exported from one.
import { CalendarClock, Gamepad2, Layers, MessageSquareText, Palette, Phone, SlidersHorizontal, Store, UserCog } from "lucide-react";

export const TABS = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "games", label: "Games & experiences", icon: Gamepad2 },
  { id: "worlds", label: "Worlds", icon: Layers },
  { id: "stations", label: "Stations", icon: Store },
  { id: "hours", label: "Hours & holidays", icon: CalendarClock },
  { id: "rules", label: "Booking rules", icon: SlidersHorizontal },
  { id: "contact", label: "Contact", icon: Phone },
  { id: "messages", label: "WhatsApp messages", icon: MessageSquareText },
  { id: "staff", label: "Staff", icon: UserCog },
] as const;
export type TabId = (typeof TABS)[number]["id"];

export function parseTab(v: string | string[] | undefined): TabId {
  const s = Array.isArray(v) ? v[0] : v;
  return TABS.find((t) => t.id === s)?.id ?? "branding";
}
