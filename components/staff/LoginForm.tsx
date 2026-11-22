"use client";
import { ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Phase = "idle" | "busy" | "done";

// 16px text on phones so iOS Safari doesn't zoom in when a field is focused
const INPUT =
  "peer h-12 w-full rounded-xl border border-line bg-void/60 pl-11 pr-3 text-base text-ink placeholder:text-muted/50 outline-none transition focus:border-portal focus:bg-void/80 focus:ring-4 focus:ring-portal/20 read-only:opacity-70 sm:text-sm";
const ICON =
  "pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted transition peer-focus:text-portal";

export function LoginForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [reveal, setReveal] = useState(false);
  const [caps, setCaps] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Coming back with the browser's Back button can restore this page from cache,
  // frozen on "Signing in…". Reset it so the form is usable again.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => e.persisted && setPhase("idle");
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (phase !== "idle") return;
    // Read straight from the form: password managers and autofill don't always tell React
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setPhase("busy");
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
      setErrorKey((k) => k + 1);
      setPhase("idle");
      requestAnimationFrame(() => passwordRef.current?.select());
      return;
    }
    setPhase("done");
    router.replace("/staff");
    router.refresh();
  }

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  const locked = phase !== "idle";

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted">Email</span>
        <span className="relative">
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            required
            readOnly={locked}
            className={INPUT}
          />
          <Mail className={ICON} aria-hidden />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between text-[13px] font-medium text-muted">
          Password
          {caps && <span className="text-xs font-semibold text-rift">Caps Lock is on</span>}
        </span>
        <span className="relative">
          <input
            ref={passwordRef}
            name="password"
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            readOnly={locked}
            onKeyUp={checkCaps}
            onKeyDown={checkCaps}
            onBlur={() => setCaps(false)}
            className={cn(INPUT, "pr-12")}
          />
          <LockKeyhole className={ICON} aria-hidden />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-tint/5 hover:text-ink"
          >
            {reveal ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </span>
      </label>

      {error && (
        <p
          key={errorKey}
          role="alert"
          className="login-shake rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        aria-disabled={locked}
        aria-busy={phase === "busy"}
        className={cn(
          "btn-shine group mt-1 inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-base font-semibold shadow-[0_10px_30px_-10px_var(--color-portal)] transition active:scale-[0.98]",
          phase === "done" ? "bg-emerald-500 text-white" : "bg-portal text-on-portal hover:bg-portal-strong",
          locked && "cursor-default",
        )}
      >
        {phase === "busy" ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
            Signing in
          </>
        ) : phase === "done" ? (
          <>
            <Check className="size-5" aria-hidden />
            Opening the board
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="size-[18px] transition group-hover:translate-x-0.5" aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
