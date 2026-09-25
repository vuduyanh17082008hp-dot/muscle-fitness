"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, enterOnce } from "@/components/experience/motion-home/motion/motionTokens";
import { useMotionCapabilities } from "@/components/experience/motion-home/motion/useMotionCapabilities";
import { DanteRobot, type DanteRobotState } from "@/components/dante/dante-robot";
import type { DanteViewModel, HomepageRoutes } from "@/components/experience/motion-home/data/homepageViewModel";

const CLICK_COOLDOWN_MS = 1600;

const INPUTS = [
  { label: "Training", angle: 200 },
  { label: "Recovery", angle: 250 },
  { label: "Adapt", angle: 290 },
  { label: "History", angle: 340 },
] as const;

function point(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 150 + radius * Math.cos(rad), y: 150 + radius * Math.sin(rad) };
}

export function DanteScene({ dante, routes }: { dante: DanteViewModel; routes: HomepageRoutes }) {
  const rootRef = useRef<HTMLElement>(null);
  const coreRef = useRef<HTMLDivElement>(null);
  const onCooldownRef = useRef(false);
  const cooldownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { reducedMotion } = useMotionCapabilities();
  const [danteVisualState, setDanteVisualState] = useState<DanteRobotState>("idle");

  useEffect(() => {
    return () => {
      if (cooldownTimeoutRef.current) clearTimeout(cooldownTimeoutRef.current);
    };
  }, []);

  // Click-to-acknowledge on the core mascot only — the scene's other
  // elements (heading, input labels, status pill) never get a handler,
  // so they stay inert by design. Combines a GSAP nod on the wrapper
  // with DanteRobot's own real "success" state (core glow pulse) —
  // never the random/comedic loop the real Dante mascot deliberately
  // doesn't have.
  const acknowledge = useCallback(() => {
    if (reducedMotion || onCooldownRef.current || !coreRef.current) return;

    onCooldownRef.current = true;
    setDanteVisualState("success");
    cooldownTimeoutRef.current = setTimeout(() => {
      onCooldownRef.current = false;
      setDanteVisualState("idle");
    }, CLICK_COOLDOWN_MS);

    gsap
      .timeline()
      .to(coreRef.current, { scale: 1.03, rotate: -4, duration: 0.18, ease: "back.out(1.6)" })
      .to(coreRef.current, { scale: 1, duration: 0.25, ease: "power2.out" }, "-=0.05")
      .to(coreRef.current, { rotate: 0, duration: 0.3, ease: "elastic.out(1,0.6)" }, "<");
  }, [reducedMotion]);

  const onCoreKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        acknowledge();
      }
    },
    [acknowledge],
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add(
        { reduceMotion: "(prefers-reduced-motion: reduce)", full: "(prefers-reduced-motion: no-preference)" },
        (context) => {
        const { reduceMotion } = context.conditions as { reduceMotion: boolean };

        const paths = gsap.utils.toArray<SVGPathElement>(".dante-path");

        if (reduceMotion) {
          gsap.set(paths, { strokeDashoffset: 0 });
          gsap.set(".dante-heading, .dante-input, .dante-core", { opacity: 1, scale: 1, y: 0 });
          return;
        }

        paths.forEach((path) => {
          const length = path.getTotalLength();
          gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
        });

        // Fast, time-based reveal fired once on scroll-into-view (see
        // AthleteSignalScene for why scroll-scrubbed timelines read as
        // "arrives too late" here).
        gsap
          .timeline({
            scrollTrigger: { trigger: rootRef.current, ...enterOnce },
          })
          .fromTo(".dante-heading", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: ease.precise })
          .fromTo(".dante-input", { opacity: 0 }, { opacity: 1, duration: 0.3, stagger: 0.04, ease: ease.precise }, "-=0.3")
          .to(paths, { strokeDashoffset: 0, duration: 0.3, stagger: 0.04, ease: ease.precise }, "<")
          .fromTo(".dante-core", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: ease.soft }, "-=0.15");
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <section
      ref={rootRef}
      id="dante"
      data-chapter="dante"
      className="relative overflow-x-clip bg-[var(--mf-pub-bg-deep)] px-6 py-16 lg:px-12 lg:py-24"
    >
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--mf-violet)]">08 · Dante</p>

          <h2 className="dante-heading mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            Why did my performance change?
          </h2>

          <p className="mt-6 max-w-md text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Dante reads your training, recovery, adaptive state and history
            before it answers — then explains, never invents, the signals
            behind it.
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mf-violet)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-violet)]" />
            {dante.statusLabel}
          </div>

          <div>
            <Link
              href={routes.chatbot}
              className="mt-7 flex w-fit items-center gap-2 text-sm font-black uppercase tracking-[0.12em] text-[var(--mf-violet)] transition hover:text-violet-300"
            >
              Ask Dante
            </Link>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[380px]">
          <svg viewBox="0 0 300 300" className="absolute inset-0 size-full overflow-visible">
            {INPUTS.map((input) => {
              const outer = point(input.angle, 130);
              const inner = point(input.angle, 44);

              return (
                <path
                  key={input.label}
                  className="dante-path"
                  d={`M ${outer.x},${outer.y} L ${inner.x},${inner.y}`}
                  fill="none"
                  stroke="var(--mf-violet)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              );
            })}
          </svg>

          {INPUTS.map((input) => {
            const { x, y } = point(input.angle, 130);
            return (
              <span
                key={input.label}
                className="dante-input absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[var(--mf-pub-text-secondary)]"
                style={{ left: `${(x / 300) * 100}%`, top: `${(y / 300) * 100}%` }}
              >
                {input.label}
              </span>
            );
          })}

          <div
            ref={coreRef}
            role="button"
            tabIndex={0}
            aria-label="Dante, floating performance coach"
            onClick={acknowledge}
            onKeyDown={onCoreKeyDown}
            className="dante-core absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-violet)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mf-pub-bg-deep)]"
          >
            <DanteRobot size="sm" state={danteVisualState} interactive />
          </div>
        </div>
      </div>
    </section>
  );
}
