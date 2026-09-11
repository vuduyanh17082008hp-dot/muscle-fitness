import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/animation/reveal";
import { PageVisual } from "@/components/visual/page-visual";

export const metadata: Metadata = {
  title: "AI Coach | Muscle Fitness",
};

export default function CoachPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6">
      <Reveal>
        <section className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-8">
          <PageVisual page="dante" />

          <div className="relative z-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-500">
              AI Coach
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight">
              Personal coaching guidance
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">
              Use the coach chat for general training and nutrition
              questions. Answers are educational only and are not
              medical advice. For authenticated dashboard access, open
              AI Coach from your client dashboard.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/chatbot"
                className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
              >
                Open coach chat
              </Link>

              <Link
                href="/dashboard/ai-coach"
                className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
              >
                Dashboard AI Coach
              </Link>

              <Link
                href="/login"
                className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </Reveal>
    </main>
  );
}
