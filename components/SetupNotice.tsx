export function SetupNotice({ problem }: { problem?: { message: string } | null }) {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-semibold">{problem ? "Setup needs a step" : "Almost there"}</h1>
      <p className="mt-3 text-muted">
        {problem ? (
          problem.message
        ) : (
          <>
            Supabase isn&apos;t connected yet. Copy <code className="text-ink">.env.example</code> to{" "}
            <code className="text-ink">.env.local</code>, add your project URL and publishable key, then restart the
            server. See README.md.
          </>
        )}
      </p>
    </main>
  );
}
