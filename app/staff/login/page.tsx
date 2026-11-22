import type { Metadata } from "next";
import { SetupNotice } from "@/components/SetupNotice";
import { LoginForm } from "@/components/staff/LoginForm";
import { ThemeStyle } from "@/components/brand/ThemeStyle";
import { Logo } from "@/components/book/Landing";
import { getPublicCatalog, isCatalog } from "@/lib/publicCatalog";
import { isConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Staff login" };

export default async function LoginPage() {
  if (!isConfigured) return <SetupNotice />;
  const catalog = await getPublicCatalog();
  const s = isCatalog(catalog) ? catalog.settings : undefined;
  return (
    <main className="cosmos flex min-h-dvh w-full flex-1 flex-col justify-center px-6 py-16">
      {s && <ThemeStyle theme={s} />}
      <div className="mx-auto w-full max-w-sm">
      <Logo src={s?.logo_url ?? null} name={s?.cafe_name ?? "The Multiverse"} size={48} />
      <h1 className="mt-5 font-display text-3xl font-bold">{s?.cafe_name ?? "The Multiverse"}</h1>
      <p className="mb-8 mt-1 text-muted">Staff sign in</p>
      <LoginForm />
      </div>
    </main>
  );
}
