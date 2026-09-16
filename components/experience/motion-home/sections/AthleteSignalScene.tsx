"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease } from "@/components/experience/motion-home/motion/motionTokens";

/**
 * Scene 02 — Athlete Signal. Muscle Fitness doesn't start from "AI
 * chat" — it starts from the athlete. Six fragmented signal labels
 * converge via self-drawing lines into one Athlete State node,
 * mirroring DanteScene's outward INPUTS pattern in reverse.
 */
const SIGNALS = [
  { label: "Training", angle: 200 },
  { label: "Sleep", angle: 250 },
  { label: "Nutrition", angle: 290 },
  { label: "Recovery", angle: 340 },
  { label: "Preferences", angle: 20 },
  { label: "History", angle: 70 },
] as const;

function point(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 150 + radius * Math.cos(rad), y: 150 + radius * Math.sin(rad) };
}

export function AthleteSignalScene() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
          const { reduceMotion } = context.conditions as { reduceMotion: boolean };

          const paths = gsap.utils.toArray<SVGPathElement>(".signal-path");

          if (reduceMotion) {
            gsap.set(paths, { strokeDashoffset: 0 });
            gsap.set(".signal-heading, .signal-fragment, .signal-state", { opacity: 1, scale: 1, y: 0 });
            return;
          }

          paths.forEach((path) => {
            const length = path.getTotalLength();
            gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
          });

          // Fast, time-based reveal fired once on scroll-into-view —
          // NOT scroll-scrubbed. A scrubbed timeline spreads the
          // reveal across the whole scroll distance through the
          // section, so the headline (first in the timeline) is
          // already done while the signal diagram (later in the
          // timeline) stays empty until the user scrolls much
          // further — reads as "arrives too late". Firing once and
          // completing on a fixed, short duration keeps the headline
          // and the diagram synchronized regardless of scroll speed.
          gsap
            .timeline({
              scrollTrigger: { trigger: rootRef.current, start: "top 78%", once: true },
            })
            .fromTo(".signal-heading", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: ease.precise })
            .fromTo(
              ".signal-fragment",
              { opacity: 0, scale: 0.8 },
              { opacity: 1, scale: 1, duration: 0.3, stagger: 0.03, ease: ease.precise },
              "-=0.3",
            )
            .to(paths, { strokeDashoffset: 0, duration: 0.3, stagger: 0.02, ease: ease.precise }, "<")
            .fromTo(".signal-state", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: ease.soft }, "-=0.2");
        },
      );

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="signal"
      data-chapter="signal"
      className="relative overflow-hidden bg-[var(--mf-pub-bg-deep)] px-6 py-24 lg:px-12 lg:py-32"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-brand)]">03 · Signal</p>

          <h2 className="signal-heading mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            It starts with <span className="text-[var(--mf-brand)]">you</span>, not a chatbot.
          </h2>

          <p className="mt-6 max-w-md text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Training, sleep, nutrition, recovery, preferences and history —
            signals most apps track separately — become one athlete state
            Muscle Fitness actually reasons from.
          </p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[380px]">
          <svg viewBox="0 0 300 300" className="absolute inset-0 size-full overflow-visible">
            {SIGNALS.map((signal) => {
              const outer = point(signal.angle, 130);
              const inner = point(signal.angle, 44);

              return (
                <path
                  key={signal.label}
                  className="signal-path"
                  d={`M ${outer.x},${outer.y} L ${inner.x},${inner.y}`}
                  fill="none"
                  stroke="var(--mf-brand)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.55"
                />
              );
            })}
          </svg>

          {SIGNALS.map((signal) => {
            const { x, y } = point(signal.angle, 130);
            return (
              <span
                key={signal.label}
                className="signal-fragment absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[var(--mf-pub-text-secondary)]"
                style={{ left: `${(x / 300) * 100}%`, top: `${(y / 300) * 100}%` }}
              >
                {signal.label}
              </span>
            );
          })}

          <div className="signal-state absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-pub-bg)] p-2 text-center">
            <p className="text-[9px] font-black uppercase leading-tight tracking-[0.1em] text-[var(--mf-brand)]">
              Athlete
              <br />
              State
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
