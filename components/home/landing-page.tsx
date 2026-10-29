import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Dumbbell,
  HeartPulse,
  Utensils,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Public landing (`/`). Static and editorial: no live metrics, no canvas,
 * no scroll-driven reveal — every line is readable on first paint.
 * Copy describes features that exist in the app today; nothing here is a
 * user's data.
 */

const day = [
  {
    when: "Morning",
    title: "Check in",
    body: "Log sleep, soreness, stress and any pain or illness. The recovery score comes from a fixed formula, not from AI. Report pain or illness and today's training is held until you clear it.",
  },
  {
    when: "Training",
    title: "Run today's session",
    body: "Start the session your plan scheduled. Each exercise shows what you lifted last time, and every set is saved the moment you log it.",
  },
  {
    when: "Meals",
    title: "Log what you eat",
    body: "Search, scan a barcode or take a photo. Macros are recalculated on the server from the portion you confirm, and photo estimates stay labelled as estimates.",
  },
  {
    when: "Evening",
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
    <div className="min-h-screen bg-mf-pub-bg text-mf-pub-text">
      <header className="sticky top-0 z-40 border-b border-[var(--mf-pub-border)] bg-mf-pub-bg/90 backdrop-blur">
        <div
          className={cn(
            container,
            "flex h-16 items-center justify-between gap-3",
          )}
        >
          <Logo />
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <a
              href="#day"
              className="hidden h-11 items-center rounded-xl px-3 text-sm font-medium text-mf-pub-text-secondary transition-colors hover:text-white md:inline-flex"
            >
              How it works
            </a>
            <a
              href="#features"
              className="hidden h-11 items-center rounded-xl px-3 text-sm font-medium text-mf-pub-text-secondary transition-colors hover:text-white md:inline-flex"
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
                  Start now
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section
          aria-labelledby="hero-title"
          className={cn(
            container,
            "grid gap-12 pb-16 pt-12 sm:pb-20 sm:pt-20 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24",
          )}
        >
          <div>
            <p className="text-sm font-semibold text-mf-action">
              Training · Nutrition · Recovery · Coaching
            </p>
            <h1
              id="hero-title"
              className="mt-4 max-w-[15ch] font-heading text-[2.5rem] font-bold leading-[1.02] tracking-[-0.01em] sm:text-6xl lg:text-[4.5rem]"
            >
              Know what to train, eat and recover today.
            </h1>
            <p className="mt-6 max-w-[58ch] text-base leading-7 text-mf-pub-text-secondary sm:text-lg sm:leading-8">
              Muscle Fitness connects your workouts, food log and recovery
              check-ins, so today&apos;s plan reflects what actually happened
              yesterday. Dante, the in-app coach, explains that plan from your
              own data — and you stay in control of every change.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={signedIn ? "/dashboard" : "/signup"}
                className={buttonVariants({ size: "lg" })}
              >
                {signedIn ? "Open dashboard" : "Start now"}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
              <a
                href="#day"
                className={buttonVariants({ size: "lg", variant: "secondary" })}
              >
                See how a day works
              </a>
            </div>
          </div>
          <aside
            aria-labelledby="trust-title"
            className="rounded-2xl border border-[var(--mf-pub-border)] bg-mf-pub-surface p-6 sm:p-7"
          >
            <h2 id="trust-title" className="text-lg font-semibold text-white">
              What you can rely on
            </h2>
            <ul className="mt-4 space-y-3 text-[15px] leading-6 text-mf-pub-text-secondary">
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
            <p className="mt-5 border-t border-[var(--mf-pub-border)] pt-4 text-sm text-mf-pub-text-muted">
              A training tool, not medical advice.{" "}
              <Link
                href="/responsible-ai"
                className="text-mf-pub-text-secondary underline underline-offset-4 hover:text-white"
              >
                How we use AI
              </Link>
            </p>
          </aside>
        </section>

        <section
          id="day"
          aria-labelledby="day-title"
          className="scroll-mt-16 border-t border-[var(--mf-pub-border)] bg-mf-pub-bg-deep"
        >
          <div className={cn(container, "py-16 sm:py-20")}>
            <h2
              id="day-title"
              className="font-heading text-3xl font-bold sm:text-4xl"
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
                  <p className="text-sm font-medium tabular-nums text-mf-pub-text-muted">
                    {index + 1} · {step.when}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-white">
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
              className="font-heading text-3xl font-bold sm:text-4xl"
            >
              What&apos;s inside
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {capabilities.map(({ icon: Icon, tone, title, points }) => (
                <li
                  key={title}
                  className="rounded-2xl border border-[var(--mf-pub-border)] bg-mf-pub-surface p-6"
                >
                  <h3 className="flex items-center gap-3 text-lg font-semibold text-white">
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
          aria-labelledby="cta-title"
          className="border-t border-[var(--mf-pub-border)] bg-mf-pub-bg-deep"
        >
          <div
            className={cn(
              container,
              "flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between sm:py-20",
            )}
          >
            <div>
              <h2
                id="cta-title"
                className="font-heading text-3xl font-bold sm:text-4xl"
              >
                Start with today.
              </h2>
              <p className="mt-2 text-base text-mf-pub-text-secondary">
                Set up your profile and plan in a few minutes.
              </p>
            </div>
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className={buttonVariants({ size: "lg", className: "shrink-0" })}
            >
              {signedIn ? "Open dashboard" : "Start now"}
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
                className="inline-flex h-11 items-center hover:text-white"
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
