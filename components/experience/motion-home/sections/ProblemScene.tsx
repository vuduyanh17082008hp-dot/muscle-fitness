"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, enterOnce } from "@/components/experience/motion-home/motion/motionTokens";
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
          gsap.set(".problem-line, .problem-card", { opacity: 1, y: 0 });
          return;
        }

        gsap.timeline({
          scrollTrigger: { trigger: rootRef.current, ...enterOnce },
        })
          .fromTo(".problem-line", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: ease.precise })
          .fromTo(
            ".problem-card",
            { opacity: 0, y: 16 },
            { opacity: 1, y: 0, duration: 0.4, stagger: 0.07, ease: ease.precise },
            "-=0.25",
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
      className="relative bg-[var(--mf-pub-bg-deep)] px-6 py-16 lg:px-12 lg:py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="border-l-4 border-[var(--mf-brand)] pl-6 sm:pl-8">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.32em] text-[var(--mf-brand)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-brand)]" aria-hidden="true" />
            The Problem
          </p>

          <h2 className="mt-5 max-w-4xl font-heading text-5xl font-black uppercase leading-[0.9] tracking-[-0.03em] text-[var(--mf-pub-text)] sm:text-6xl lg:text-7xl">
            <span className="problem-line block">Fitness advice is everywhere.</span>
            <span className="problem-line mt-2 block text-[var(--mf-pub-text-secondary)]">Personalized guidance isn&apos;t.</span>
          </h2>

          <p className="problem-line mt-6 max-w-2xl text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Generic plans ignore the person. Muscle Fitness exists so today&apos;s training, recovery and nutrition match today&apos;s body — not a template written for nobody in particular.
          </p>
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
