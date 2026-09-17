"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import type { AdaptViewModel } from "@/components/experience/motion-home/data/homepageViewModel";

const STAGES = ["Train", "Measure", "Adapt", "Progress"] as const;

export function AdaptScene({ adapt }: { adapt: AdaptViewModel }) {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
        const { reduceMotion } = context.conditions as { reduceMotion: boolean };

        const paths = gsap.utils.toArray<SVGPathElement>(".adapt-path");
        const basePaths = gsap.utils.toArray<SVGPathElement>(".adapt-path--base");
        const selectedPaths = gsap.utils.toArray<SVGPathElement>(".adapt-path--selected");

        if (reduceMotion) {
          gsap.set(paths, { strokeDashoffset: 0, opacity: 1 });
          gsap.set(".adapt-node, .adapt-label, .adapt-heading", { opacity: 1, scale: 1, y: 0 });
          return;
        }

        paths.forEach((path) => {
          const length = path.getTotalLength();
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        });

        // Fast, time-based reveal fired once on scroll-into-view (see
        // AthleteSignalScene for why scroll-scrubbed timelines read as
        // "arrives too late" here). The rejected/base trajectory draws
        // in essentially immediately alongside the headline; the
        // selected (lime) path draws over it right after, as a
        // highlight — never a long wait on empty black space before
        // any path appears.
        const tl = gsap.timeline({
          scrollTrigger: { trigger: rootRef.current, start: "top 78%", once: true },
        });

        tl.fromTo(".adapt-heading", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: ease.precise })
          .to(basePaths, { strokeDashoffset: 0, duration: 0.3, ease: ease.precise }, "-=0.3")
          .to(selectedPaths, { strokeDashoffset: 0, duration: 0.3, stagger: 0.08, ease: ease.precise }, "-=0.1")
          .fromTo(".adapt-node", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.06, ease: ease.precise }, "-=0.2")
          .fromTo(".adapt-label", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.04, ease: ease.precise }, "-=0.2");
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="adapt"
      data-chapter="adapt"
      className="relative bg-[var(--mf-pub-bg)] px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">07 · Adapt</p>

        <h2 className="adapt-heading mt-4 max-w-3xl font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          Train. Measure. <span className="text-[var(--mf-brand)]">Adapt.</span> Progress.
        </h2>

        <div className="relative mt-14 overflow-x-auto">
          <svg viewBox="0 0 800 220" className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label="Adaptive training path">
            {/* rejected paths — base trajectory, drawn immediately */}
            <path className="adapt-path adapt-path--base" d="M 40,180 C 200,180 240,60 400,60" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
            <path className="adapt-path adapt-path--base" d="M 40,180 C 200,180 240,180 400,180" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
            {/* selected path — highlight, draws over the base right after */}
            <path className="adapt-path adapt-path--selected" d="M 40,180 C 200,180 240,120 400,120" fill="none" stroke="var(--mf-brand)" strokeWidth="3" strokeLinecap="round" />
            <path className="adapt-path adapt-path--selected" d="M 400,120 C 560,120 600,90 760,90" fill="none" stroke="var(--mf-brand)" strokeWidth="3" strokeLinecap="round" />

            <circle className="adapt-node" cx="40" cy="180" r="7" fill="var(--mf-pub-bg)" stroke="var(--mf-brand)" strokeWidth="2" />
            <circle className="adapt-node" cx="400" cy="120" r="7" fill="var(--mf-pub-bg)" stroke="var(--mf-brand)" strokeWidth="2" />
            <circle className="adapt-node" cx="760" cy="90" r="8" fill="var(--mf-brand)" />
          </svg>

          <div className="adapt-label mx-auto mt-4 flex max-w-3xl justify-between px-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--mf-pub-text-muted)]">
            {STAGES.map((stage) => (
              <span key={stage}>{stage}</span>
            ))}
          </div>
        </div>

        <div className="adapt-label mt-10 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mf-brand)]">
            Selected · {adapt.selectedPath}
          </span>
          {adapt.rejectedPaths.map((path) => (
            <span
              key={path}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--mf-pub-text-muted)] opacity-60"
            >
              {path}
            </span>
          ))}
        </div>

        <p className="mt-4 text-xs text-[var(--mf-pub-text-muted)]">{adapt.note} — read-only preview.</p>
      </div>
    </section>
  );
}
