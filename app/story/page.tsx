import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Dumbbell, Flame, Footprints, Gauge } from "lucide-react";

import { Logo } from "@/components/brand/logo";

/**
 * The full telling of "The First Rep" — moved here so the homepage's
 * version (components/home/inspiration-story.tsx) could be
 * condensed to a short headline, one paragraph, a quote and three
 * milestones without losing the fuller narrative outright. Linked
 * from the homepage's "Read the full story".
 */

export const metadata: Metadata = {
  title: "The First Rep",
  description: "The full story behind Muscle Fitness — why it started, and what changed along the way.",
};

const moments = [
  {
    icon: Footprints,
    label: "Start",
    title: "One small decision",
    text: "You do not need the perfect plan. You need one reason to return tomorrow.",
  },
  {
    icon: Gauge,
    label: "Resistance",
    title: "Progress slows",
    text: "Motivation fades. Progress stalls. Sometimes the answer is not quitting — the plan needs to change.",
  },
  {
    icon: Dumbbell,
    label: "Discovery",
    title: "Strength changes the goal",
    text: "The question changes from “How much can I lose?” to “What can I become?”",
  },
  {
    icon: Flame,
    label: "Forward",
    title: "Keep moving",
    text: "A pawn can be anything if it pushes forward.",
  },
] as const;

export default function StoryPage() {
  return (
    <main className="min-h-screen bg-mf-bg px-5 py-16 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Logo />

        <Link
          href="/#inspiration"
          className="mt-10 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 transition hover:text-amber-400"
        >
          <ArrowLeft className="size-3.5" />
          Back to homepage
        </Link>

        <p className="mt-8 text-xs font-black uppercase tracking-[0.3em] text-amber-400">
          The First Rep
        </p>

        <h1 className="mt-4 text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl">
          The mirror did not change first.
          <span className="mt-2 block text-zinc-600">The person looking into it did.</span>
        </h1>

        <div className="mt-8 space-y-5 text-base leading-8 text-zinc-400">
          <p>
            At first, the gym felt built for someone else. Progress looked
            distant, and confidence even further away.
          </p>
          <p>
            So the beginning stayed small: one walk, one session, one reason
            to return tomorrow.
          </p>
          <p>
            Then progress slowed. Motivation disappeared. Instead of
            quitting, the plan changed. Training became deliberate.
            Nutrition became intentional. Recovery began to matter.
          </p>
          <p className="font-semibold text-zinc-200">
            Eventually, the goal was no longer simply to look different. It
            was to become stronger, more capable, more disciplined — and
            more at peace with the person being built.
          </p>
        </div>

        <blockquote className="mt-9 border-l-2 border-amber-400 pl-5 text-xl font-bold leading-8 text-white">
          &ldquo;A pawn can be anything if it pushes forward.&rdquo;
        </blockquote>

        <div className="mt-14 grid gap-3 sm:grid-cols-2">
          {moments.map((moment, index) => (
            <article
              key={moment.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-400">
                  <moment.icon className="size-5" />
                </span>
                <span className="text-xs font-black tracking-[0.22em] text-zinc-700">
                  0{index + 1}
                </span>
              </div>
              <p className="mt-6 text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">
                {moment.label}
              </p>
              <h3 className="mt-2 text-xl font-black text-white">{moment.title}</h3>
              <p className="mt-3 text-sm leading-6 text-zinc-500">{moment.text}</p>
            </article>
          ))}
        </div>

        <p className="mt-14 border-t border-white/10 pt-8 text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">
          You will always wish you started sooner. But{" "}
          <span className="text-amber-400">today is the youngest you will ever be.</span>
        </p>
      </div>
    </main>
  );
}
