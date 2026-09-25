"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Dumbbell, Zap, Target } from "lucide-react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, enterOnce } from "@/components/experience/motion-home/motion/motionTokens";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

const SEGMENTS = [
  {
    icon: Dumbbell,
    tagline: "Beginners & Intermediates",
    title: "Train Smarter From Day 1",
    description: "Proven split routines, automated set/rep progression, and clear exercise cues so you never waste a workout wondering what to do next.",
    features: ["Structured Workout Splits", "Automated Load Guidance", "Form & Execution Cues"],
    accent: "var(--mf-brand)",
  },
  {
    icon: Zap,
    tagline: "Busy Professionals & Students",
    title: "Maximum Return On Your Time",
    description: "Autoregulated sessions that dynamically adjust when you're short on time, low on sleep, or dealing with high daily stress.",
    features: ["Sleep & Stress Autoregulation", "Flexible Session Duration", "Macro & Fuel Tracking"],
    accent: "var(--mf-cyan)",
  },
  {
    icon: Target,
    tagline: "Dedicated Lifters & Athletes",
    title: "Data-Driven Performance & Recovery",
    description: "Deep muscle volume exposure, personal recovery baselines, and Dante's evidence-grounded insights for sustainable gains.",
    features: ["Muscle Volume Exposure Atlas", "30-Day Recovery Trends", "Agentic Dante Coaching"],
    accent: "var(--mf-violet)",
  },
] as const;

export function UserSegmentScene({ routes }: { routes: HomepageRoutes }) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };

          if (reduceMotion) {
            gsap.set(".segment-header, .segment-card", { opacity: 1, y: 0 });
            return;
          }

          gsap
            .timeline({
              scrollTrigger: { trigger: rootRef.current, ...enterOnce },
            })
            .fromTo(".segment-header", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: ease.precise })
            .fromTo(
              ".segment-card",
              { opacity: 0, y: 24 },
              { opacity: 1, y: 0, duration: 0.45, stagger: 0.12, ease: ease.soft },
              "-=0.2",
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
      id="audience"
      data-chapter="audience"
      className="relative overflow-x-clip bg-[var(--mf-pub-bg-deep)] px-6 py-16 lg:px-12 lg:py-24"
    >
      {/* Background glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--mf-brand)]/3 blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* Centered Heading */}
        <div className="segment-header mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--mf-brand)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-brand)]" />
            Built For You
          </div>

          <h2 className="mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl text-white">
            Built for anyone serious about <span className="text-[var(--mf-brand)]">training smarter</span>.
          </h2>

          <p className="mt-5 text-base leading-7 text-[var(--mf-pub-text-secondary)] sm:text-lg">
            Whether you are just starting out, balancing a busy schedule, or optimizing peak recovery — Muscle Fitness gives you structure without the fluff.
          </p>
        </div>

        {/* 3 Persona Cards */}
        <div className="mt-16 grid gap-6 md:grid-cols-3 lg:gap-8">
          {SEGMENTS.map((seg) => {
            const Icon = seg.icon;
            return (
              <div
                key={seg.tagline}
                className="segment-card group relative flex flex-col justify-between rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.04] via-black/40 to-black/80 p-7 transition hover:-translate-y-1 hover:border-white/20 sm:p-8"
              >
                <div>
                  <div
                    className="inline-grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] transition group-hover:scale-105"
                    style={{ color: seg.accent }}
                  >
                    <Icon className="size-5" />
                  </div>

                  <p className="mt-6 text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: seg.accent }}>
                    {seg.tagline}
                  </p>

                  <h3 className="mt-2 text-xl font-black leading-snug text-white">{seg.title}</h3>

                  <p className="mt-3 text-sm leading-6 text-[var(--mf-pub-text-secondary)]">{seg.description}</p>

                  <ul className="mt-6 space-y-2 border-t border-white/8 pt-5">
                    {seg.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2 text-xs text-zinc-300">
                        <span style={{ color: seg.accent }}>✓</span>
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-4">
                  <Link
                    href={routes.signup}
                    className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] transition group-hover:translate-x-1"
                    style={{ color: seg.accent }}
                  >
                    Start training now
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
