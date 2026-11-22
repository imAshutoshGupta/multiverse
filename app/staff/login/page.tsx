import type { Metadata } from "next";
import { SetupNotice } from "@/components/SetupNotice";
import { LoginForm } from "@/components/staff/LoginForm";
import { ThemeStyle } from "@/components/brand/ThemeStyle";
import { Logo } from "@/components/book/Landing";
import { getPublicCatalog, isCatalog } from "@/lib/publicCatalog";
import { isConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Staff login" };

/** Slowly turning orbit rings, drawn behind the logo. */
function Orbits({ className }: { className?: string }) {
  return (
    <div aria-hidden className={className}>
      <div className="login-orbit absolute inset-0 rounded-full border border-portal/25" />
      <div className="login-orbit login-orbit-rev absolute inset-[14%] rounded-full border border-dashed border-rift/25" />
      <div className="login-orbit absolute inset-[30%] rounded-full border border-portal/35 [animation-duration:28s]">
        <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-rift shadow-[0_0_12px_var(--color-rift)]" />
      </div>
      <div className="absolute inset-[38%] rounded-full bg-portal/25 blur-3xl" />
    </div>
  );
}

export default async function LoginPage() {
  if (!isConfigured) return <SetupNotice />;
  const catalog = await getPublicCatalog();
  const s = isCatalog(catalog) ? catalog.settings : undefined;
  const name = s?.cafe_name ?? "The Multiverse";
  const logo = s?.logo_url ?? null;

  return (
    <main className="cosmos relative flex min-h-dvh w-full flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      {s && <ThemeStyle theme={s} />}

      {/* Background glow on phones (the desktop art panel carries its own) */}
      <Orbits className="pointer-events-none absolute -top-40 left-1/2 size-[34rem] -translate-x-1/2 opacity-60 lg:hidden" />

      <div className="login-rise relative grid w-full max-w-md overflow-hidden rounded-3xl border border-line/70 bg-panel/70 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.7)] backdrop-blur-xl lg:max-w-5xl lg:grid-cols-[1.1fr_1fr]">
        {/* Art panel (desktop) */}
        <section className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden border-r border-line/60 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklab,var(--color-portal)_28%,transparent),transparent_60%),radial-gradient(90%_70%_at_100%_100%,color-mix(in_oklab,var(--color-rift)_14%,transparent),transparent_60%)] p-10 lg:flex">
          <Orbits className="pointer-events-none absolute -bottom-24 -right-24 size-[30rem]" />
          <div className="relative flex items-center gap-3">
            <Logo src={logo} name={name} size={40} />
            <span className="font-display text-lg font-semibold">{name}</span>
          </div>
          <div className="relative max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rift">Staff console</p>
            <h2 className="mt-3 font-display text-4xl font-bold leading-[1.1]">
              Run the floor
              <br />
              from one screen.
            </h2>
            <p className="mt-4 text-muted">Today&apos;s board, new requests and payments, all in one place.</p>
          </div>
          <ul className="relative flex gap-2 text-xs text-muted">
            {["Board", "Requests", "Analytics"].map((t) => (
              <li key={t} className="rounded-full border border-line/80 bg-void/40 px-3 py-1">
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Form */}
        <section className="flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-12">
          <div className="mb-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <Logo src={logo} name={name} size={40} />
              <span className="font-display text-lg font-semibold">{name}</span>
            </div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">Sign in with the staff login the owner gave you.</p>
          </div>
          <LoginForm />
          <p className="mt-8 text-center text-xs text-muted/80">Forgot your password? Ask the owner to reset it in Settings.</p>
        </section>
      </div>
    </main>
  );
}
