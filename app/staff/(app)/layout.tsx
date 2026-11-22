import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ThemeStyle } from "@/components/brand/ThemeStyle";
import { SetupNotice } from "@/components/SetupNotice";
import { StaffShellSkeleton } from "@/components/Skeletons";
import { SignOutButton, StaffNav } from "@/components/staff/StaffNav";
import { isConfigured } from "@/lib/supabase/env";
import { getPublicCatalog, isCatalog } from "@/lib/publicCatalog";
import { getStaff } from "@/lib/supabase/server";

export default async function StaffLayout({ children }: LayoutProps<"/staff">) {
  if (!isConfigured) return <SetupNotice />;
  // Branding is cached, so it's part of the instant shell. The session read
  // happens at request time, so it streams in behind a boundary.
  const result = await getPublicCatalog();
  if (result && !isCatalog(result)) return <SetupNotice problem={result} />;
  const catalog = isCatalog(result) ? result : null;
  return (
    <div className="cosmos flex min-h-dvh flex-col">
      {catalog && <ThemeStyle theme={catalog.settings} />}
      <Suspense fallback={<StaffShellSkeleton />}>
        <StaffGate logo={catalog?.settings.logo_url ?? null} cafe={catalog?.settings.cafe_name ?? "Multiverse"}>
          {children}
        </StaffGate>
      </Suspense>
    </div>
  );
}

async function StaffGate({ children, logo, cafe }: { children: React.ReactNode; logo: string | null; cafe: string }) {
  const { user, profile } = await getStaff();
  if (!user) redirect("/staff/login");
  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="font-display text-2xl font-semibold">Not a staff account</h1>
        <p className="mt-3 text-muted">
          {user.email} is signed in but hasn&apos;t been added as staff yet. Ask the owner to add you.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </main>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <StaffNav isOwner={profile.role === "owner"} name={profile.display_name ?? user.email ?? ""} logo={logo} cafe={cafe} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
