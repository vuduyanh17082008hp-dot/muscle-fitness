"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Dumbbell, Flame, Footprints } from "lucide-react";

import { Reveal } from "@/components/animation/reveal";
import { DanteAvatar } from "@/components/dante-avatar/dante-avatar";

/**
 * "The First Rep" — condensed per the homepage refinement brief:
 * short headline (kept from the previous version — already strong
 * and short), one supporting paragraph, one quote, three one-line
 * milestones. The previous version carried 4 narrative paragraphs +
 * 4 milestone cards with their own descriptive sentences; the fuller
 * telling now lives at /story (see app/story/page.tsx) rather than
 * being deleted outright, reachable via "Read the full story" below.
 *
 * This is also Dante's "significant visual space" appearance (spec
 * Part D, appearance B): he gets roughly 40% of the section's width
 * on desktop and greets the visitor with a one-time wave the first
 * time this section scrolls into view (see handleFirstView below),
 * then settles into idle breathing — never loops the wave.
 */

const milestones = [
  { icon: Footprints, label: "Start", text: "One reason to return tomorrow." },
  { icon: Dumbbell, label: "Discover", text: "Strength changed the goal." },
  { icon: Flame, label: "Forward", text: "Keep moving." },
] as const;

const WAVE_HOLD_MS = 2600;

export function InspirationStory() {
  const [dantePose, setDantePose] = useState<"idle_breathing" | "wave">("idle_breathing");
  const waveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFirstView = useCallback(() => {
    setDantePose("wave");
    waveTimeout.current = setTimeout(() => {
      setDantePose("idle_breathing");
    }, WAVE_HOLD_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (waveTimeout.current) clearTimeout(waveTimeout.current);
    };
  }, []);

  return (
    <section
      id="inspiration"
      className="relative overflow-hidden border-y border-white/10 bg-[#090909] px-5 py-20 sm:px-6 lg:px-8 lg:py-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(255,255,255,0.05),transparent_26%)]"
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Mobile stacks in DOM order (headline -> Dante -> quote/
            milestones), matching the "headline, short message, Dante,
            CTA" mobile guidance. Desktop places all three explicitly
            into a 2-column grid instead — Dante spans the full height
            of the right column beside both story blocks. */}
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_auto] lg:gap-x-16 lg:gap-y-10">
          {/* LEAD-IN */}

          <Reveal duration={0.8} y={16} className="lg:col-start-1 lg:row-start-1">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-amber-400">
              The First Rep
            </p>

            <h2 className="mt-5 max-w-2xl text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
              The mirror did not change first.
              <span className="mt-2 block text-zinc-600">The person looking into it did.</span>
            </h2>

            <p className="mt-6 max-w-xl text-base leading-8 text-zinc-400">
              Progress did not begin with perfection. It began with one
              decision to return tomorrow — then a plan willing to change
              as the goal did.
            </p>
          </Reveal>

          {/* DANTE */}

          <Reveal
            delay={0.15}
            y={16}
            className="mx-auto w-full max-w-sm lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:mx-0 lg:max-w-none lg:self-start"
          >
            <div className="h-[260px] sm:h-[320px] lg:h-[460px]">
              <DanteAvatar pose={dantePose} onFirstView={handleFirstView} className="size-full" />
            </div>
          </Reveal>

          {/* QUOTE + MILESTONES */}

          <Reveal delay={0.1} y={16} className="lg:col-start-1 lg:row-start-2">
            <blockquote className="border-l-2 border-amber-400 pl-5 text-xl font-bold leading-8 text-white">
              &ldquo;A pawn can be anything if it pushes forward.&rdquo;
            </blockquote>

            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3">
              {milestones.map((m) => (
                <div key={m.label} className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-400">
                    <m.icon className="size-4" />
                  </span>
                  <span className="text-sm font-semibold text-zinc-300">
                    <span className="mr-1.5 font-black uppercase tracking-[0.1em] text-amber-400">
                      {m.label}
                    </span>
                    {m.text}
                  </span>
                </div>
              ))}
            </div>

            <a
              href="/story"
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-zinc-500 transition hover:text-amber-400"
            >
              Read the full story
              <ArrowRight className="size-4" />
            </a>
          </Reveal>
        </div>

        <div className="mt-14 flex flex-col items-start gap-6 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-500">
            Today is <span className="text-amber-400">the youngest you will ever be.</span>
          </p>

          <a
            href="#discipline"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-amber-400"
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
