"use client";

import { useRef } from "react";
import { Info } from "lucide-react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";

/**
 * Scene 02 — Adaptive Training. Replaces the old giant "SYSTEM" watermark
 * scene with a content-driven session card: what today's plan looks
 * like once training load and recovery adjust it. The card content is a
 * static illustrative example (labeled as such) — the live per-user
 * adaptive path is `AdaptScene` further down the page.
 */
export function AdaptiveTrainingScene() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };

          if (reduceMotion) {
            gsap.set(".session-line, .session-card, .session-row", { opacity: 1, y: 0, scale: 1 });
            return;
          }

          gsap
            .timeline({
              scrollTrigger: { trigger: rootRef.current, start: "top 70%", end: "top 30%", scrub: 0.6 },
            })
            .fromTo(
              ".session-line",
              { yPercent: 100, opacity: 0 },
              { yPercent: 0, opacity: 1, stagger: 0.1, ease: ease.heavy },
            )
            .fromTo(
              ".session-card",
              { opacity: 0, y: 24, scale: 0.97 },
              { opacity: 1, y: 0, scale: 1, ease: ease.soft },
              "-=0.3",
            )
            .fromTo(".session-row", { opacity: 0, x: -12 }, { opacity: 1, x: 0, stagger: 0.08, ease: ease.precise }, "-=0.25");
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="system"
      data-chapter="system"
      className="relative overflow-hidden bg-[var(--mf-pub-bg-deep)] px-6 py-24 lg:px-12 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 top-1/2 h-[560px] w-[560px] -translate-y-1/2 rounded-full opacity-[0.14] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--mf-brand) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">02 · Adaptive Training</p>

          <h2 className="mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            <span className="session-line block overflow-hidden"><span className="block">Train. Measure.</span></span>
            <span className="session-line block overflow-hidden"><span className="block text-[var(--mf-brand)]">Adapt.</span></span>
          </h2>

          <p className="mt-6 max-w-md text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Every session is adjusted against your current state. The plan is
            not fixed — it moves with you.
          </p>
        </div>

        <div className="session-card relative mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--mf-pub-text-muted)]">
                Today&apos;s session
              </p>
              <p className="mt-1 text-2xl font-black uppercase text-[var(--mf-pub-text)]">Push</p>
            </div>
            <span className="rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--mf-brand)]">
              Adapted
            </span>
          </div>

          <div className="session-row mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--mf-pub-text-muted)]">Recovery</p>
              <p className="mt-1 text-sm font-bold text-[var(--mf-pub-text)]">Moderate</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--mf-pub-text-muted)]">Training load</p>
              <p className="mt-1 text-sm font-bold text-[var(--mf-pub-text)]">Elevated · 480 AU</p>
            </div>
          </div>

          <div className="session-row mt-4 space-y-2 border-t border-white/8 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mf-pub-text-muted)]">
                Original plan
              </span>
              <span className="text-sm font-semibold text-[var(--mf-pub-text-muted)] line-through decoration-white/25">
                Bench 4×6 @ 80%
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mf-brand)]">Adapted plan</span>
              <span className="text-sm font-black text-[var(--mf-pub-text)]">
                Bench 4×6 @ 72% <span className="text-[var(--mf-brand)]">· Vol −20%</span>
              </span>
            </div>
          </div>

          <div className="session-row mt-5 flex gap-2 rounded-xl border border-white/8 bg-black/20 p-3">
            <Info className="mt-0.5 size-3.5 shrink-0 text-[var(--mf-pub-text-muted)]" aria-hidden="true" />
            <p className="text-xs leading-5 text-[var(--mf-pub-text-secondary)]">
              <span className="font-bold text-[var(--mf-pub-text)]">Why this changed —</span> recent training load is
              running above your recent baseline, so volume was trimmed to protect recovery.
            </p>
          </div>

          <p className="session-row mt-3 text-[10px] uppercase tracking-[0.1em] text-[var(--mf-pub-text-muted)]">
            Illustrative example session
          </p>
        </div>
      </div>
    </section>
  );
}
