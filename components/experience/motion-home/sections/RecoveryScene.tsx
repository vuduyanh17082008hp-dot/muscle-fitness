"use client";

import { useRef } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, duration, clampVisual } from "@/components/experience/motion-home/motion/motionTokens";
import type {
  HomepageRoutes,
  NutritionViewModel,
  RecoveryViewModel,
} from "@/components/experience/motion-home/data/homepageViewModel";

const RING_CIRCUMFERENCE = 2 * Math.PI * 70;

/**
 * Scene 06 — Recovery + Nutrition. Two related intelligence streams
 * (spec section 18): recovery tells us what the body can handle,
 * nutrition tells us what supports the work. Both feed one readiness
 * state. Recovery half unchanged from the original implementation;
 * nutrition half added alongside it.
 */
export function RecoveryScene({
  recovery,
  nutrition,
  routes,
}: {
  recovery: RecoveryViewModel;
  nutrition: NutritionViewModel;
  routes: HomepageRoutes;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  const readiness = clampVisual(recovery.readiness, 0, 100);
  const dashOffset = RING_CIRCUMFERENCE * (1 - readiness / 100);

  const proteinTarget = nutrition.proteinTargetG ?? nutrition.proteinConsumedG;
  const proteinRatio = proteinTarget > 0 ? clampVisual(nutrition.proteinConsumedG / proteinTarget, 0, 1) : 0;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };

          if (reduceMotion) {
            gsap.set(".recovery-fade", { opacity: 1, y: 0 });
            if (ringRef.current) gsap.set(ringRef.current, { strokeDashoffset: dashOffset });
            gsap.set(".nutrition-bar-fill", { scaleX: proteinRatio });
            return;
          }

          gsap
            .timeline({
              scrollTrigger: { trigger: rootRef.current, start: "top 70%", end: "top 30%", scrub: 0.9 },
            })
            .fromTo(".recovery-fade", { opacity: 0, y: 24 }, { opacity: 1, y: 0, stagger: 0.06, ease: ease.soft });

          if (ringRef.current) {
            gsap.fromTo(
              ringRef.current,
              { strokeDashoffset: RING_CIRCUMFERENCE },
              {
                strokeDashoffset: dashOffset,
                ease: ease.soft,
                scrollTrigger: { trigger: rootRef.current, start: "top 65%", end: "top 20%", scrub: 1 },
              },
            );
          }

          gsap.fromTo(
            ".nutrition-bar-fill",
            { scaleX: 0 },
            {
              scaleX: proteinRatio,
              transformOrigin: "left center",
              ease: ease.soft,
              scrollTrigger: { trigger: rootRef.current, start: "top 65%", end: "top 20%", scrub: 1 },
            },
          );

          // One shared breathing rhythm — every calm element pulses together.
          gsap.to(".recovery-breathe", {
            scale: 1.03,
            opacity: 0.92,
            duration: duration.breathe / 2,
            ease: ease.breathe,
            yoyo: true,
            repeat: -1,
          });
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [dashOffset, proteinRatio] },
  );

  return (
    <section
      ref={rootRef}
      id="recovery"
      data-chapter="recovery"
      className="relative bg-[var(--mf-pub-bg-deep)] px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <div className="recovery-fade mx-auto max-w-2xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-violet)]">06 · Recover + Nutrition</p>

          <h2 className="mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            What your body can handle.
            <br />
            What supports the work.
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Recovery tells us what your body can handle today. Nutrition
            tells us what supports the work. Both feed the same readiness
            state.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-2">
          <div className="recovery-fade recovery-breathe relative mx-auto grid place-items-center">
            <svg viewBox="0 0 160 160" className="size-64 -rotate-90">
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle
                ref={ringRef}
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke="var(--mf-violet)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE}
              />
            </svg>

            <div className="absolute flex flex-col items-center">
              <span className="text-5xl font-black tabular-nums text-[var(--mf-pub-text)]">{Math.round(readiness)}</span>
              <span className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-violet)]">
                {recovery.status}
              </span>
            </div>

            <div className="absolute -bottom-4 flex gap-4 text-center">
              {[
                { label: "Sleep", value: recovery.sleepHours ? `${recovery.sleepHours}h` : "—" },
                { label: "Load", value: recovery.hasLiveScore ? "Tracked" : "—" },
              ].map((item) => (
                <div
                  key={item.label}
                  tabIndex={0}
                  data-cursor-hover
                  className="group rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                >
                  <p className="text-xs font-bold text-[var(--mf-pub-text)] transition-colors duration-200 group-hover:text-[var(--mf-violet)] group-focus-visible:text-[var(--mf-violet)]">
                    {item.value}
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--mf-pub-text-muted)] transition-colors duration-200 group-hover:text-[var(--mf-violet)] group-focus-visible:text-[var(--mf-violet)]">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            <Link
              href={routes.recovery}
              className="recovery-fade mt-24 flex items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--mf-violet)] transition hover:text-violet-300"
            >
              Open Recovery
            </Link>
          </div>

          <div className="recovery-fade flex flex-col justify-center rounded-[24px] border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mf-pub-text-muted)]">
              {nutrition.hasLiveTarget ? "Today's protein" : "Illustrative protein preview"}
            </p>

            <p className="mt-3 text-4xl font-black tabular-nums text-[var(--mf-pub-text)]">
              {nutrition.proteinConsumedG}
              <span className="text-lg font-bold text-[var(--mf-pub-text-muted)]">
                {" "}
                / {proteinTarget}g
              </span>
            </p>

            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="nutrition-bar-fill h-full origin-left rounded-full bg-[var(--mf-brand)]"
                style={{ transform: "scaleX(0)" }}
              />
            </div>

            <p className="mt-3 text-sm text-[var(--mf-pub-text-secondary)]">{nutrition.remainingLabel}</p>

            <Link
              href={routes.nutrition}
              className="mt-7 flex w-fit items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--mf-brand)] transition hover:text-[var(--mf-brand-hover)]"
            >
              Open Nutrition
            </Link>
          </div>
        </div>

        <div className="recovery-fade mt-12 flex justify-center">
          <span className="rounded-full border border-white/10 bg-black/30 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-pub-text-muted)]">
            Recovery + Nutrition → Today&apos;s State
          </span>
        </div>
      </div>
    </section>
  );
}
