"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Dumbbell, Flame, Footprints } from "lucide-react";

import { Reveal } from "@/components/animation/reveal";
import { DanteMascot } from "@/components/dante/dante-mascot";
import type { DanteRobotState } from "@/components/dante/dante-robot";

/**
 * "The First Rep" — condensed per the homepage refinement brief:
 * short headline, one supporting paragraph, one quote, three one-line
 * milestones. The fuller telling lives at /story, reachable via
 * "Read the full story" below.
 *
 * Layout: the full narrative (headline -> paragraph -> quote ->
 * milestones -> CTA) reads as ONE continuous left-hand column in
 * normal document flow — no row-spanning grid tricks. Dante sits in
 * a single, self-contained card on the right, sized to support the
 * story rather than dominate it (spec: "do not let the mascot
 * overpower the copy"). This also removes the old height-matching
 * grid (row-span-2 avatar beside two independently-sized text blocks)
 * that was the actual source of layout fragility here.
 */

const milestones = [
  { icon: Footprints, label: "Start", text: "One reason to return tomorrow." },
  { icon: Dumbbell, label: "Discover", text: "Strength changed the goal." },
  { icon: Flame, label: "Forward", text: "Keep moving." },
] as const;

const WAVE_HOLD_MS = 2600;

export function InspirationStory() {
  const [danteState, setDanteState] = useState<DanteRobotState>("idle");
  const waveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleFirstView() {
    setDanteState("success");
    waveTimeout.current = setTimeout(() => {
      setDanteState("idle");
    }, WAVE_HOLD_MS);
  }

  return (
    <section
      id="inspiration"
      className="relative overflow-hidden border-y border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg-deep)] px-5 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div aria-hidden="true" className="section-grid" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(216,255,32,0.1),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(255,255,255,0.05),transparent_26%)]"
      />

      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_0.7fr] lg:items-start lg:gap-16">
          {/* STORY — one continuous column: headline, paragraph, quote,
              milestones, CTA. Nothing here depends on the height of the
              Dante card beside it. */}

          <Reveal duration={0.8} y={16}>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-[var(--mf-brand)]">
              The First Rep
            </p>

            <h2 className="mt-5 max-w-2xl text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              The mirror did not change first.
              <span className="mt-2 block text-zinc-600">The person looking into it did.</span>
            </h2>

            <p className="mt-6 max-w-xl text-base leading-8 text-[var(--mf-pub-text-secondary)]">
              Progress did not begin with perfection. It began with one
              decision to return tomorrow — then a plan willing to change
              as the goal did.
            </p>

            <blockquote className="mt-8 border-l-2 border-[var(--mf-brand)] pl-5 text-xl font-bold leading-8 text-white">
              &ldquo;A pawn can be anything if it pushes forward.&rdquo;
            </blockquote>

            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3">
              {milestones.map((m) => (
                <div key={m.label} className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] text-[var(--mf-brand)]">
                    <m.icon className="size-4" />
                  </span>
                  <span className="text-sm font-semibold text-zinc-300">
                    <span className="mr-1.5 font-black uppercase tracking-[0.1em] text-[var(--mf-brand)]">
                      {m.label}
                    </span>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>

            <a
              href="/story"
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-zinc-500 transition hover:text-[var(--mf-brand)]"
            >
              Read the full story
              <ArrowRight className="size-4" />
            </a>
          </Reveal>

          {/* DANTE — a single self-contained card, sized to support the
              story rather than dominate it. Greets once with a "success"
              pose the first time it scrolls into view, then settles. */}

          <Reveal delay={0.15} y={16}>
            <motion.div
              onViewportEnter={handleFirstView}
              viewport={{ once: true, amount: 0.4 }}
              className="rounded-[28px] border border-[var(--mf-pub-border)] bg-[var(--mf-pub-surface)] p-8 text-center"
            >
              <DanteMascot state={danteState} size="lg" interactive />

              <p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--mf-violet)]">
                Dante
              </p>

              <p className="mt-1.5 text-sm leading-6 text-[var(--mf-pub-text-secondary)]">
                Still here for every rep after the first one.
              </p>
            </motion.div>
          </Reveal>
        </div>

        <div className="mt-14 flex flex-col items-start gap-6 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">
            Today is <span className="text-[var(--mf-brand)]">the youngest you will ever be.</span>
          </p>

          <a
            href="#discipline"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-[var(--mf-brand)]"
          >
            Keep moving
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export default InspirationStory;
