import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Dumbbell,
  HeartPulse,
  Utensils,
} from "lucide-react";

import { GymPartnersFigure, PlannerFigure, SquatLifterFigure } from "@/components/brand/athletic-figures";
import { Wordmark } from "@/components/brand/wordmark";
import { checkpoints, SignalHero } from "@/components/home/signal-hero";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Public landing (`/`). Editorial: no live metrics, no canvas, no
 * scroll-driven reveal. The only motion is the hero's one-shot CSS
 * opening, and every line is readable without it. Copy describes
 * features that exist in the app today; nothing here is a user's data.
 * Rendered in Iron & Paper (data-theme="paper", app/paper-theme.css).
 */

const day = [
  {
    title: "Check in",
    body: "Log sleep, soreness, stress and any pain or illness. The recovery score comes from a fixed formula, not from AI. Report pain or illness and today's training is held until you clear it.",
  },
  {
    title: "Run today's session",
    body: "Start the session your plan scheduled. Each exercise shows what you lifted last time, and every set is saved the moment you log it.",
  },
  {
    title: "Log what you eat",
    body: "Search, scan a barcode or take a photo. Macros are recalculated on the server from the portion you confirm, and photo estimates stay labelled as estimates.",
  },
  {
    title: "Ask Dante",
    body: "Dante reads the same day — the workout, the food log, the check-in — and answers from it. Plan changes arrive as proposals that you review and confirm.",
  },
];

const capabilities = [
  {
    icon: Dumbbell,
    tone: "text-mf-training",
    title: "Training",
    points: [
      "Plans with a session scheduled for each day",
      "Compact set logger with last-time hints",
      "History and a training calendar",
    ],
  },
  {
    icon: Utensils,
    tone: "text-zinc-300",
    title: "Nutrition",
    points: [
      "Food search, barcode and photo logging",
      "Daily calorie and macro targets from your plan",
      "A nutrition coach that reads your actual log",
    ],
  },
  {
    icon: HeartPulse,
    tone: "text-zinc-300",
    title: "Recovery",
    points: [
      "Daily check-in in under a minute",
      "Readiness score and seven-day trend",
      "Training holds when you report pain or illness",
    ],
  },
  {
    icon: Bot,
    tone: "text-mf-assistant",
    title: "Dante",
    points: [
      "Answers from your training, food and recovery",
      "Safety checks run before any reply",
      "Suggests changes; you decide what applies",
    ],
  },
];

