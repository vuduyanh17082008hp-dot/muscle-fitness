"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, enterOnce } from "@/components/experience/motion-home/motion/motionTokens";
import { LiquidSignalCanvas } from "@/components/experience/motion-home/training/LiquidSignalCanvas";
import type { HomepageRoutes, TrainingViewModel } from "@/components/experience/motion-home/data/homepageViewModel";

export function TrainingScene({
  training,
  routes,
}: {
  training: TrainingViewModel;
  routes: HomepageRoutes;
}) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
        const { reduceMotion } = context.conditions as { reduceMotion: boolean };

        if (reduceMotion) {
          gsap.set(".training-heading, .training-readout, .training-plate", { opacity: 1, y: 0 });
          return;
        }

        gsap.timeline({
          scrollTrigger: { trigger: rootRef.current, ...enterOnce },
        })
          .fromTo(".training-heading", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: ease.precise })
          .fromTo(".training-plate", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: ease.precise }, "-=0.25")
          .fromTo(".training-readout", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: ease.precise }, "-=0.2");
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="training"
      data-chapter="training"
      className="relative overflow-x-clip bg-[var(--mf-pub-bg)] px-6 py-16 lg:px-12 lg:py-24"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">04 · Train</p>

          <h2 className="training-heading mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            <span className="block">
              Train <span className="text-[var(--mf-brand)]">with intent.</span>
            </span>
          </h2>

          <div className="training-plate mt-10">
            <LiquidSignalCanvas />
          </div>

          <Link
            href={routes.training}
            className="mt-8 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--mf-brand)] transition hover:text-[var(--mf-brand-hover)]"
          >
            Open Training
          </Link>
        </div>

        <div className="training-readout rounded-[24px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mf-pub-text-muted)]">
            {training.hasLiveSession ? "Today's session" : "Illustrative session"}
          </p>

          <p className="mt-3 text-2xl font-black text-[var(--mf-pub-text)]">{training.sessionName}</p>
          <p className="mt-2 text-sm text-[var(--mf-pub-text-secondary)]">{training.focus}</p>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-2/3 rounded-full bg-[var(--mf-brand)]" />
          </div>

          <p className="mt-2 text-[11px] text-[var(--mf-pub-text-muted)]">{training.progressionNote}</p>
        </div>
      </div>
    </section>
  );
}
