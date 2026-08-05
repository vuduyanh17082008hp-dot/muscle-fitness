"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Dumbbell,
  RefreshCw,
} from "lucide-react";

type WorkoutsErrorProps = {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
};

export default function WorkoutsError({
  error,
  reset,
}: WorkoutsErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error("Workout page error:", {
      name: error.name,
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  function handleReturnToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070707] px-4 py-12 text-white">
      {/* Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px]" />

        <div className="absolute left-1/2 top-[-220px] h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-red-500/10 blur-[140px]" />

        <div className="absolute bottom-[-280px] right-[-180px] h-[550px] w-[550px] rounded-full bg-orange-500/[0.08] blur-[150px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(7,7,7,0.88)_76%)]" />
      </div>

      <section className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-white/10 bg-[#0d0d0d]/95 shadow-[0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur-xl">
        {/* Top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-red-600 via-orange-400 to-transparent" />

        <div className="p-6 sm:p-10">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-500/20 bg-orange-500/10">
              <Dumbbell
                aria-hidden="true"
                className="h-5 w-5 text-orange-400"
              />
            </span>

            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em]">
                Muscle Fitness
              </p>

              <p className="mt-1 text-xs text-zinc-600">
                Workout Management System
              </p>
            </div>
          </div>

          {/* Error icon */}
          <div className="mt-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.1)]">
            <AlertTriangle
              aria-hidden="true"
              className="h-8 w-8 text-red-400"
            />
          </div>

          {/* Main message */}
          <p className="mt-7 text-xs font-black uppercase tracking-[0.28em] text-red-400">
            Workout system error
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            Something went wrong
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-500 sm:text-base">
            The workout system could not complete your request.
            Your account and saved information have not been
            removed. Try loading this section again.
          </p>

          {/* Development error information */}
          {process.env.NODE_ENV === "development" ? (
            <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-300">
                Development error
              </p>

              <p className="mt-3 break-words font-mono text-sm leading-6 text-red-200/80">
                {error.message || "Unknown workout error"}
              </p>

              {error.digest ? (
                <p className="mt-3 break-all font-mono text-xs text-zinc-600">
                  Error ID: {error.digest}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
              <p className="text-sm leading-6 text-zinc-500">
                An unexpected error occurred while loading your
                workouts. Use the retry button below to recover.
              </p>

              {error.digest ? (
                <p className="mt-3 break-all font-mono text-xs text-zinc-700">
                  Reference: {error.digest}
                </p>
              ) : null}
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => reset()}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-orange-400 px-6 text-sm font-black uppercase tracking-[0.12em] text-black transition hover:bg-orange-300 focus:outline-none focus:ring-4 focus:ring-orange-500/20"
            >
              <RefreshCw
                aria-hidden="true"
                className="h-4 w-4 transition-transform duration-300 group-hover:rotate-180"
              />

              Try again
            </button>

            <button
              type="button"
              onClick={handleReturnToDashboard}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-bold text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
            >
              <ArrowLeft
                aria-hidden="true"
                className="h-4 w-4"
              />

              Return to dashboard
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}