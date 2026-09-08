import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dante | Muscle Fitness",
  description:
    "Meet Dante, the Muscle Fitness AI coaching intelligence — profile-aware training, nutrition and recovery guidance grounded in real client data and external evidence.",
};

export default function CoachPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6">
      <section className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-500">
          Dante &middot; Muscle Fitness Intelligence
        </p>

        <h1 className="mt-4 text-4xl font-black tracking-tight">
          Your training. Your data. Your coach.
        </h1>

        <p className="mt-4 text-sm leading-7 text-zinc-400">
          Dante reads your profile, your logged workouts, nutrition and
          recovery data, and combines it with external evidence — like USDA
          FoodData Central for food composition — to give personalized,
          practical guidance. It is a feature built into Muscle Fitness, not
          a generic chatbot bolted onto the site.
        </p>

        <p className="mt-4 text-sm leading-7 text-zinc-400">
          Answers are educational fitness guidance, not medical advice. Dante
          does not diagnose conditions or replace a qualified clinician. For
          authenticated dashboard access with your full profile context, open
          Dante from your client dashboard.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/ai-coach"
            className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            Open Dante chat
          </Link>

          <Link
            href="/ai-fair"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
          >
            How Dante works
          </Link>

          <Link
            href="/login"
            className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
