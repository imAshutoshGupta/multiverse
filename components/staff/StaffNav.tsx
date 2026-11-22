"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/book/Landing";
import { Button, cn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await supabaseBrowser().auth.signOut();
        router.replace("/staff/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}

export function StaffNav({ isOwner, name, logo, cafe }: { isOwner: boolean; name: string; logo: string | null; cafe: string }) {
  const path = usePathname();
  const pending = usePendingCount();
  const links = [
    { href: "/staff", label: "Board" },
    { href: "/staff/requests", label: "Requests", badge: pending },
    { href: "/staff/bookings", label: "Bookings" },
    ...(isOwner ? [{ href: "/staff/settings", label: "Settings" }] : []),
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-void/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 sm:px-5">
        <Link href="/staff" className="mr-2 flex items-center gap-2 font-display text-base font-bold">
          <Logo src={logo} name={cafe} size={30} />
          <span className="hidden sm:inline">{cafe}</span>
        </Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {links.map((l) => {
            const active = l.href === "/staff" ? path === "/staff" : path.startsWith(l.href);
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
        <SignOutButton />
      </div>
    </header>
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
