"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { DanteRobot } from "@/components/dante/dante-robot";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";
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
      {/* Ambient accents so the section reads full, not empty. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <svg
          className="absolute right-[4%] top-1/2 hidden -translate-y-1/2 opacity-40 lg:block"
          width="640"
          height="640"
          viewBox="0 0 640 640"
          fill="none"
        >
          <circle cx="320" cy="320" r="300" stroke="var(--mf-brand-border)" strokeWidth="1" strokeDasharray="2 10" />
          <circle cx="320" cy="320" r="230" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <path
            d="M 68 452 A 300 300 0 0 1 452 68"
            stroke="var(--mf-brand)"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">05 · Muscle Intelligence</p>

          <h2 className="mt-4 font-heading text-5xl font-black uppercase leading-[0.9] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
            <span className="muscle-line block overflow-hidden"><span className="block">Muscle</span></span>
            <span className="muscle-line block overflow-hidden"><span className="block text-[var(--mf-brand)]">Intelligence</span></span>
            <span className="muscle-line block overflow-hidden"><span className="block">System</span></span>
          </h2>

          <p className="muscle-fade mt-6 max-w-md text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            {muscle.hasLiveData
              ? "Direct and indirect effective sets, modeled from your own logged training — never a guessed number."
              : "Illustrative preview — direct and indirect effective sets, modeled from logged training per muscle."}
          </p>

          <div className="muscle-fade mt-7 inline-flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-pub-text-muted)]">
                {muscle.focusMuscle}
              </p>
              <p className="mt-1 text-2xl font-black text-[var(--mf-pub-text)]">
                {muscle.weeklyEffectiveSets} <span className="text-sm font-bold text-[var(--mf-pub-text-muted)]">sets</span>
              </p>
            </div>
            <span className="rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--mf-brand)]">
              {muscle.changeLabel}
            </span>
          </div>

          <Link
            href={routes.muscleIntelligence}
            className="muscle-fade mt-7 flex w-fit items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--mf-brand)] transition hover:text-[var(--mf-brand-hover)]"
          >
            Open Muscle Intelligence
          </Link>
        </div>

        <div className="muscle-dante relative mx-auto grid size-[240px] place-items-center sm:size-[280px] lg:size-[340px]">
          <div
            aria-hidden="true"
            className={`absolute inset-[-15%] rounded-full ${styles.heroOrbHalo}`}
            style={{
              background: "radial-gradient(circle, color-mix(in srgb, var(--mf-brand) 22%, transparent) 0%, transparent 70%)",
              filter: "blur(10px)",
            }}
          />

          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            <circle
              cx="100"
              cy="100"
              r="96"
              fill="none"
              stroke="var(--mf-brand-border)"
              strokeWidth="1"
              strokeDasharray="2 8"
              className={styles.heroOrbRingA}
              style={{ transformOrigin: "100px 100px" }}
            />
            <circle
              cx="100"
              cy="100"
              r="78"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              className={styles.heroOrbRingC}
              style={{ transformOrigin: "100px 100px" }}
            />
            <path
              d="M 22 128 A 78 78 0 0 1 128 22"
              fill="none"
              stroke="var(--mf-brand)"
              strokeOpacity="0.4"
              strokeWidth="1.5"
              strokeLinecap="round"
              className={styles.heroOrbRingB}
              style={{ transformOrigin: "100px 100px" }}
            />
          </svg>

          <DanteRobot size="lg" state="idle" interactive ariaLabel="Dante, your adaptive coach" />

          <div className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-violet-400/25 bg-[var(--mf-pub-bg)]/90 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--mf-violet)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-violet)]" aria-hidden="true" />
            {dante.statusLabel}
          </div>
        </div>
      </div>
    </section>
  );
}