const commitments = [
  "Recovery scores, targets and macros come from fixed calculations. Dante explains them; it never invents them.",
  "Pain or illness puts training on hold until you clear it.",
  "Plan changes are proposals. Nothing applies until you confirm it.",
  "When a food database or the coach is unavailable, the app says so.",
];

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  return (
    <div data-theme="paper" className="min-h-screen bg-mf-pub-bg text-mf-pub-text">
      <header className="sticky top-0 z-40 border-b border-[var(--mf-pub-border)] bg-mf-pub-bg/90 backdrop-blur">
        <div
          className={cn(
            container,
            "flex h-16 items-center justify-between gap-3",
          )}
        >
          <Wordmark className="shrink" />
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <a
              href="#day"
              className="hidden h-11 items-center rounded-xl px-3 text-sm font-medium text-mf-pub-text-secondary transition-colors hover:text-mf-pub-text md:inline-flex"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hidden h-11 items-center rounded-xl px-3 text-sm font-medium text-mf-pub-text-secondary transition-colors hover:text-mf-pub-text md:inline-flex"
            >
              Features
            </a>
            {signedIn ? (
              <Link href="/dashboard" className={buttonVariants()}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className={buttonVariants({
                    variant: "ghost",
                    className: "text-mf-pub-text-secondary",
                  })}
                >
                  Log in
                </Link>
                <Link href="/signup" className={buttonVariants()}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <div className={container}>
          <SignalHero signedIn={signedIn} />
        </div>

        <section
          id="day"
          aria-labelledby="day-title"
          className="scroll-mt-16 border-t border-[var(--mf-pub-border)] bg-mf-pub-bg-deep"
        >
          <div className={cn(container, "relative py-16 sm:py-20")}>
            <SquatLifterFigure className="pointer-events-none absolute right-4 top-6 hidden size-40 lg:block xl:size-48" />
            <h2
              id="day-title"
              className="font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl"
            >
              One day, one thread
            </h2>
            <p className="mt-3 max-w-[60ch] text-base leading-7 text-mf-pub-text-secondary">
              Most fitness apps record what you did. Muscle Fitness uses it to
              decide what comes next — each step below feeds the one after it.
            </p>
            <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[var(--mf-pub-border)] bg-[var(--mf-pub-border)] sm:grid-cols-2 lg:grid-cols-4">
              {day.map((step, index) => (
                <li key={step.title} className="bg-mf-pub-surface p-6">
                  <p className="flex items-center gap-2 text-sm font-medium tabular-nums text-mf-pub-text-muted">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full border border-mf-pub-text bg-mf-brand"
                    />
                    0{index + 1} · {checkpoints[index]}
                  </p>
                  <h3 className="mt-2 font-heading text-xl font-bold uppercase text-mf-pub-text">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-6 text-mf-pub-text-secondary">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="features"
          aria-labelledby="features-title"
          className="scroll-mt-16 border-t border-[var(--mf-pub-border)]"
        >
          <div className={cn(container, "py-16 sm:py-20")}>
            <h2
              id="features-title"
              className="font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl"
            >
              What&apos;s inside
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {capabilities.map(({ icon: Icon, tone, title, points }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-[var(--mf-pub-border)] bg-mf-pub-surface p-6"
                >
                  <h3 className="flex items-center gap-3 font-heading text-xl font-bold uppercase text-mf-pub-text">
                    <Icon aria-hidden="true" className={cn("size-5", tone)} />
                    {title}
                  </h3>
                  <ul className="mt-4 space-y-2 text-[15px] leading-6 text-mf-pub-text-secondary">
                    {points.map((point) => (
                      <li key={point} className="flex gap-2">
                        <span
                          aria-hidden="true"
                          className="mt-2.5 size-1 shrink-0 rounded-full bg-mf-pub-text-muted"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="trust-title"
          className="border-t border-[var(--mf-pub-border)]"
        >
          <div className={cn(container, "py-16 sm:py-20")}>
            <PlannerFigure className="float-right ml-6 hidden size-36 sm:block" />
            <h2
              id="trust-title"
              className="font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl"
            >
              What you can rely on
            </h2>
            <ul className="mt-8 grid gap-x-10 gap-y-4 text-[15px] leading-6 text-mf-pub-text-secondary sm:grid-cols-2">
              {commitments.map((line) => (
                <li key={line} className="flex gap-3">
                  <Check
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-mf-action"
                  />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-mf-pub-text-muted">
              A training tool, not medical advice.{" "}
              <Link
                href="/responsible-ai"
                className="text-mf-pub-text-secondary underline underline-offset-4 hover:text-mf-pub-text"
              >
                How we use AI
              </Link>
            </p>
          </div>
        </section>

        <section
          aria-labelledby="cta-title"
          className="border-t border-[var(--mf-pub-border)] bg-mf-pub-bg-deep"
        >
          <div
            className={cn(
              container,
              "flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between sm:py-20",
            )}
          >
            <div className="flex items-center gap-5">
              <GymPartnersFigure className="size-24 shrink-0 sm:size-28" />
              <div>
              <h2
                id="cta-title"
                className="font-heading text-4xl font-black uppercase tracking-tight sm:text-5xl"
              >
                Start with today.
              </h2>
              <p className="mt-2 text-base text-mf-pub-text-secondary">
                Set up your profile and plan in a few minutes.
              </p>
              </div>
            </div>
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className={buttonVariants({ size: "lg", className: "shrink-0" })}
            >
              {signedIn ? "Open dashboard" : "Get started"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--mf-pub-border)]">
        <div
          className={cn(
            container,
            "flex flex-col gap-4 py-8 text-sm text-mf-pub-text-muted sm:flex-row sm:items-center sm:justify-between",
          )}
        >
          <p>© {new Date().getFullYear()} Muscle Fitness</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5">
            {[
              ["Responsible AI", "/responsible-ai"],
              ["AI Fair", "/ai-fair"],
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="inline-flex h-11 items-center hover:text-mf-pub-text"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
