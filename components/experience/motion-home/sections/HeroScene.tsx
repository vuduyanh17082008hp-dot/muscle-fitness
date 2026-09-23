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
      className="relative flex min-h-screen items-center overflow-hidden border-b border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg)] px-6 pt-28 pb-20 sm:pt-32 sm:pb-24 lg:px-12 lg:py-24"
    >
      <ParticleCanvas />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 xl:gap-28">
        <div className="hero-copy">
          {/* h2, not h1: the First Rep intro above is now the page's single h1. */}
          <h2 className="font-heading text-5xl font-black uppercase leading-[0.92] tracking-[-0.03em] sm:text-6xl lg:text-[5.5vw]">
            <span className="hero-line block overflow-hidden"><span className="block text-[var(--mf-pub-text)]">Train hard.</span></span>
            <span className="hero-line block overflow-hidden"><span className="block text-[var(--mf-pub-text-secondary)]">Recover smart.</span></span>
            <span className="hero-line block overflow-hidden"><span className="block text-[var(--mf-brand)]">Adapt continuously.</span></span>
          </h2>

          <p className="hero-sub mt-8 max-w-lg text-base leading-7 text-[var(--mf-pub-text-secondary)] sm:text-lg">
            One system reads your training, recovery and adaptive state — then
            Dante turns it into the next decision.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <TransitionLink
              href={routes.signup}
              transitionLabel="Entering the system…"
              onPointerMove={(event) => {
                const target = event.currentTarget;
                const rect = target.getBoundingClientRect();
                target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
                target.style.setProperty("--my", `${event.clientY - rect.top}px`);
              }}
              className={`hero-cta ${styles.radialCta} inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--mf-brand)] px-6 py-4 text-sm font-black uppercase tracking-wider text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)]`}
            >
              Enter the system
              <ArrowRight className="size-4" />
            </TransitionLink>

            <Link
              href={routes.chatbot}
              className="hero-cta inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-6 py-4 text-sm font-black uppercase tracking-wider text-white transition hover:border-white/20 hover:bg-white/5"
            >
              Meet Dante
            </Link>
          </div>
        </div>

        <div className="hero-ecosystem lg:pl-4 xl:pl-8">
          <Ecosystem routes={routes} />
        </div>
      </div>
    </section>
  );
}
