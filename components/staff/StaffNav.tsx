"use client";
import { CalendarRange, Inbox, ChartColumn, LogOut, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/book/Landing";
import { Button, cn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

/** `compact`: just an icon on phones, where the top bar is tight. */
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Sign out"
      className={cn(compact && "h-10 w-10 px-0 sm:h-8 sm:w-auto sm:px-3")}
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/staff/login");
        router.refresh();
      }}
    >
      {compact && <LogOut className="size-5 sm:hidden" aria-hidden />}
      <span className={cn(compact && "hidden sm:inline")}>Sign out</span>
    </Button>
  );
}

type NavLink = { href: string; label: string; icon: LucideIcon; badge?: number };

export function StaffNav({ isOwner, name, logo, cafe }: { isOwner: boolean; name: string; logo: string | null; cafe: string }) {
  const path = usePathname();
  const pending = usePendingCount();
  // One list drives both the top nav (wider screens) and the bottom tab bar (phones)
  const links: NavLink[] = [
    { href: "/staff", label: "Board", icon: CalendarRange },
    { href: "/staff/requests", label: "Requests", icon: Inbox, badge: pending },
    { href: "/staff/analytics", label: "Analytics", icon: ChartColumn },
    ...(isOwner ? [{ href: "/staff/settings", label: "Settings", icon: Settings }] : []),
  ];
  const isActive = (href: string) => (href === "/staff" ? path === "/staff" : path.startsWith(href));
  return (
    <>
    <header className="sticky top-0 z-30 border-b border-line bg-void/95 pt-[env(safe-area-inset-top)] sm:bg-void/85 sm:backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:px-5">
        <Link href="/staff" className="mr-2 flex min-w-0 items-center gap-2 font-display text-base font-bold">
          <Logo src={logo} name={cafe} size={30} />
          <span className="truncate">{cafe}</span>
        </Link>
        <nav className="hidden flex-1 gap-1 overflow-x-auto sm:flex">
          {links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition",
                  active ? "bg-tint/8 text-ink" : "text-muted hover:text-ink",
                )}
              >
                {l.label}
                {!!l.badge && (
                  <span className="grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950">
                    {l.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <span className="hidden max-w-40 truncate text-xs text-muted md:block">{name}</span>
        <div className="ml-auto sm:ml-0">
          <SignOutButton compact />
        </div>
      </div>
    </header>

    {/* Phones: app-style tab bar, always within thumb reach */}
    <nav
      aria-label="Staff"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-void/95 pb-[env(safe-area-inset-bottom)] sm:hidden"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
        {links.map((l) => {
          const active = isActive(l.href);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                active ? "text-ink" : "text-muted",
              )}
            >
              <span className={cn("relative grid h-8 w-14 place-items-center rounded-full transition-colors", active && "bg-portal/20 text-portal")}>
                <Icon className="size-5" aria-hidden />
                {!!l.badge && (
                  <span className="absolute -right-0.5 -top-1 grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-amber-950">
                    {l.badge}
                  </span>
                )}
              </span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
    </>
  );
}

/** Live count of pending online requests (for the nav badge). */
function usePendingCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;
    const load = async () => {
      const { count } = await sb
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gt("ends_at", new Date().toISOString());
      if (alive) setCount(count ?? 0);
    };
    load();
    const ch = sb
      .channel("nav-pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, load)
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, []);
  return count;
}
