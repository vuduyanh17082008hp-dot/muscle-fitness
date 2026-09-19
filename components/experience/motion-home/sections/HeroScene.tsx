"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { Ecosystem } from "@/components/experience/motion-home/hero/Ecosystem";
import { ParticleCanvas } from "@/components/experience/motion-home/hero/ParticleCanvas";
import { TransitionLink } from "@/components/experience/motion-home/interaction/TransitionLink";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

export function HeroScene({ routes }: { routes: HomepageRoutes }) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
        const { reduceMotion } = context.conditions as { reduceMotion: boolean };

        if (reduceMotion) {
          gsap.set(".hero-line, .hero-sub, .hero-cta, .hero-ecosystem", { opacity: 1, y: 0, scale: 1 });
          return;
        }

        // The ecosystem is Muscle Fitness's core visual identity — it
        // starts fading in immediately (parallel with the headline,
        // not sequenced after it) so it reads as already-present
        // rather than arriving late (spec: "ecosystem must already be
        // present in some form in the hero").
        gsap
          .timeline({ delay: 0.1 })
          .fromTo(
            ".hero-ecosystem",
            { opacity: 0, scale: 0.94 },
            { opacity: 1, scale: 1, duration: 0.6, ease: ease.soft },
            0,
          )
          .fromTo(
            ".hero-line",
            { yPercent: 100, opacity: 0 },
            { yPercent: 0, opacity: 1, duration: 0.6, ease: ease.heavy, stagger: 0.08 },
            0.05,
          )
          .fromTo(".hero-sub", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: ease.precise }, "-=0.4")
          .fromTo(".hero-cta", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: ease.precise, stagger: 0.06 }, "-=0.25");

        gsap.to(".hero-copy", {
          yPercent: -12,
          opacity: 0.2,
          ease: "none",
          scrollTrigger: {
            trigger: rootRef.current,
            start: "bottom 90%",
            end: "bottom 20%",
            scrub: true,
          },
        });

        // The ecosystem is a persistent visual identity layer, not a
        // scroll-reactive element: it plays its one-time entrance
        // above and then stays fully visible/static regardless of
        // scroll position. No scrollTrigger-driven opacity/scale here
        // — that previously made it visibly fade and shrink as the
        // hero scrolled out, which reads as "disappearing/resetting"
        // when scrolling back up into it.
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="hero"
      data-chapter="hero"
      className="relative flex min-h-screen items-center overflow-hidden border-b border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg)] px-6 pt-28 pb-20 sm:pt-32 sm:pb-24 lg:px-12 lg:py-28"
    >
      <ParticleCanvas />

      {/* Atmospheric glow backdrop */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/3 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--mf-brand)]/5 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/4 size-[600px] rounded-full bg-violet-600/5 blur-[140px]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 xl:gap-24">
        <div className="hero-copy">
          <div className="hero-line mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--mf-brand)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-brand)]" />
            AI-Powered Personal Training System
          </div>

          <h1 className="font-heading text-5xl font-black uppercase leading-[0.92] tracking-[-0.03em] sm:text-6xl lg:text-[5.2vw]">
            <span className="hero-line block overflow-hidden"><span className="block text-[var(--mf-pub-text)]">Train hard.</span></span>
            <span className="hero-line block overflow-hidden"><span className="block text-[var(--mf-pub-text-secondary)]">Recover smart.</span></span>
            <span className="hero-line block overflow-hidden"><span className="block text-[var(--mf-brand)]">Adapt continuously.</span></span>
          </h1>

          <p className="hero-sub mt-6 max-w-xl text-base leading-7 text-[var(--mf-pub-text-secondary)] sm:text-lg">
            Training, recovery, nutrition, and history — integrated into one intelligence system that reasons from your real data, not raw prompts.
          </p>

          <div className="mt-8 flex flex-col gap-3.5 sm:flex-row sm:items-center">
            <TransitionLink
              href={routes.signup}
              transitionLabel="Entering the system…"
              onPointerMove={(event) => {
                const target = event.currentTarget;
                const rect = target.getBoundingClientRect();
                target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
                target.style.setProperty("--my", `${event.clientY - rect.top}px`);
              }}
              className={`hero-cta ${styles.radialCta} inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--mf-brand)] px-7 py-4 text-xs font-black uppercase tracking-[0.14em] text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)]`}
            >
              Enter the system
              <ArrowRight className="size-4" />
            </TransitionLink>

            <Link
              href={routes.chatbot}
              className="hero-cta inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.03] px-7 py-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:border-white/25 hover:bg-white/8"
            >
              Meet Dante
            </Link>
          </div>

          {/* Micro-feature highlights */}
          <div className="hero-sub mt-10 flex flex-wrap items-center gap-4 border-t border-white/10 pt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--mf-brand)]">✓</span> 100% Personal Baseline
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--mf-brand)]">✓</span> Evidence-Grounded
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[var(--mf-brand)]">✓</span> Real-Time Autoregulation
            </span>
          </div>
        </div>

        <div className="hero-ecosystem relative overflow-visible bg-transparent lg:pl-2 xl:pl-6">
          <Ecosystem routes={routes} />
        </div>
      </div>
    </section>
  );
}
