import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

import styles from "./signal-hero.module.css";

/**
 * Landing hero: headline, one signal line through the four parts of the
 * day, and a static product preview. Server-rendered; motion is CSS only
 * (see signal-hero.module.css) and never gates the links.
 * The checkpoint labels are shared with the "One day, one thread" section.
 */
export const checkpoints = ["Check-in", "Train", "Fuel", "Ask Dante"];

export function SignalHero({
  signedIn,
  className,
}: {
  signedIn: boolean;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="hero-title"
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-10 pb-12 pt-8 sm:pt-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:pb-14 lg:pt-20",
        className,
      )}
    >
      <div>
        <h1
          id="hero-title"
          className="font-heading text-[clamp(2.25rem,11.5vw,3.25rem)] font-black uppercase leading-[0.95] tracking-[-0.005em] sm:text-6xl lg:text-[4rem] lg:leading-[0.92] xl:text-[4.5rem]"
        >
          <span className={cn(styles.line, "block")}>Train smarter.</span>
          <span className={cn(styles.line, "block")}>Recover better.</span>
          <span className={cn(styles.line, "block")}>
            <span className="bg-mf-brand px-1.5 text-mf-brand-ink [box-decoration-break:clone]">
              Know what to do next.
            </span>
          </span>
        </h1>
        <div className={styles.fade}>
          <p className="mt-5 max-w-[46ch] text-base leading-7 text-mf-pub-text-secondary sm:mt-7 sm:text-lg sm:leading-8">
            Training, nutrition, recovery and AI coaching — connected
            throughout your day.
            <span className="hidden sm:inline">
              {" "}
              Dante answers from the same day&apos;s data, and you confirm
              every change.
            </span>
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:items-center">
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className={buttonVariants({
                size: "lg",
                className: cn(styles.sweep, "uppercase tracking-[0.06em]"),
              })}
            >
              {signedIn ? "Open dashboard" : "Get started"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a
              href="#day"
              className={buttonVariants({
                size: "lg",
                variant: "secondary",
                className: "uppercase tracking-[0.06em]",
              })}
            >
              Explore the product
            </a>
          </div>
        </div>
      </div>

      <div className="relative lg:col-span-2 lg:row-start-2">
        <span aria-hidden="true" className={styles.signalTrack} />
        <ol
          aria-label="How the day connects"
          className="relative grid grid-cols-4"
        >
          {checkpoints.map((label, index) => (
            <li key={label} className={cn(styles.node, "lg:pl-6")}>
              <span
                aria-hidden="true"
                className="block size-[11px] rounded-full bg-mf-brand ring-2 ring-mf-pub-text"
              />
              <span className="mt-3 block text-xs font-medium tabular-nums text-mf-pub-text-muted">
                0{index + 1}
              </span>
              <span className="block font-heading text-[15px] font-bold uppercase leading-tight tracking-[0.04em] text-mf-pub-text sm:text-lg">
                {label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <ProductPreview />
    </section>
  );
}

const card =
  "rounded-2xl border border-[var(--mf-pub-border-strong)] bg-mf-pub-surface-elevated shadow-[var(--shadow-card)]";

/* Curated sample values, internally consistent: breakfast 780 kcal / 54 g
   protein + the lunch card below = the day's fuel totals. */
function ProductPreview() {
  return (
    <figure className="lg:col-start-2 lg:row-start-1">
      <figcaption className="mb-3 text-xs font-medium text-mf-pub-text-muted">
        Product preview · sample day, not your data
      </figcaption>
      <div aria-hidden="true" className="relative pb-[76px] pt-[60px]">
        <div
          className={cn(
            styles.card,
            styles.cardBack,
            card,
            "absolute right-0 top-0 w-[68%] bg-mf-pub-surface px-4 py-3",
          )}
        >
          <p className="text-xs font-medium text-mf-training">
            Workout · set 3 of 4
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            Bench press · 80 kg × 6
          </p>
        </div>

        <div
          className={cn(
            styles.card,
            card,
            "relative z-10 mr-3 border-2 border-mf-pub-text p-4 sm:mr-12 sm:p-5",
          )}
        >
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-xl font-black uppercase text-mf-pub-text">
              Today
            </p>
            <p className="text-xs text-mf-pub-text-muted">Check-in done</p>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <svg viewBox="0 0 64 64" className="size-14 shrink-0 -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                stroke="var(--mf-pub-border-strong)"
                strokeWidth="6"
              />
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                stroke="var(--mf-brand)"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="132.3 169.6"
              />
            </svg>
            <div>
              <p className="text-sm text-mf-pub-text-secondary">Readiness</p>
              <p className="font-heading text-2xl font-bold leading-none text-white">
                78{" "}
                <span className="font-sans text-sm font-medium text-mf-pub-text-secondary">
                  Ready to train
                </span>
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--mf-pub-border)] bg-mf-pub-surface px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs text-mf-pub-text-muted">
                Today&apos;s session
              </p>
              <p className="text-sm font-semibold text-white">
                Upper body A · 5 exercises
              </p>
            </div>
            <span className="shrink-0 rounded-lg bg-mf-brand px-2.5 py-1 text-xs font-semibold text-mf-brand-ink">
              ~50 min
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-mf-pub-text-secondary">
            {[
              ["Calories", "1,420 / 2,450", "58%"],
              ["Protein", "96 / 150 g", "64%"],
            ].map(([name, value, fill]) => (
              <div key={name}>
                <p className="flex flex-col sm:flex-row sm:justify-between sm:gap-2">
                  <span>{name}</span>
                  <span className="tabular-nums text-white">{value}</span>
                </p>
                <span className="mt-1.5 block h-1 rounded-full bg-[var(--mf-pub-border-strong)]">
                  <span
                    className="block h-full rounded-full bg-mf-brand"
                    style={{ width: fill }}
                  />
                </span>
              </div>
            ))}
          </div>

          <p className="mt-4 border-t border-[var(--mf-pub-border)] pt-3 text-sm leading-6 text-mf-pub-text-secondary">
            <span className="font-semibold text-mf-assistant">Dante</span> ·
            Sleep and soreness look normal, so today&apos;s session stays as
            planned.
          </p>
        </div>

        <div
          className={cn(
            styles.card,
            styles.cardSide,
            card,
            "absolute bottom-0 right-0 z-20 w-[62%] px-4 py-3 sm:w-[52%]",
          )}
        >
          <p className="text-xs font-medium text-mf-pub-text-muted">
            Lunch · logged
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            Chicken rice bowl
          </p>
          <p className="text-xs tabular-nums text-mf-pub-text-secondary">
            640 kcal · 42 g protein
          </p>
        </div>
      </div>
    </figure>
  );
}
