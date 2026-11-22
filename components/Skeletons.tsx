// Static loading shells, prerendered and shown while request-time data streams in.
import { GameLoader, LOADER_TIPS } from "@/components/loading/GameLoader";

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-panel ${className}`} />;
}

export function BookSkeleton() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-8 sm:pt-14" aria-busy>
      <p className="text-muted">Loading…</p>
      <div className="mt-8 space-y-6">
        <Block className="h-16" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Block className="h-20" />
          <Block className="h-20" />
          <Block className="h-20" />
        </div>
        <Block className="h-40" />
      </div>
    </main>
  );
}

/** Shown while the session is checked: the same screen the sign-in warp ends on. */
export function StaffShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy>
      <header className="h-14 border-b border-line bg-void/85">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center px-3 sm:px-5">
          <span className="h-7 w-32 animate-pulse rounded-lg bg-panel" />
        </div>
      </header>
      <PageSkeleton label="Loading dashboard" />
    </div>
  );
}

export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <main
      className="mx-auto grid min-h-[calc(100dvh-8rem)] w-full max-w-[1600px] place-items-center px-3 py-10 sm:min-h-[calc(100dvh-3.5rem)] sm:px-5"
      aria-busy
    >
      <GameLoader label={label} tips={LOADER_TIPS[label]} />
    </main>
  );
}
