"use client";

import { useRef, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";
import { TransitionLink } from "@/components/experience/motion-home/interaction/TransitionLink";
import type { HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

const LOOP_STAGES = [
  { label: "Train", x: 110, y: 20, lx: 110, ly: 2 },
  { label: "Measure", x: 196, y: 82, lx: 213, ly: 74 },
  { label: "Recover", x: 163, y: 183, lx: 173, ly: 200 },
  { label: "Adapt", x: 57, y: 183, lx: 47, ly: 200 },
  { label: "Progress", x: 24, y: 82, lx: 7, ly: 74 },
] as const;

const LOOP_PATH_D = `M ${LOOP_STAGES.map((stage) => `${stage.x},${stage.y}`).join(" L ")} Z`;

export function ConvergenceScene({ routes }: { routes: HomepageRoutes }) {
  const rootRef = useRef<HTMLElement>(null);
  const borderRef = useRef<SVGRectElement>(null);
  const loopRef = useRef<SVGPathElement>(null);
  const [confirmed, setConfirmed] = useState(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
        const { reduceMotion } = context.conditions as { reduceMotion: boolean };

        if (reduceMotion) {
          gsap.set(".converge-fade", { opacity: 1, y: 0 });
          if (borderRef.current) gsap.set(borderRef.current, { strokeDashoffset: 0 });
          if (loopRef.current) gsap.set(loopRef.current, { strokeDashoffset: 0 });
          gsap.set(".loop-node, .loop-label", { opacity: 1, scale: 1 });
          return;
        }

        if (borderRef.current) {
          const length = borderRef.current.getTotalLength();
          gsap.set(borderRef.current, { strokeDasharray: length, strokeDashoffset: length });
        }

        if (loopRef.current) {
          const length = loopRef.current.getTotalLength();
          gsap.set(loopRef.current, { strokeDasharray: length, strokeDashoffset: length });
        }

        gsap
          .timeline({
            scrollTrigger: { trigger: rootRef.current, start: "top 75%", end: "top 30%", scrub: 0.9 },
          })
          .fromTo(".converge-fade", { opacity: 0, y: 24 }, { opacity: 1, y: 0, stagger: 0.1, ease: ease.soft })
          .to(loopRef.current, { strokeDashoffset: 0, ease: ease.precise }, "<")
          .fromTo(".loop-node", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, stagger: 0.08, ease: ease.precise }, "-=0.8")
          .fromTo(".loop-label", { opacity: 0 }, { opacity: 1, stagger: 0.08, ease: ease.precise }, "-=0.6")
          .to(borderRef.current, { strokeDashoffset: 0, ease: ease.precise }, "-=0.3");

        // The loop never stops — a slow standing rotation once it has drawn in, echoing "closed system."
        gsap.to(loopRef.current, {
          rotation: 360,
          transformOrigin: "110px 110px",
          duration: 40,
          ease: "none",
          repeat: -1,
        });
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="converge"
      data-chapter="converge"
      className="relative bg-[var(--mf-pub-bg)] px-6 py-28 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-4xl text-center">
        <div className="converge-fade relative mx-auto mb-10 size-48 sm:mb-12 sm:size-56">
          <svg viewBox="0 0 220 220" className="size-full overflow-visible" role="img" aria-label="Train, measure, recover, adapt, progress — a closed loop">
            <path
              ref={loopRef}
              d={LOOP_PATH_D}
              fill="none"
              stroke="var(--mf-brand)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              opacity="0.7"
            />
            {LOOP_STAGES.map((stage) => (
              <circle key={stage.label} className="loop-node" cx={stage.x} cy={stage.y} r="5" fill="var(--mf-pub-bg)" stroke="var(--mf-brand)" strokeWidth="2" />
            ))}
          </svg>

          {LOOP_STAGES.map((stage) => (
            <span
              key={stage.label}
              className="loop-label absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.12em] text-[var(--mf-pub-text-muted)]"
              style={{ left: `${(stage.lx / 220) * 100}%`, top: `${(stage.ly / 220) * 100}%` }}
            >
              {stage.label}
            </span>
          ))}
        </div>

        <p className="converge-fade text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">One System</p>

        <h2 className="converge-fade mt-6 font-heading text-5xl font-black uppercase leading-[0.9] tracking-tighter sm:text-6xl lg:text-7xl">
          Everything connected.
        </h2>

        <p className="converge-fade mx-auto mt-7 max-w-2xl text-base leading-8 text-[var(--mf-pub-text-secondary)]">
          Training, recovery, adaptive logic and Dante — one profile, one
          system, one coach.
        </p>

        <div className="converge-fade relative mx-auto mt-10 inline-block">
          <svg className="pointer-events-none absolute -inset-2" width="calc(100% + 16px)" height="calc(100% + 16px)">
            <rect
              ref={borderRef}
              x="1"
              y="1"
              width="calc(100% - 2px)"
              height="calc(100% - 2px)"
              rx="16"
              fill="none"
              stroke="var(--mf-brand)"
              strokeWidth="1.5"
            />
          </svg>

          <TransitionLink
            href={routes.signup}
            transitionLabel="Entering the system…"
            onClick={() => setConfirmed(true)}
            className="relative inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--mf-brand)] px-7 py-4 text-sm font-black uppercase tracking-wider text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)]"
          >
            Start before you feel ready
            {confirmed ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
          </TransitionLink>
        </div>
      </div>
    </section>
  );
}
