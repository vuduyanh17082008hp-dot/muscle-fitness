"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { useLenis } from "@/components/experience/motion-home/motion/useLenis";
import { useSceneDirector } from "@/components/experience/motion-home/motion/useSceneDirector";
import { ScrollTrigger } from "@/components/experience/motion-home/motion/gsapSetup";
import { ChapterNav } from "@/components/experience/motion-home/ChapterNav";
import { GlobalAtmosphere } from "@/components/experience/motion-home/GlobalAtmosphere";
import { DebugPanel } from "@/components/experience/motion-home/DebugPanel";
import { CustomCursor } from "@/components/experience/motion-home/interaction/CustomCursor";
import { PageTransition } from "@/components/experience/motion-home/interaction/PageTransition";
import { HeroScene } from "@/components/experience/motion-home/sections/HeroScene";
import { ProblemScene } from "@/components/experience/motion-home/sections/ProblemScene";
import { AdaptiveTrainingScene } from "@/components/experience/motion-home/sections/AdaptiveTrainingScene";
import { AthleteSignalScene } from "@/components/experience/motion-home/sections/AthleteSignalScene";
import { TrainingScene } from "@/components/experience/motion-home/sections/TrainingScene";
import { MuscleIntelligenceScene } from "@/components/experience/motion-home/sections/MuscleIntelligenceScene";
import { RecoveryScene } from "@/components/experience/motion-home/sections/RecoveryScene";
import { NutritionScene } from "@/components/experience/motion-home/sections/NutritionScene";
import { AdaptScene } from "@/components/experience/motion-home/sections/AdaptScene";
import { DanteScene } from "@/components/experience/motion-home/sections/DanteScene";
import { ConvergenceScene } from "@/components/experience/motion-home/sections/ConvergenceScene";
import { UserSegmentScene } from "@/components/experience/motion-home/sections/UserSegmentScene";
import { MotionFooter } from "@/components/experience/motion-home/sections/MotionFooter";
import type { MotionHomepageViewModel } from "@/components/experience/motion-home/data/homepageViewModel";
import styles from "@/components/experience/motion-home/styles/motion-home.module.css";

export function MotionHomepage({ viewModel }: { viewModel: MotionHomepageViewModel }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [activeChapter, setActiveChapter] = useState<string>("hero");

  useLenis(true);
  useSceneDirector(rootRef, useCallback((id: string) => setActiveChapter(id), []));

  useEffect(() => {
    if (typeof document === "undefined" || !("fonts" in document)) return;
    document.fonts.ready.then(() => ScrollTrigger.refresh());
  }, []);

  const { routes } = viewModel;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <PageTransition>
      <div ref={rootRef} className="relative bg-[var(--mf-pub-bg)] text-white">
        <GlobalAtmosphere />
        <CustomCursor />
        <DebugPanel activeChapter={activeChapter} />

        <header className="fixed inset-x-0 top-0 z-50 border-b border-[var(--mf-pub-border)] bg-[var(--mf-pub-bg)]/80 backdrop-blur-xl">
          <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Logo tagline="AI-powered personal training" />
              <span className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
                <span className={`${styles.pulseDot} size-1.5 rounded-full bg-[var(--mf-brand)]`} />
                <span className={`${styles.monoLabel} text-[10px] uppercase tracking-[0.16em] text-zinc-500`}>
                  Live
                </span>
              </span>
            </div>

            <nav className="hidden items-center gap-6 lg:flex">
              {[
                { label: "Dashboard", href: routes.dashboard },
                { label: "Train", href: routes.training },
                { label: "Nutrition", href: routes.nutrition },
                { label: "Progress", href: routes.progress },
                { label: "Dante", href: routes.chatbot },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-[13px] font-semibold text-zinc-400 transition hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href={routes.login}
                className="hidden rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/20 hover:bg-white/5 sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                href={routes.signup}
                className="rounded-xl bg-[var(--mf-brand)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[var(--mf-brand-ink)] transition hover:bg-[var(--mf-brand-hover)]"
              >
                Start now
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label="Toggle navigation menu"
                className="inline-flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 lg:hidden"
              >
                <span className="text-xs font-bold uppercase">{mobileMenuOpen ? "✕" : "☰"}</span>
              </button>
            </div>
          </div>

          {/* Mobile Menu Drawer — closes immediately on any link click */}
          {mobileMenuOpen && (
            <div className="border-t border-white/10 bg-[var(--mf-pub-bg)]/95 px-6 py-4 backdrop-blur-2xl lg:hidden">
              <nav className="flex flex-col gap-3">
                {[
                  { label: "Dashboard", href: routes.dashboard },
                  { label: "Train", href: routes.training },
                  { label: "Nutrition", href: routes.nutrition },
                  { label: "Progress", href: routes.progress },
                  { label: "Dante", href: routes.chatbot },
                  { label: "Log in", href: routes.login },
                ].map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
          )}
        </header>

        <ChapterNav activeChapter={activeChapter} />

        <main className="relative z-10">
          <HeroScene routes={routes} />
          <ProblemScene />
          <AdaptiveTrainingScene />
          <UserSegmentScene routes={routes} />
          <AthleteSignalScene />
          <TrainingScene training={viewModel.training} routes={routes} />
          <MuscleIntelligenceScene muscle={viewModel.muscle} dante={viewModel.dante} routes={routes} />
          <RecoveryScene recovery={viewModel.recovery} nutrition={viewModel.nutrition} routes={routes} />
          <NutritionScene nutrition={viewModel.nutrition} routes={routes} />
          <AdaptScene adapt={viewModel.adapt} />
          <DanteScene dante={viewModel.dante} routes={routes} />
          <ConvergenceScene routes={routes} />
        </main>

        <MotionFooter routes={routes} />
      </div>
    </PageTransition>
  );
}
