import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { GymPartnersFigure, PlannerFigure, SquatLifterFigure } from "@/components/brand/athletic-figures";
import { Wordmark } from "@/components/brand/wordmark";
import { FeatureChapters } from "@/components/home/feature-chapters";
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

/* What each part of the day takes from you, and what it hands to the next. */
const thread = [
  {
    you: "Rate sleep, stress, fatigue, soreness, mood and readiness. Flag any pain or illness.",
    passes: "A readiness score from a fixed formula — and, if you flagged pain or illness, a hold on today's training.",
  },
  {
    you: "Run the session your plan scheduled. Every set is saved the moment you log it.",
    passes: "History, calendar entries and the last-time hints your next session starts from.",
  },
  {
    you: "Log meals by search, barcode, photo or by hand.",
    passes: "Calories and macros measured against the targets your plan sets.",
  },
  {
    you: "Ask about today, in your own words.",
    passes: "Answers drawn from the same check-in, session and food log — and proposals you apply or decline.",
  },
];

const commitments = [
  "Recovery scores, targets and macros come from fixed calculations. Dante explains them; it never invents them.",
  "Pain or illness puts training on hold until you clear it.",
  "Changes Dante suggests are proposals. You apply them or keep the original.",
  "When a food database or the coach is unavailable, the app says so.",
];

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const sectionTitle = "font-heading text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl";

