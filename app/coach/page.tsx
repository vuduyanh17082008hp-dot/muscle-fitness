import type { Metadata } from "next";
import Link from "next/link";

import { Reveal } from "@/components/animation/reveal";
import { PageVisual } from "@/components/visual/page-visual";
import { DanteAvatar } from "@/components/dante-avatar/dante-avatar";

export const metadata: Metadata = {
  title: "Dante | Muscle Fitness",
};

export default function CoachPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-4 py-10 text-white sm:px-6">
      <Reveal>
        <section className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-8">
          <PageVisual page="dante" />

          <DanteAvatar
            appState="explanation"
            className="pointer-events-none absolute -right-6 top-0 hidden h-full w-64 sm:block"
          />

          <div className="relative z-10">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-500">
              Dante
            </p>

            <h1 className="mt-4 text-4xl font-black tracking-tight">
              Personal coaching guidance
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">
              Use Dante for general training and nutrition
              questions. Answers are educational only and are not
              medical advice. For authenticated dashboard access, open
              Dante from your client dashboard.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/chatbot"
                className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
              >
                Open Dante chat
              </Link>

              <Link
                href="/dashboard/ai-coach"
                className="rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-white/20"
              >
                Dante in dashboard
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
