// Static loading shells, prerendered and shown while request-time data streams in.

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

export function StaffShellSkeleton() {
  return (
    <div className="flex flex-1 flex-col" aria-busy>
      <header className="h-14 border-b border-line bg-void/85">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center px-3 sm:px-5">
          <span className="h-7 w-32 animate-pulse rounded-lg bg-panel" />
        </div>
      </header>
      <PageSkeleton />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-4 sm:px-5" aria-busy>
      <Block className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Block className="h-20" />
        <Block className="h-20" />
        <Block className="h-20" />
        <Block className="h-20" />
      </div>
      <Block className="h-80" />
    </main>
  );
}