function PullQuote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <figure className={cn("border-y border-[var(--mf-pub-border)]", className)}>
      <div className={cn(container, "grid gap-6 py-16 sm:py-24 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-12")}>
        <span
          aria-hidden="true"
          className="font-heading text-[5rem] font-black leading-[0.6] text-mf-pub-text sm:text-[7rem]"
        >
          &ldquo;
        </span>
        <blockquote className="max-w-[22ch] text-balance font-heading text-[clamp(2rem,7.5vw,4rem)] font-black uppercase leading-[0.98] tracking-tight text-mf-pub-text">
          {children}
        </blockquote>
      </div>
    </figure>
  );
}

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
          {/* Beside two buttons the name can't fit under 400px, so phones get the
              mark alone (the link keeps its accessible name) instead of "MUSC…". */}
          <Wordmark className="shrink max-[399px]:min-w-11 max-[399px]:[&>span:last-child]:sr-only max-[429px]:[&>span:last-child]:text-lg" />
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1 sm:gap-2">
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

        {/* ---------- One Day. One Thread. ---------- */}
        <section
          id="day"
          aria-labelledby="day-title"
          className="scroll-mt-16 border-t border-[var(--mf-pub-border)] bg-mf-pub-bg-deep"
        >
          <div className={cn(container, "relative py-16 sm:py-24")}>
            <SquatLifterFigure className="pointer-events-none absolute right-4 top-8 hidden size-40 lg:block xl:size-48" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mf-pub-text-muted">How it connects</p>
            <h2 id="day-title" className={cn(sectionTitle, "mt-3")}>
              One Day. One Thread.
            </h2>
            <p className="mt-4 max-w-[58ch] text-pretty text-base leading-7 text-mf-pub-text-secondary sm:text-lg sm:leading-8">
              Most fitness apps record what you did. Here, each part of the day hands something to the next, so
              the app — and Dante — can help decide what comes next.
            </p>

            <ol className="relative mt-12 grid gap-10 lg:mt-14 lg:grid-cols-4 lg:gap-6">
              {/* The thread: vertical on phones, horizontal from lg. */}
              <span aria-hidden="true" className="absolute bottom-2 left-[5px] top-2 w-[2px] bg-mf-pub-text lg:bottom-auto lg:left-0 lg:right-0 lg:top-[5px] lg:h-[2px] lg:w-auto" />
              {thread.map((step, index) => (
                <li key={checkpoints[index]} className="relative pl-8 lg:pl-0 lg:pt-8">
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1 block size-3 rounded-full bg-mf-brand ring-2 ring-mf-pub-text lg:top-0"
                  />
                  <p className="text-xs font-medium tabular-nums text-mf-pub-text-muted">0{index + 1}</p>
                  <h3 className="font-heading text-2xl font-black uppercase leading-tight text-mf-pub-text">
                    {checkpoints[index]}
                  </h3>
                  <p className="mt-2 text-[15px] leading-6 text-mf-pub-text-secondary">{step.you}</p>
                  <div className="mt-4 rounded-xl border border-[var(--mf-pub-border-strong)] bg-mf-pub-surface p-4">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-mf-pub-text">
                      Passes on <ArrowRight aria-hidden="true" className="size-3.5" />
                    </p>
                    <p className="mt-1.5 text-sm leading-6 text-mf-pub-text-secondary">{step.passes}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-12 max-w-[70ch] border-l-4 border-mf-brand pl-4 text-pretty text-base leading-7 text-mf-pub-text">
              The thread also carries caution. A check-in that flags pain or illness holds training on Today,
              Training and Recovery, and Dante sees the same hold before it answers.
            </p>
          </div>
        </section>

        <PullQuote>
          The work happens in the gym. The clarity comes from{" "}
          <span className="bg-mf-brand px-1 text-mf-brand-ink [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
            knowing what it means.
          </span>
        </PullQuote>

        {/* ---------- Inside the app ---------- */}
        <section id="features" aria-labelledby="features-title" className="scroll-mt-16">
          <div className={cn(container, "py-16 sm:py-24")}>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mf-pub-text-muted">Inside the app</p>
            <h2 id="features-title" className={cn(sectionTitle, "mt-3 max-w-[18ch]")}>
              Seven parts. One day.
            </h2>
            <p className="mt-4 max-w-[58ch] text-pretty text-base leading-7 text-mf-pub-text-secondary sm:text-lg sm:leading-8">
              Every screen below ships in the app today. Previews use sample values and are labelled that way.
            </p>
            <div className="mt-14 sm:mt-20">
              <FeatureChapters />
            </div>
          </div>
        </section>

        <PullQuote className="bg-mf-pub-bg-deep">
          Numbers come from formulas. Dante explains them —{" "}
          <span className="bg-mf-brand px-1 text-mf-brand-ink [box-decoration-break:clone] [-webkit-box-decoration-break:clone]">
            it never invents them.
          </span>
        </PullQuote>

        {/* ---------- Trust ---------- */}
        <section aria-labelledby="trust-title">
          <div className={cn(container, "py-16 sm:py-24")}>
            <PlannerFigure className="float-right ml-6 hidden size-36 sm:block" />
            <h2 id="trust-title" className={sectionTitle}>
              What you can rely on
            </h2>
            <ul className="mt-8 grid gap-x-10 gap-y-4 text-[15px] leading-6 text-mf-pub-text-secondary sm:grid-cols-2">
              {commitments.map((line) => (
                <li key={line} className="flex gap-3">
                  <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-mf-action" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-mf-pub-text-muted">
              A training tool, not medical advice.{" "}
              <Link
                href="/responsible-ai"
                className="inline-flex min-h-11 items-center text-mf-pub-text-secondary underline underline-offset-4 hover:text-mf-pub-text"
              >
                How we use AI
              </Link>
            </p>
          </div>
        </section>

        {/* ---------- Closing CTA: an iron plate, where the hero was paper ---------- */}
        <section aria-labelledby="cta-title" className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-[28px] bg-mf-pub-text text-mf-pub-bg">
            <div className="grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end lg:p-14">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--lime)]">Start the thread</p>
                <h2
                  id="cta-title"
                  className="mt-4 text-balance font-heading text-[clamp(2.5rem,11vw,5rem)] font-black uppercase leading-[0.92] tracking-tight text-mf-pub-bg"
                >
                  Tomorrow starts with today&apos;s check-in.
                </h2>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href={signedIn ? "/dashboard" : "/signup"}
                    className={buttonVariants({ size: "lg", className: "uppercase tracking-[0.06em]" })}
                  >
                    {signedIn ? "Open dashboard" : "Create your account"}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                  {signedIn ? null : (
                    <Link
                      href="/login"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-mf-pub-bg underline-offset-4 hover:underline"
                    >
                      I already have an account
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <ol className="space-y-3">
                  {(signedIn
                    ? ["Check in for today", "Run the session on your plan", "Ask Dante what it means"]
                    : ["Create an account", "Set up your profile", "Check in — today fills in from there"]
                  ).map((step, index) => (
                    <li
                      key={step}
                      className="flex items-baseline gap-4 border-t border-[color-mix(in_srgb,var(--mf-pub-bg)_22%,transparent)] pt-3"
                    >
                      <span className="font-heading text-2xl font-black tabular-nums text-[var(--lime)]">0{index + 1}</span>
                      <span className="text-base font-medium">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex items-center gap-4 rounded-2xl bg-mf-pub-bg p-4 text-mf-pub-text">
                  <GymPartnersFigure className="size-16 shrink-0" />
                  <p className="text-sm leading-6 text-mf-pub-text-secondary">
                    Estimates are labelled as estimates, and every change Dante suggests waits for your answer.
                  </p>
                </div>
              </div>
            </div>
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
                className="inline-flex h-11 min-w-11 items-center justify-center hover:text-mf-pub-text"
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
