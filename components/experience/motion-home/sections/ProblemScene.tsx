"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { TiltCard } from "@/components/experience/motion-home/interaction/TiltCard";

const PROBLEMS = [
  "Generic workout plans that ignore the individual.",
  "Contradictory nutrition and supplement advice.",
  "Training, food and recovery tracked in separate systems.",
  "Expensive coaching that is difficult to access consistently.",
] as const;

export function ProblemScene() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
        const { reduceMotion } = context.conditions as { reduceMotion: boolean };

        if (reduceMotion) {
          gsap.set(".problem-line, .problem-card", { opacity: 1, y: 0, clipPath: "inset(0 0 0 0)" });
          return;
        }

        gsap.timeline({
          scrollTrigger: { trigger: rootRef.current, start: "top 75%", end: "top 30%", scrub: 0.6 },
        })
          .fromTo(".problem-line", { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.1, ease: ease.heavy })
          .fromTo(
            ".problem-card",
            { clipPath: "inset(0 0 100% 0)", opacity: 0 },
            { clipPath: "inset(0 0 0% 0)", opacity: 1, stagger: 0.07, ease: ease.precise },
            "-=0.3",
          );

        // Fragmentation exit — headline and cards break apart differently.
        gsap.timeline({
          scrollTrigger: { trigger: rootRef.current, start: "bottom 85%", end: "bottom 25%", scrub: 0.6 },
        })
          .to(".problem-line", { xPercent: (i) => (i % 2 === 0 ? -8 : 8), opacity: 0, ease: "none" }, 0)
          .to(
            ".problem-card",
            {
              y: (i) => (i % 2 === 0 ? -40 : 40),
              scale: 0.92,
              opacity: 0,
              stagger: 0.04,
              ease: "none",
            },
            0,
          );
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="problem"
      data-chapter="problem"
      className="relative bg-[var(--mf-pub-bg-deep)] px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <div className="border-l-4 border-[var(--mf-brand)] pl-6 sm:pl-8">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.32em] text-[var(--mf-brand)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-brand)]" aria-hidden="true" />
            The Problem
          </p>

          <h2 className="mt-5 max-w-4xl font-heading text-5xl font-black uppercase leading-[0.9] tracking-[-0.03em] text-[var(--mf-pub-text)] sm:text-6xl lg:text-7xl">
            <span className="problem-line block overflow-hidden"><span className="block">Fitness advice is everywhere.</span></span>
            <span className="problem-line block overflow-hidden"><span className="block text-[var(--mf-pub-text-secondary)]">Personalized guidance isn&apos;t.</span></span>
          </h2>
        </div>

        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:mt-16">
          {PROBLEMS.map((problem) => (
            <div key={problem} className="problem-card">
              <TiltCard className="h-full rounded-2xl border border-white/12 bg-white/[0.04] p-5 transition-colors hover:border-white/20">
                <p className="text-sm leading-6 text-[var(--mf-pub-text-secondary)]">{problem}</p>
              </TiltCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
