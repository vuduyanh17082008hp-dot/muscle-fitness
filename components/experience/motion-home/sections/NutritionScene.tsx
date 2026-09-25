"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Utensils, Zap, Flame } from "lucide-react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, enterOnce } from "@/components/experience/motion-home/motion/motionTokens";
import type { HomepageRoutes, NutritionViewModel } from "@/components/experience/motion-home/data/homepageViewModel";

type NutritionSceneProps = {
  nutrition: NutritionViewModel;
  routes: HomepageRoutes;
};

export function NutritionScene({ nutrition, routes }: NutritionSceneProps) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };

          if (reduceMotion) {
            gsap.set(".nutrition-fade", { opacity: 1, y: 0 });
            return;
          }

          gsap.fromTo(
            ".nutrition-fade",
            { opacity: 0, y: 24 },
            {
              opacity: 1,
              y: 0,
              duration: 0.6,
              stagger: 0.08,
              ease: ease.precise,
              scrollTrigger: {
                trigger: rootRef.current,
                ...enterOnce,
              },
            },
          );
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  const proteinTarget = nutrition.proteinTargetG ?? 160;
  const proteinLogged = nutrition.proteinConsumedG;
  const proteinPct = Math.min(100, Math.round((proteinLogged / proteinTarget) * 100));

  return (
    <section
      ref={rootRef}
      id="nutrition"
      data-chapter="nutrition"
      className="relative overflow-x-clip border-b border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg-deep)] px-6 py-16 lg:px-12 lg:py-24"
    >
      <div className="mx-auto max-w-7xl">
        <div className="nutrition-fade mx-auto max-w-2xl text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">06 · Fuel & Nutrition</p>

          <h2 className="mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            What powers <span className="text-[var(--mf-brand)]">your work</span>.
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Training without nutrition is spinning your wheels. Track protein, calories, and macros effortlessly so your body has what it needs to rebuild.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Card 1: Protein Target */}
          <div className="nutrition-fade flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[var(--mf-brand)]/40 hover:bg-white/[0.05]">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-2xl border border-[var(--mf-brand)]/30 bg-[var(--mf-brand)]/10 text-[var(--mf-brand)]">
                  <Flame className="size-5" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-brand)]">
                  Macro Focus
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">Daily Protein Target</h3>
              <p className="mt-1 text-sm text-[var(--mf-pub-text-secondary)]">
                Essential for muscle recovery and synthesis.
              </p>
            </div>

            <div className="mt-8">
              <div className="flex items-baseline justify-between text-sm font-bold">
                <span className="text-3xl font-black tabular-nums text-white">{proteinLogged}g</span>
                <span className="text-[var(--mf-pub-text-muted)]">/ {proteinTarget}g target</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--mf-brand)] transition-all duration-700"
                  style={{ width: `${proteinPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Caloric Balance */}
          <div className="nutrition-fade flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-violet-500/40 hover:bg-white/[0.05]">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10 text-violet-400">
                  <Zap className="size-5" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-400">
                  Energy Balance
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">Smart Energy Budget</h3>
              <p className="mt-1 text-sm text-[var(--mf-pub-text-secondary)]">
                Tailored calories derived from your bodyweight and goal.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-white/5 bg-black/30 p-4">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span>Training Day Target</span>
                <span className="text-violet-400">Optimal</span>
              </div>
              <p className="mt-1 text-xs text-[var(--mf-pub-text-muted)]">
                Adjusted automatically when workout intensity changes.
              </p>
            </div>
          </div>

          {/* Card 3: Food Logging & Dante Advice */}
          <div className="nutrition-fade flex flex-col justify-between rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:col-span-2 lg:col-span-1 transition hover:border-cyan-500/40 hover:bg-white/[0.05]">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                  <Utensils className="size-5" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-400">
                  Logging & Insights
                </span>
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">Effortless Food Logs</h3>
              <p className="mt-1 text-sm text-[var(--mf-pub-text-secondary)]">
                Quick meal tracking paired with Dante&apos;s nutrition suggestions.
              </p>
            </div>

            <div className="mt-8">
              <Link
                href={routes.nutrition}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 py-3.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-[var(--mf-brand)] hover:text-[var(--mf-brand-ink)]"
              >
                Open Nutrition Tracker
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
