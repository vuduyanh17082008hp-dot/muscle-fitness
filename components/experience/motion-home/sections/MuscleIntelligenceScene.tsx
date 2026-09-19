"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { DanteRobot } from "@/components/dante/dante-robot";
import type {
  DanteViewModel,
  HomepageRoutes,
  MuscleViewModel,
} from "@/components/experience/motion-home/data/homepageViewModel";

/**
 * Scene 05 — Muscle Intelligence. Stacked "Muscle / Intelligence / System"
 * title with Dante anchoring the right side of the composition — Dante
 * here is purely presentational (DanteRobot idle state), same mascot used
 * everywhere else Dante appears, not a second implementation of it. Data
 * still comes from the same Training Intelligence engine
 * /dashboard/training-intelligence reads from.
 */
export function MuscleIntelligenceScene({
  muscle,
  dante,
  routes,
}: {
  muscle: MuscleViewModel;
  dante: DanteViewModel;
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
            gsap.set(".muscle-line, .muscle-fade, .muscle-dante", { opacity: 1, y: 0, scale: 1 });
            return;
          }

          gsap
            .timeline({
              scrollTrigger: { trigger: rootRef.current, start: "top 70%", end: "top 30%", scrub: 0.8 },
            })
            .fromTo(
              ".muscle-line",
              { yPercent: 100, opacity: 0 },
              { yPercent: 0, opacity: 1, stagger: 0.08, ease: ease.heavy },
            )
            .fromTo(".muscle-fade", { opacity: 0, y: 20 }, { opacity: 1, y: 0, stagger: 0.08, ease: ease.soft }, "-=0.3")
            .fromTo(
              ".muscle-dante",
              { opacity: 0, y: 18, scale: 0.9 },
              { opacity: 1, y: 0, scale: 1, ease: "back.out(1.6)" },
              "-=0.4",
            );
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="muscle"
      data-chapter="muscle"
      className="relative overflow-hidden bg-[var(--mf-pub-bg)] px-6 py-24 lg:px-12 lg:py-32"
    >
      {/* Ambient accents */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute right-1/4 top-1/2 size-[500px] -translate-y-1/2 rounded-full bg-[var(--mf-brand)]/5 blur-[140px]" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <div className="muscle-fade inline-flex items-center gap-2 rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mf-brand)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-brand)]" />
            05 · Muscle Intelligence Atlas
          </div>

          <h2 className="mt-4 font-heading text-5xl font-black uppercase leading-[0.9] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
            <span className="muscle-line block overflow-hidden"><span className="block">See every muscle.</span></span>
            <span className="muscle-line block overflow-hidden"><span className="block text-[var(--mf-brand)]">Track real exposure.</span></span>
          </h2>

          <p className="muscle-fade mt-6 max-w-lg text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Explore 3D muscle taxonomy, volume exposure, recovery status, and fatigue distribution modeled from your logged workouts — direct and indirect effective sets per muscle group.
          </p>

          <div className="muscle-fade mt-8 flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-pub-text-muted)]">
                {muscle.focusMuscle} Focus
              </p>
              <p className="mt-1 text-2xl font-black text-[var(--mf-pub-text)]">
                {muscle.weeklyEffectiveSets} <span className="text-sm font-bold text-[var(--mf-pub-text-muted)]">effective sets</span>
              </p>
            </div>
            <span className="rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mf-brand)]">
              {muscle.changeLabel}
            </span>
          </div>

          <Link
            href={routes.muscleIntelligence}
            className="muscle-fade mt-8 inline-flex items-center gap-2 rounded-2xl bg-[var(--mf-brand)] px-6 py-3.5 text-xs font-black uppercase tracking-[0.14em] text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)]"
          >
            Explore Muscle Atlas
          </Link>
        </div>

        {/* Right Side: Flagship Muscle Showcase Display */}
        <div className="muscle-dante relative mx-auto w-full max-w-[500px]">
          <div className="rounded-[28px] border border-white/12 bg-gradient-to-b from-[#151923] via-[#0f121a] to-[#080a0f] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--mf-brand)]">Anatomy Breakdown</p>
                <h3 className="mt-0.5 text-lg font-black text-white">Target Muscle Distribution</h3>
              </div>
              <span className="rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--mf-brand)]">
                Optimal Volume
              </span>
            </div>

            {/* Muscle exposure bars */}
            <div className="mt-6 space-y-4">
              {[
                { name: "Pectoralis Major (Chest)", sets: 16, target: 18, color: "var(--mf-brand)" },
                { name: "Deltoids (Shoulders)", sets: 14, target: 16, color: "var(--mf-cyan)" },
                { name: "Triceps Brachii", sets: 12, target: 14, color: "var(--mf-violet)" },
                { name: "Latissimus Dorsi (Back)", sets: 18, target: 20, color: "var(--mf-brand)" },
              ].map((m) => (
                <div key={m.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">{m.name}</span>
                    <span className="font-bold" style={{ color: m.color }}>{m.sets} / {m.target} sets</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${(m.sets / m.target) * 100}%`, background: m.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Dante Insight Anchor */}
            <div className="mt-7 flex items-center gap-3 rounded-2xl border border-violet-400/20 bg-violet-400/8 p-4">
              <DanteRobot size="xs" state="idle" ariaLabel="Dante Mascot" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-violet)]">Dante ({dante.statusLabel})</p>
                <p className="mt-0.5 text-xs font-semibold leading-relaxed text-zinc-300">
                  Chest recovery at 94%. Optimal window for progressive overload on incline bench today.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
