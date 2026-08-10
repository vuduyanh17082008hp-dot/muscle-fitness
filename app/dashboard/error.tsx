"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-lg flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.025] px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-white">
        Unable to load dashboard data
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Please try again. Your data is safe.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex rounded-full bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[var(--color-accent-light)]"
      >
        Try again
      </button>
    </div>
  );
}
