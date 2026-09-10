import {
  ArrowRight,
  BriefcaseBusiness,
  Dumbbell,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";

export default function AccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-6 py-12 text-white">
      <div className="w-full max-w-4xl">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-black">
            <Dumbbell className="h-7 w-7" />
          </div>

          <p className="mt-6 text-xs font-semibold tracking-[0.2em] text-zinc-500">
            MUSCLE FITNESS
          </p>

          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Choose your portal
          </h1>

          <p className="mx-auto mt-3 max-w-xl leading-7 text-zinc-400">
            Access your personal fitness dashboard or manage your
            organisation through the Business Portal.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {/* CLIENT */}

          <Link
            href="/login"
            className="group rounded-3xl border border-white/10 bg-white/5 p-7 transition hover:border-white/20 hover:bg-white/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <UserRound className="h-6 w-6" />
            </div>

            <h2 className="mt-6 text-xl font-bold">
              Client Login
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Track workouts, nutrition, recovery, progress and
              access your AI fitness coach.
            </p>

            <div className="mt-7 flex items-center gap-2 text-sm font-semibold">
              Open Client Portal

              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* ADMIN */}

          <Link
            href="/admin/login"
            className="group rounded-3xl border border-white/10 bg-white/5 p-7 transition hover:border-white/20 hover:bg-white/10"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
              <BriefcaseBusiness className="h-6 w-6" />
            </div>

            <div className="mt-6 flex items-center gap-2">
              <h2 className="text-xl font-bold">
                Admin Login
              </h2>

              <ShieldCheck className="h-4 w-4 text-zinc-500" />
            </div>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Manage members, trainers, programs, analytics and
              AI-powered business insights.
            </p>

            <div className="mt-7 flex items-center gap-2 text-sm font-semibold">
              Open Business Portal

              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}