"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { TransitionLink } from "@/components/experience/motion-home/interaction/TransitionLink";
import { DanteIntroVisual } from "@/components/experience/motion-home/intro/DanteIntroVisual";
import { IntroSoundControl } from "@/components/experience/motion-home/intro/IntroSoundControl";
import { useIntroAudio } from "@/components/experience/motion-home/intro/useIntroAudio";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

/** Decorative ambient motes — fixed values so server and client render identically. */
const MOTES = [
  { left: "12%", top: "62%", duration: "9s", delay: "0s" },
  { left: "28%", top: "38%", duration: "12s", delay: "1.4s" },
  { left: "44%", top: "74%", duration: "10.5s", delay: "3.1s" },
  { left: "63%", top: "30%", duration: "13s", delay: "0.8s" },
  { left: "78%", top: "58%", duration: "11s", delay: "2.3s" },
  { left: "90%", top: "44%", duration: "14s", delay: "4.2s" },
];

const CAPABILITIES = ["Training", "Nutrition", "Recovery", "Progress"];

/**
 * The opening viewport of `/` — the "First Rep" intro that precedes the
 * existing hero chapter. It introduces Dante and routes visitors to the
 * two entry points the marketing site already uses (profile creation
 * and the Dante chat); it owns no product logic of its own.
 */
export function IntroScene({ routes }: { routes: HomepageRoutes }) {
  const rootRef = useRef<HTMLElement>(null);
  const { enabled, toggle, playActivationChime } = useIntroAudio();

  // Read inside GSAP callbacks, which must not re-run when audio state
  // changes (that would replay the entrance).
  const audibleRef = useRef(false);
  const introCompleteRef = useRef(false);

  useEffect(() => {
    audibleRef.current = enabled;
  }, [enabled]);

  // If sound is switched on after Dante has already settled, play the
  // activation chime then instead — the same moment, just deferred
  // until there is something to hear.
  useEffect(() => {
    if (!enabled || !introCompleteRef.current) return;

    const timer = window.setTimeout(playActivationChime, 260);
    return () => window.clearTimeout(timer);
  }, [enabled, playActivationChime]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          full: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };

          if (reduceMotion) {
            gsap.set(
              ".intro-eyebrow, .intro-line, .intro-sub, .intro-cta, .intro-status, .intro-art",
              { opacity: 1, y: 0, yPercent: 0, scale: 1 },
            );
            introCompleteRef.current = true;
            return;
          }

          // Whole entrance lands inside ~1.15s: Dante settles at 0.75s,
          // the status line (the last element in) finishes at 1.15s.
          gsap
            .timeline({ delay: 0.05 })
            .fromTo(
              ".intro-art",
              { opacity: 0, scale: 1.04 },
              {
                opacity: 1,
                scale: 1,
                duration: 0.7,
                ease: ease.soft,
                onComplete: () => {
                  introCompleteRef.current = true;
                  if (audibleRef.current) playActivationChime();
                },
              },
              0,
            )
            .fromTo(
              ".intro-eyebrow",
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, duration: 0.4, ease: ease.precise },
              0.05,
            )
            .fromTo(
              ".intro-line",
              { yPercent: 105, opacity: 0 },
              { yPercent: 0, opacity: 1, duration: 0.55, ease: ease.heavy, stagger: 0.09 },
              0.14,
            )
            .fromTo(
              ".intro-sub",
              { opacity: 0, y: 16 },
              { opacity: 1, y: 0, duration: 0.45, ease: ease.precise },
              0.42,
            )
            .fromTo(
              ".intro-cta",
              { opacity: 0, y: 16 },
              { opacity: 1, y: 0, duration: 0.4, ease: ease.precise, stagger: 0.06 },
              0.55,
            )
            .fromTo(
              ".intro-status",
              { opacity: 0, y: 12 },
              { opacity: 1, y: 0, duration: 0.4, ease: ease.precise },
              0.7,
            );
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef, dependencies: [playActivationChime] },
  );

  return (
    <section
      ref={rootRef}
      id="intro"
      data-chapter="intro"
      className="relative flex min-h-[100svh] flex-col overflow-hidden border-b border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg)] px-6 pb-14 pt-24 sm:pt-28 lg:px-12 lg:pb-16 lg:pt-32"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {MOTES.map((mote) => (
          <span
            key={mote.left}
            className={styles.introMote}
            style={{
              left: mote.left,
              top: mote.top,
              animationDuration: mote.duration,
              animationDelay: mote.delay,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 sm:gap-12 lg:grid-cols-[1.02fr_1fr] lg:gap-16 xl:gap-20">
        <div className="intro-art order-2 w-full lg:order-1">
          <DanteIntroVisual />
        </div>

        <div className="order-1 w-full lg:order-2">
          <p
            className={`intro-eyebrow ${styles.monoLabel} text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--mf-brand)]`}
          >
            Dante / Performance Intelligence
          </p>

          <h1 className="mt-5 font-heading text-[2.75rem] font-black uppercase leading-[0.94] tracking-[-0.03em] sm:text-6xl lg:text-[4.4vw]">
            <span className="block overflow-hidden">
              <span className="intro-line block text-[var(--mf-pub-text)]">Your training has data.</span>
            </span>
            <span className="block overflow-hidden">
              <span className="intro-line block text-[var(--mf-brand)]">Now it has direction.</span>
            </span>
          </h1>

          <p className="intro-sub mt-6 max-w-xl text-base leading-7 text-[var(--mf-pub-text-secondary)] sm:text-lg">
            Build a plan around your training, recovery, nutrition, and progress
            — with guidance that stays practical.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <TransitionLink
              href={routes.signup}
              transitionLabel="Building your profile…"
              className="intro-cta inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-[var(--mf-brand)] px-7 py-4 text-sm font-black uppercase tracking-wider text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mf-brand)]"
            >
              Build My Profile
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </TransitionLink>

            <Link
              href={routes.chatbot}
              className="intro-cta inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl border border-white/12 px-7 py-4 text-sm font-bold uppercase tracking-wider text-[var(--mf-pub-text-secondary)] transition hover:border-white/25 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mf-brand)]"
            >
              Ask Dante
            </Link>
          </div>

          <div className="intro-status mt-9 flex flex-wrap items-center gap-x-5 gap-y-4 border-t border-[var(--mf-pub-border)] pt-5">
            <p
              className={`${styles.monoLabel} flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--mf-pub-text-muted)]`}
            >
              {CAPABILITIES.map((capability, index) => (
                <span key={capability} className="inline-flex items-center gap-2">
                  {index > 0 ? <span aria-hidden="true">·</span> : null}
                  {capability}
                </span>
              ))}
            </p>

            <div className="ml-auto">
              <IntroSoundControl enabled={enabled} onToggle={toggle} />
            </div>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="relative z-10 mt-10 hidden justify-center lg:flex">
        <span className="block h-10 w-px overflow-hidden bg-white/10">
          <span className={`${styles.introScrollCue} block h-4 w-px bg-[var(--mf-brand)]`} />
        </span>
      </div>
    </section>
  );
}
