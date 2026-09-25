"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/components/experience/motion-home/motion/gsapSetup";
import { ease, enterOnce } from "@/components/experience/motion-home/motion/motionTokens";

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
              scrollTrigger: { trigger: rootRef.current, ...enterOnce },
            })
            .fromTo(".signal-heading", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.45, ease: ease.precise })
            .fromTo(
              ".signal-fragment",
              { opacity: 0, scale: 0.8 },
              { opacity: 1, scale: 1, duration: 0.3, stagger: 0.03, ease: ease.precise },
              "<0.08",
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
      className="relative overflow-x-clip bg-[var(--mf-pub-bg-deep)] px-6 py-16 lg:px-12 lg:py-24"
    >
      {/* Background atmosphere */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute right-1/3 top-1/2 size-[450px] -translate-y-1/2 rounded-full bg-[var(--mf-brand)]/4 blur-[130px]" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <div className="signal-heading inline-flex items-center gap-2 rounded-full border border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--mf-brand)]">
            <span className="size-1.5 rounded-full bg-[var(--mf-brand)]" />
            03 · State Integration
          </div>

          <h2 className="signal-heading mt-4 font-heading text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            It starts with <span className="text-[var(--mf-brand)]">your state</span>, not a chatbot.
          </h2>

          <p className="mt-6 max-w-lg text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Training workload, sleep metrics, nutrition targets, recovery scores, and personal history — signals most apps track separately — become one unified Digital Twin state Muscle Fitness actually reasons from.
          </p>

          <div className="signal-fragment mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Training Workload", status: "Active" },
              { label: "Sleep Quality", status: "8.2 hrs" },
              { label: "Nutrition Targets", status: "154g Protein" },
              { label: "Recovery Index", status: "87 Readiness" },
              { label: "User Preferences", status: "Hypertrophy" },
              { label: "Personal History", status: "30-Day Trend" },
            ].map((sig) => (
              <div key={sig.label} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[var(--mf-pub-text-muted)]">{sig.label}</p>
                <p className="mt-1 text-xs font-bold text-[var(--mf-brand)]">{sig.status}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Substantial Product State Graphic Card */}
        <div className="relative mx-auto w-full max-w-[480px]">
          <div className="signal-state relative rounded-[28px] border border-white/12 bg-gradient-to-b from-[#141822] via-[#0d1017] to-[#07090e] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--mf-brand)]">Digital Twin State</p>
                <h3 className="mt-1 text-lg font-black text-white">Unified Training Engine</h3>
              </div>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-400">
                Live Sync
              </span>
            </div>

            <div className="relative my-8 aspect-square w-full max-w-[320px] mx-auto">
              <svg viewBox="0 0 300 300" className="absolute inset-0 size-full overflow-visible">
                {SIGNALS.map((signal) => {
                  const outer = point(signal.angle, 125);
                  const inner = point(signal.angle, 48);

                  return (
                    <path
                      key={signal.label}
                      className="signal-path"
                      d={`M ${outer.x},${outer.y} L ${inner.x},${inner.y}`}
                      fill="none"
                      stroke="var(--mf-brand)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      opacity="0.6"
                    />
                  );
                })}
              </svg>

              {SIGNALS.map((signal) => {
                const { x, y } = point(signal.angle, 125);
                return (
                  <span
                    key={signal.label}
                    className="signal-fragment absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[9.5px] font-black uppercase tracking-[0.12em] text-white shadow-lg backdrop-blur-md"
                    style={{ left: `${(x / 300) * 100}%`, top: `${(y / 300) * 100}%` }}
                  >
                    {signal.label}
                  </span>
                );
              })}

              <div className="signal-state absolute left-1/2 top-1/2 grid size-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-[var(--mf-brand)] bg-black p-2 text-center shadow-[0_0_30px_rgba(216,255,32,0.25)]">
                <p className="text-[10px] font-black uppercase leading-tight tracking-[0.12em] text-[var(--mf-brand)]">
                  Your
                  <br />
                  Training
                  <br />
                  State
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-4 text-[11px] text-zinc-400">
              <span>Readiness: <strong className="text-white">87 / 100</strong></span>
              <span>Autoregulation: <strong className="text-[var(--mf-brand)]">Optimal</strong></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
