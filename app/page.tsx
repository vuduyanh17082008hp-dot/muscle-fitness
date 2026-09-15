import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";

import {
  Activity,
  Apple,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Database,
  Dumbbell,
  HeartPulse,
  Layers,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Utensils,
  type LucideIcon,
} from "lucide-react";

import {
  InspirationStory,
} from "@/components/home/inspiration-story";
import { ProfileGateway } from "@/components/home/profile-gateway";
import { FeatureExplorer } from "@/components/home/feature-explorer";
import { DanteRobot } from "@/components/dante/dante-robot";
import { Reveal, StaggerContainer, StaggerItem } from "@/components/animation/reveal";
import { PageVisual } from "@/components/visual/page-visual";
import { cn } from "@/lib/utils";

/* =========================================================
   CONTENT
========================================================= */

const problems = [
  "Generic workout plans that ignore the individual.",
  "Contradictory nutrition and supplement advice.",
  "Training, food and recovery tracked in separate systems.",
  "Expensive coaching that is difficult to access consistently.",
] as const;

const productSystems = [
  {
    icon: Dumbbell,
    label: "Plan",
    title: "Training",
    text:
      "Recommended splits, custom plans, exercise selection, sets, reps, RIR, volume and progression.",
    cta: "Explore Training",
    href: "/training",
    accent: "sunset",
  },

  {
    icon: Apple,
    label: "Fuel",
    title: "Nutrition",
    text:
      "Calorie and macro targets, practical food guidance and profile-aware meal recommendations.",
    cta: "Explore Nutrition",
    href: "/meal-plan",
    accent: "sunset",
  },

  {
    icon: HeartPulse,
    label: "Restore",
    title: "Recovery",
    text:
      "Sleep, stress and check-in context that helps coaching reflect how the client is actually recovering.",
    cta: "Explore Recovery",
    href: "/dashboard/recovery",
    accent: "sunset",
  },

  {
    icon: BrainCircuit,
    label: "Decide",
    title: "Dante",
    text:
      "The AI layer that combines client context, product data and external evidence into practical next actions.",
    cta: "Ask Dante",
    href: "/chatbot",
    accent: "violet",
  },
] as const;

/**
 * Grouped, semantically organized for the "How Dante Works" intelligence
 * visualization (spec: Part C). Every entry here is a real, load-bearing
 * integration in the codebase — never a placeholder or aspirational
 * source. See lib/nutrition/food-data/*, lib/dante-core/, app/api/chatbot/route.ts
 * (PubChem/openFDA supplement lookups) and lib/workouts/excercise/route.ts (wger).
 */
const intelligenceSignals = [
  {
    label: "Personal context",
    accent: "sunset",
    items: ["Client profile", "Training data", "Nutrition context", "Recovery signals"],
  },
  {
    label: "Intelligence",
    accent: "violet",
    items: ["Athlete state", "Adaptive engine", "Knowledge brain"],
  },
  {
    label: "Verified data",
    accent: "cyan",
    items: ["PubMed / NCBI", "USDA FoodData Central", "Open Food Facts", "PubChem", "openFDA", "wger"],
  },
] as const;

/**
 * WHY CHOOSE MUSCLE FITNESS — real, load-bearing differentiators only
 * (spec: never a generic "professional trainers" reason). Each entry
 * maps to an actual shipped capability: the adaptive engine and
 * explainability layer in lib/dante-core/, the buildAthleteState()
 * aggregation in lib/athlete-state/, the Supabase-backed nutrition
 * CRUD, computeRecoveryScore() in lib/recovery/score.ts, and the
 * pgvector Knowledge Brain wired into app/api/chatbot/route.ts.
 */
type Differentiator = {
  icon: LucideIcon;
  label: string;
  title: string;
  text: string;
  href: string;
  accent?: "violet";
};

const leadDifferentiator: Differentiator = {
  icon: Activity,
  label: "Adapt",
  title: "Adaptive Training",
  text:
    "Recommendations respond to your actual performance, recovery and recent workload — not a static plan you outgrow in a week.",
  href: "/training",
};

const danteDifferentiators: Differentiator[] = [
  {
    icon: BrainCircuit,
    label: "Decide",
    title: "Dante",
    text:
      "Dante reads your real plan, training, nutrition and recovery state before it answers — not a generic chatbot.",
    href: "/chatbot",
    accent: "violet",
  },

  {
    icon: ListChecks,
    label: "Explain",
    title: "Why This?",
    text:
      "Every recommendation exposes the signals behind it — performance, RIR, recovery and recent load.",
    href: "/chatbot",
    accent: "violet",
  },
];

const supportingDifferentiators: Differentiator[] = [
  {
    icon: Layers,
    label: "Connect",
    title: "One Athlete Context",
    text: "Training, nutrition, recovery and progress feed one athlete state, not four disconnected apps.",
    href: "/dashboard",
  },

  {
    icon: Utensils,
    label: "Fuel",
    title: "Nutrition Intelligence",
    text: "Macro targets, barcode and food search, and daily tracking that stays in sync with training.",
    href: "/meal-plan",
  },

  {
    icon: HeartPulse,
    label: "Recover",
    title: "Recovery Intelligence",
    text: "Sleep, soreness, stress and training load inform a deterministic readiness score.",
    href: "/dashboard/recovery",
  },

  {
    icon: BookOpen,
    label: "Ground",
    title: "Evidence-Grounded Knowledge",
    text: "Dante can ground answers in a curated knowledge base and verified sources, not memory alone.",
    href: "/chatbot",
  },
];

const pillars = [
  {
    title: "Dedication",
    text: "Show up before motivation arrives.",
  },

  {
    title: "Determination",
    text: "Continue when progress slows.",
  },

  {
    title: "Drive",
    text: "Remember why you began.",
  },

  {
    title: "Discipline",
    text: "Do the work when nobody is watching.",
  },
] as const;

/* =========================================================
   #BUILTFORPERFORMANCE — device-frame wrapper shared by every
   showcase panel (spec Part 17: CSS device/browser frame around
   existing MF UI, never a generated mockup image).
========================================================= */

function ShowcasePanel({
  children,
  accentBorder,
  rotate,
  chrome,
}: {
  children: ReactNode;
  accentBorder: string;
  rotate: string;
  chrome: string;
}) {
  return (
    <div
      className={cn(
        "h-full overflow-hidden rounded-[20px] border border-[var(--mf-pub-border)] bg-[var(--mf-pub-surface)] transition duration-300 hover:-translate-y-1 hover:rotate-0 hover:border-[var(--mf-pub-border-strong)]",
        rotate,
        accentBorder,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--mf-pub-border)] bg-white/[0.02] px-4 py-2.5">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--mf-pub-text-muted)]">
          {chrome}
        </span>
      </div>

      <div className="p-5">{children}</div>
    </div>
  );
}

/* =========================================================
   WHY CHOOSE MUSCLE FITNESS — feature card. Technical/premium per
   spec Part 20-21: lime icon container by default, violet for the
   two Dante-identity cards (spec Part 2: Dante stays violet, never
   overridden by the marketing brand color), short copy, no cartoon
   icons or large glow.
========================================================= */

function WhyCard({
  icon: Icon,
  label,
  title,
  text,
  href,
  lead = false,
  accent,
}: Differentiator & { lead?: boolean }) {
  const isViolet = accent === "violet";

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--mf-pub-border)] bg-[var(--mf-pub-surface)] transition duration-300 hover:-translate-y-0.5 hover:bg-[var(--mf-pub-surface-hover)]",
        isViolet ? "hover:border-violet-400/40" : "hover:border-[var(--mf-brand-border)]",
        lead ? "p-8 sm:p-9" : "p-6",
      )}
    >
      {lead ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-[var(--mf-brand)]/10 blur-3xl"
        />
      ) : null}

      <span
        className={cn(
          "relative grid shrink-0 place-items-center rounded-xl border transition duration-300 group-hover:scale-105",
          lead ? "size-12" : "size-10",
          isViolet
            ? "border-violet-400/25 bg-violet-400/10 text-[var(--mf-violet)]"
            : "border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] text-[var(--mf-brand)]",
        )}
      >
        <Icon className={lead ? "size-6" : "size-5"} aria-hidden="true" />
      </span>

      <p
        className={cn(
          "relative mt-4 text-[10px] font-black uppercase tracking-[0.22em]",
          isViolet ? "text-[var(--mf-violet)]" : "text-[var(--mf-brand)]",
        )}
      >
        {label}
      </p>

      <h3 className={cn("relative mt-2 font-black text-white", lead ? "text-3xl sm:text-4xl" : "text-xl")}>
        {title}
      </h3>

      <p
        className={cn(
          "relative mt-3 leading-6 text-[var(--mf-pub-text-secondary)]",
          lead ? "max-w-md text-base" : "text-sm",
        )}
      >
        {text}
      </p>

      <span
        aria-hidden="true"
        className={cn(
          "relative mt-auto flex items-center gap-1.5 pt-6 text-xs font-black uppercase tracking-[0.1em] opacity-0 transition group-hover:opacity-100",
          isViolet ? "text-[var(--mf-violet)]" : "text-[var(--mf-brand)]",
        )}
      >
        Explore
        <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}

/* =========================================================
   PAGE
========================================================= */

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--mf-pub-bg)] text-white">
      {/* ===================================================
          NAVBAR
      =================================================== */}

      <header
        className="
          sticky
          top-0
          z-50

          border-b
          border-[var(--mf-pub-border)]

          bg-[var(--mf-pub-bg)]/85

          backdrop-blur-xl
        "
      >
        <div
          className="
            mx-auto

            flex
            min-h-16
            max-w-7xl

            items-center
            justify-between

            gap-4

            px-5

            sm:px-6
            lg:px-8
          "
        >
          {/* BRAND */}

          <Logo tagline="AI-powered personal training" />

          {/* DESKTOP NAV */}

          <nav
            className="
              hidden
              items-center
              gap-4

              lg:flex
            "
          >
            <a
              href="#solution"
              className="
                text-xs
                font-bold

                uppercase

                tracking-[0.14em]

                text-zinc-400

                transition

                hover:text-[var(--mf-brand)]
              "
            >
              Solution
            </a>

            <a
              href="#dante"
              className="
                text-xs
                font-bold

                uppercase

                tracking-[0.14em]

                text-zinc-400

                transition

                hover:text-[var(--mf-brand)]
              "
            >
              Dante
            </a>

            <a
              href="#inspiration"
              className="
                text-xs
                font-bold

                uppercase

                tracking-[0.14em]

                text-zinc-400

                transition

                hover:text-[var(--mf-brand)]
              "
            >
              Our story
            </a>

            <Link
              href="/ai-fair"
              className="
                text-xs
                font-bold

                uppercase

                tracking-[0.14em]

                text-zinc-400

                transition

                hover:text-[var(--mf-brand)]
              "
            >
              AI Fair
            </Link>
            <a
              href="#get-started"
              className="rounded-sm py-2 text-xs font-bold uppercase tracking-[0.14em] text-zinc-200 transition hover:text-[var(--mf-brand)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--mf-brand)]"
            >
              Get started
            </a>
          </nav>

          {/* AUTH */}

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="
                hidden

                rounded-xl

                border
                border-white/10

                px-4
                py-2.5

                text-sm
                font-semibold

                text-zinc-300

                transition

                hover:border-white/20
                hover:bg-white/5

                sm:inline-flex
              "
            >
              Log in
            </Link>

            <Link
              href="/signup"
              className="
                rounded-xl

                bg-[var(--mf-brand)]

                px-4
                py-2.5

                text-xs
                font-black

                uppercase

                tracking-wider

                text-[var(--mf-brand-ink)]

                transition

                hover:bg-[var(--mf-brand-hover)]

                sm:text-sm
              "
            >
              Start now
            </Link>
          </div>
        </div>
      </header>

      {/* ===================================================
          HERO
      =================================================== */}

      <section
        className="
          relative

          overflow-hidden

          border-b
          border-white/10

          px-5
          py-24

          sm:px-6

          lg:px-8
          lg:py-36
        "
      >
        <div
          aria-hidden="true"
          className="
            pointer-events-none

            absolute
            inset-0

            bg-[radial-gradient(circle_at_75%_20%,rgba(216,255,32,0.12),transparent_28%),linear-gradient(to_bottom,rgba(255,255,255,0.025),transparent_32%)]
          "
        />

        <div
          aria-hidden="true"
          className="
            pointer-events-none

            absolute
            inset-0

            opacity-20

            bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)]

            bg-size-[48px_48px]
          "
        />

        <div
          className="
            relative

            mx-auto

            grid
            max-w-7xl

            items-end

            gap-14

            lg:grid-cols-[1.15fr_0.85fr]
          "
        >
          {/* HERO COPY */}

          <StaggerContainer stagger={0.12}>
            <StaggerItem
              className="
                inline-flex

                items-center

                gap-2

                rounded-full

                border
                border-[var(--mf-brand-border)]

                bg-[var(--mf-brand-soft)]

                px-3
                py-2

                text-[10px]
                font-black

                uppercase

                tracking-[0.22em]

                text-[var(--mf-brand)]
              "
            >
              <Sparkles className="size-3.5" />

              AI-powered · Evidence-aware · Personalized
            </StaggerItem>

            <StaggerItem
              className="
                mt-7

                max-w-5xl
              "
            >
              <h1
                className="
                  text-5xl
                  font-black

                  uppercase

                  leading-[0.88]

                  tracking-[-0.055em]

                  sm:text-6xl
                  md:text-7xl

                  lg:text-[88px]
                "
              >
                Your training.

                <span className="block text-zinc-600">
                  Your data.
                </span>

                <span className="block text-[var(--mf-brand)]">
                  Your coach.
                </span>
              </h1>
            </StaggerItem>

            <StaggerItem
              className="
                mt-8

                max-w-2xl

                text-base
                leading-8

                text-[var(--mf-pub-text-secondary)]

                sm:text-lg
              "
            >
              Muscle Fitness connects training, nutrition and recovery
              around one real client profile — then gives Dante the
              context to turn that information into practical coaching.
            </StaggerItem>

            <StaggerItem
              className="
                mt-9

                flex
                flex-col

                gap-3

                sm:flex-row
              "
            >
              <Link
                href="/signup"
                className="
                  inline-flex

                  items-center
                  justify-center

                  gap-2

                  rounded-2xl

                  bg-[var(--mf-brand)]

                  px-6
                  py-4

                  text-sm
                  font-black

                  uppercase

                  tracking-wider

                  text-[var(--mf-brand-ink)]

                  transition

                  hover:bg-[var(--mf-brand-hover)]
                  hover:shadow-[var(--shadow-brand)]
                "
              >
                Start your journey

                <ArrowRight className="size-4" />
              </Link>

              <Link
                href="/chatbot"
                className="
                  inline-flex

                  items-center
                  justify-center

                  gap-2

                  rounded-2xl

                  border
                  border-white/10

                  bg-white/3

                  px-6
                  py-4

                  text-sm
                  font-black

                  uppercase

                  tracking-wider

                  text-white

                  transition

                  hover:border-white/20
                  hover:bg-white/6
                "
              >
                Meet Dante

                <BrainCircuit className="size-4 text-[var(--mf-violet)]" />
              </Link>
            </StaggerItem>

            <StaggerItem
              className="
                mt-10

                text-sm
                font-bold

                uppercase

                tracking-[0.2em]

                text-zinc-600
              "
            >
              Today is the youngest you will ever be.
            </StaggerItem>
          </StaggerContainer>

          {/* DANTE FLOW */}

          <Reveal
            delay={0.2}
            className="
              relative

              overflow-hidden

              rounded-3xl

              border
              border-white/10

              bg-white/4

              p-6

              shadow-2xl
              shadow-black/40

              sm:p-7
            "
          >
            <PageVisual page="dante" />

            <div className="relative z-10">
              <Link
                href="/chatbot"
                className="mb-5 flex justify-center"
                aria-label="Meet Dante — open the AI coach"
              >
                <DanteRobot
                  state="idle"
                  size="md"
                  interactive
                />
              </Link>

              <p
                className="
                  text-center

                text-[10px]
                font-black

                uppercase

                tracking-[0.24em]

                text-[var(--mf-violet)]
              "
            >
              Dante Intelligence Loop
            </p>

            <div className="mt-5 space-y-3">
              {[
                [
                  "01",
                  "Client profile",
                  "Goals, experience, preferences and constraints",
                ],

                [
                  "02",
                  "Live context",
                  "Training, nutrition, recovery and progress",
                ],

                [
                  "03",
                  "Evidence",
                  "Trusted external data where relevant",
                ],

                [
                  "04",
                  "AI reasoning",
                  "Context becomes a practical next action",
                ],
              ].map(
                ([
                  number,
                  title,
                  text,
                ]) => (
                  <div
                    key={number}
                    className="
                      grid

                      grid-cols-[42px_1fr]

                      gap-3

                      rounded-2xl

                      border
                      border-white/10

                      bg-black/30

                      p-4
                    "
                  >
                    <span
                      className="
                        text-xs
                        font-black

                        text-[var(--mf-violet)]
                      "
                    >
                      {number}
                    </span>

                    <div>
                      <p className="font-bold text-white">
                        {title}
                      </p>

                      <p
                        className="
                          mt-1

                          text-sm
                          leading-6

                          text-zinc-500
                        "
                      >
                        {text}
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================================================
          PROBLEM
      =================================================== */}

      <section
        className="
          bg-[var(--mf-pub-bg-deep)]

          px-5
          py-24

          sm:px-6
          lg:px-8
        "
      >
        <div className="mx-auto max-w-7xl">
          <p
            className="
              text-xs
              font-black

              uppercase

              tracking-[0.28em]

              text-[var(--mf-brand)]
            "
          >
            The Problem
          </p>

          <div
            className="
              mt-4

              grid

              gap-10

              lg:grid-cols-[0.9fr_1.1fr]
              lg:items-end
            "
          >
            <h2
              className="
                text-4xl
                font-black

                uppercase

                leading-[0.95]

                tracking-[-0.04em]

                sm:text-5xl
                lg:text-6xl
              "
            >
              Fitness advice is everywhere.

              <span className="block text-zinc-600">
                Personalized guidance isn&apos;t.
              </span>
            </h2>

            <div
              className="
                grid

                gap-3

                sm:grid-cols-2
              "
            >
              {problems.map(
                (
                  problem,
                ) => (
                  <div
                    key={problem}
                    className="
                      flex

                      gap-3

                      rounded-2xl

                      border
                      border-white/10

                      bg-white/3

                      p-4
                    "
                  >
                    <CheckCircle2
                      className="
                        mt-0.5

                        size-4

                        shrink-0

                        text-[var(--mf-brand)]
                      "
                    />

                    <p
                      className="
                        text-sm
                        leading-6

                        text-zinc-400
                      "
                    >
                      {problem}
                    </p>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================
          SOLUTION
      =================================================== */}

      {/* Fully dark, same canonical system as the rest of the public
          site (OLED/graphite/white/lime) — a distinct "deep black"
          shade (--mf-pub-bg-deep) provides section rhythm against the
          hero/CTA above and below rather than a light editorial
          break. */}
      <section
        id="solution"
        className="
          relative

          border-y
          border-[var(--mf-pub-border)]

          bg-[var(--mf-pub-bg-deep)]

          px-5
          py-24

          sm:px-6
          lg:px-8
        "
      >
        <div aria-hidden="true" className="section-grid" />

        <div className="relative mx-auto max-w-7xl">
          <p
            className="
              text-[13px]
              font-black

              uppercase

              tracking-[0.18em]

              text-[var(--mf-brand)]
            "
          >
            The Solution
          </p>

          <h2
            className="
              mt-4

              text-[clamp(2.5rem,5vw,4.5rem)]
              font-black

              uppercase

              leading-[0.97]

              tracking-[-0.03em]

              text-[var(--mf-pub-text)]
            "
          >
            One profile.
            <br />
            One system.
            <br />
            One coach.
          </h2>

          <p
            className="
              mt-6

              max-w-xl

              text-base
              leading-7

              text-[var(--mf-pub-text-secondary)]
            "
          >
            Training, nutrition and recovery feed one athlete context —
            and Dante is the single coach who reads all of it.
          </p>

          {/* ===============================================
              CONNECTED-SYSTEM SURFACE — one shared frame for all
              four capabilities (rather than four cards floating in
              empty space) communicates "one system" without a
              literal diagram. A restrained central glow ties the
              grid together; no connector lines to break responsively.
          =============================================== */}

          <div
            className="
              relative

              mt-12

              overflow-hidden

              rounded-[32px]

              border
              border-[var(--mf-pub-border)]

              bg-white/[0.02]

              p-3

              sm:mt-14
              sm:p-4
            "
          >
            <div
              aria-hidden="true"
              className="
                pointer-events-none
                absolute
                left-1/2
                top-1/2
                size-80
                -translate-x-1/2
                -translate-y-1/2
                rounded-full
                bg-[var(--mf-violet)]/12
                blur-3xl
              "
            />

            <StaggerContainer
              className="
                relative

                grid

                gap-3

                sm:grid-cols-3
                sm:gap-4
              "
            >
              {/* Training/Nutrition/Recovery sit as three equal inputs;
                  Dante spans the full row beneath them as the single
                  convergence point — communicates "three feed into one
                  coach" through layout hierarchy, not a literal
                  flowchart with arrows. */}
              {productSystems.map((system) => {
                const Icon = system.icon;
                const isDante = system.accent === "violet";

                return (
                  <StaggerItem key={system.title} className={isDante ? "sm:col-span-3" : undefined}>
                    <Link
                      href={system.href}
                      className={cn(
                        "group relative flex h-full overflow-hidden rounded-[20px] border bg-[var(--mf-pub-surface)] p-6 transition duration-300 hover:-translate-y-0.5",
                        isDante ? "flex-col sm:flex-row sm:items-center sm:gap-6" : "flex-col",
                        isDante
                          ? "border-violet-400/20 hover:border-violet-400/50"
                          : "border-[var(--mf-pub-border)] hover:border-[var(--mf-brand)]/40",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-x-0 top-0 h-[2px]",
                          isDante
                            ? "bg-gradient-to-r from-transparent via-violet-400 to-transparent"
                            : "bg-gradient-to-r from-transparent via-[var(--mf-brand)] to-transparent",
                        )}
                      />

                      <div className={cn("flex items-center gap-3", isDante && "sm:shrink-0")}>
                        <span
                          className={cn(
                            "grid size-11 shrink-0 place-items-center rounded-2xl border transition",
                            isDante
                              ? "border-violet-400/25 bg-violet-400/10 text-[var(--mf-violet)]"
                              : "border-[var(--mf-brand-border)] bg-[var(--mf-brand-soft)] text-[var(--mf-brand)]",
                          )}
                        >
                          <Icon className="size-5" />
                        </span>

                        <span
                          className={cn(
                            "text-[11px] font-black uppercase tracking-[0.18em]",
                            isDante ? "text-[var(--mf-violet)]" : "text-[var(--mf-brand)]",
                          )}
                        >
                          {system.label}
                        </span>

                        {isDante ? (
                          <h3 className="text-xl font-black text-[var(--mf-pub-text)] sm:hidden">{system.title}</h3>
                        ) : null}
                      </div>

                      {isDante ? (
                        <h3 className="hidden shrink-0 text-xl font-black text-[var(--mf-pub-text)] sm:block">
                          {system.title}
                        </h3>
                      ) : (
                        <h3 className="mt-5 text-xl font-black text-[var(--mf-pub-text)]">{system.title}</h3>
                      )}

                      <p
                        className={cn(
                          "text-sm leading-6 text-[var(--mf-pub-text-secondary)]",
                          isDante ? "mt-3 sm:mt-0" : "mt-2.5",
                        )}
                      >
                        {system.text}
                      </p>

                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1.5 text-xs font-black uppercase tracking-[0.1em] transition",
                          isDante ? "mt-4 sm:mt-0" : "mt-6",
                          isDante ? "text-[var(--mf-violet)]" : "text-[var(--mf-brand)]",
                        )}
                      >
                        {system.cta}
                        <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                      </span>
                    </Link>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          </div>
        </div>
      </section>

      {/* ===================================================
          DANTE
      =================================================== */}

      <section
        id="dante"
        className="
          relative

          overflow-hidden

          bg-[var(--mf-pub-bg-deep)]

          px-5
          py-24

          sm:px-6

          lg:px-8
          lg:py-32
        "
      >
        <PageVisual page="dante" intensity="secondary" glow />

        <div className="relative mx-auto max-w-7xl">
          <div
            className="
              grid

              gap-12

              lg:grid-cols-[0.85fr_1.15fr]
            "
          >
            <Reveal>
              <div className="inline-flex items-center gap-2 text-[var(--mf-violet)]">
                <BrainCircuit className="size-4" />

                <p
                  className="
                    text-xs
                    font-black

                    uppercase

                    tracking-[0.28em]
                  "
                >
                  How Dante Works
                </p>
              </div>

              <h2
                className="
                  mt-5

                  text-4xl
                  font-black

                  uppercase

                  leading-[0.95]

                  tracking-[-0.04em]

                  sm:text-5xl
                  lg:text-6xl
                "
              >
                AI should know more than your last question.
              </h2>

              <p
                className="
                  mt-7

                  max-w-xl

                  text-base
                  leading-8

                  text-[var(--mf-pub-text-secondary)]
                "
              >
                Dante combines your live athlete state, adaptive training
                logic and verified knowledge into one practical next
                decision.
              </p>

              <Link
                href="/chatbot"
                className="
                  group

                  mt-8

                  inline-flex

                  items-center

                  gap-2

                  text-base
                  font-black

                  uppercase

                  tracking-[0.12em]

                  text-[var(--mf-violet)]

                  transition

                  hover:text-violet-300
                "
              >
                Ask Dante

                <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </Link>
            </Reveal>

            {/* ===============================================
                DANTE INTELLIGENCE VISUALIZATION — a real CSS/DOM
                system node, not an illustration. Communicates "live
                athlete context in, one next decision out" without a
                developer flowchart. Every signal listed below is a
                real, load-bearing integration in the codebase (see
                intelligenceSignals above) — nothing aspirational.
            =============================================== */}

            <Reveal
              delay={0.15}
              className="
                relative

                rounded-[28px]

                border
                border-white/10

                bg-white/[0.03]

                p-6

                sm:p-8
              "
            >
              <div className="relative flex flex-col items-center text-center">
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[var(--mf-violet)]/25 blur-2xl motion-safe:animate-pulse"
                  />

                  <div
                    className="relative grid size-24 place-items-center rounded-full p-[2px] sm:size-28"
                    style={{
                      background:
                        "conic-gradient(from 0deg, var(--mf-violet), var(--mf-sunset), var(--mf-cyan), var(--mf-violet))",
                    }}
                  >
                    <div className="grid size-full place-items-center rounded-full bg-[#0c0c10]">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white">
                          Dante
                        </p>

                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                          Core
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                  Live athlete context
                </p>

                <span
                  aria-hidden="true"
                  className="mt-4 h-8 w-px bg-gradient-to-b from-[var(--mf-violet)]/50 to-transparent"
                />
              </div>

              <div className="relative grid gap-3 sm:grid-cols-3">
                {intelligenceSignals.map((group) => {
                  const GroupIcon =
                    group.accent === "sunset"
                      ? Activity
                      : group.accent === "violet"
                        ? BrainCircuit
                        : Database;

                  const textAccent =
                    group.accent === "sunset"
                      ? "text-[var(--mf-brand)]"
                      : group.accent === "violet"
                        ? "text-[var(--mf-violet)]"
                        : "text-[var(--mf-cyan)]";

                  const dotAccent =
                    group.accent === "sunset"
                      ? "bg-[var(--mf-brand)]"
                      : group.accent === "violet"
                        ? "bg-[var(--mf-violet)]"
                        : "bg-[var(--mf-cyan)]";

                  return (
                    <div
                      key={group.label}
                      className="rounded-2xl border border-white/8 bg-black/25 p-4"
                    >
                      <div className="flex items-center gap-1.5">
                        <GroupIcon className={cn("size-3.5", textAccent)} />

                        <p
                          className={cn(
                            "text-[10px] font-black uppercase tracking-[0.12em]",
                            textAccent,
                          )}
                        >
                          {group.label}
                        </p>
                      </div>

                      <ul className="mt-3 space-y-1.5">
                        {group.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-center gap-2 text-xs leading-5 text-zinc-400"
                          >
                            <span
                              aria-hidden="true"
                              className={cn("size-1 shrink-0 rounded-full", dotAccent)}
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div
                className="
                  relative

                  mt-5

                  rounded-2xl

                  border
                  border-[var(--mf-brand)]/20

                  bg-[var(--mf-brand)]/6

                  p-5
                "
              >
                <p
                  className="
                    text-xs
                    font-black

                    uppercase

                    tracking-[0.16em]

                    text-[var(--mf-brand)]
                  "
                >
                  Next action
                </p>

                <p
                  className="
                    mt-2

                    text-sm
                    leading-6

                    text-zinc-300
                  "
                >
                  Training adjustments, food guidance, supplement
                  evidence, recovery insights and clear uncertainty
                  when the data is not strong enough.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ===================================================
          #BUILTFORPERFORMANCE — product showcase, on the same dark
          canonical system as the rest of the public site (spec:
          "black, graphite, white, lime first"). Every panel is a
          compact, CSS-built recreation of a real product surface
          (Today's Plan, Dante, Adaptive Training, Nutrition,
          Recovery) — never a screenshot, explicitly disclosed as
          illustrative rather than a live user's data. Semantic
          accents (violet for Dante/Recovery) are kept only as small
          data signals, not competing card themes — brand lime is the
          dominant accent everywhere else.
      =================================================== */}

      <section className="bg-[var(--mf-pub-bg)] px-5 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <p className="text-[13px] font-black uppercase tracking-[0.18em] text-[var(--mf-brand)]">
            #BuiltForPerformance
          </p>

          <h2 className="mt-4 max-w-3xl text-[clamp(2rem,4.2vw,3.25rem)] font-black uppercase leading-[1.02] tracking-[-0.03em] text-[var(--mf-pub-text)]">
            The intelligence behind every rep.
          </h2>

          <p className="mt-5 max-w-xl text-base leading-7 text-[var(--mf-pub-text-secondary)]">
            Five real surfaces of the product, shown instead of described.
          </p>

          <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-6">
            {/* TODAY'S PLAN */}
            <StaggerItem className="sm:col-span-3">
              <ShowcasePanel
                accentBorder="hover:border-[var(--mf-brand)]/40"
                rotate="-rotate-[0.6deg]"
                chrome="Today's Plan"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--mf-brand)]">
                  Today&apos;s plan
                </p>
                <p className="mt-2 text-lg font-black text-[var(--mf-pub-text)]">Push Day</p>

                <div className="mt-4 space-y-2">
                  {[
                    { label: "Bench Press · 4×6", done: true },
                    { label: "Incline DB Press · 3×10", done: true },
                    { label: "Cable Fly · 3×12", done: false },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-full border text-[9px]",
                          item.done
                            ? "border-[var(--mf-brand)] bg-[var(--mf-brand)] text-[var(--mf-brand-ink)]"
                            : "border-white/20 text-transparent",
                        )}
                      >
                        ✓
                      </span>
                      <span
                        className={cn(
                          "text-sm",
                          item.done
                            ? "text-[var(--mf-pub-text-muted)] line-through"
                            : "text-[var(--mf-pub-text)]",
                        )}
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full w-2/3 rounded-full bg-[var(--mf-brand)]" />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--mf-pub-text-muted)]">2 of 3 actions complete</p>
              </ShowcasePanel>
            </StaggerItem>

            {/* DANTE */}
            <StaggerItem className="sm:col-span-3">
              <ShowcasePanel
                accentBorder="hover:border-violet-400/50"
                rotate="rotate-[0.6deg]"
                chrome="Dante"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--mf-violet)]">Dante</p>

                <div className="mt-3 flex justify-end">
                  <span className="rounded-2xl rounded-br-md bg-white/8 px-3.5 py-2 text-xs font-medium text-[var(--mf-pub-text)]">
                    What should I train today?
                  </span>
                </div>

                <div className="mt-2 rounded-2xl rounded-tl-md border border-violet-400/20 bg-violet-400/10 px-3.5 py-3">
                  <p className="text-xs leading-5 text-[var(--mf-pub-text-secondary)]">
                    Bench Press: +2.5kg — you hit all reps at RIR 2 last session.
                  </p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.1em] text-[var(--mf-violet)]">
                    Why this? <ArrowRight className="size-3" />
                  </span>
                </div>
              </ShowcasePanel>
            </StaggerItem>

            {/* ADAPTIVE TRAINING */}
            <StaggerItem className="sm:col-span-2">
              <ShowcasePanel
                accentBorder="hover:border-[var(--mf-brand)]/40"
                rotate="rotate-[0.4deg]"
                chrome="Adaptive"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--mf-brand)]">Adaptive engine</p>
                <span className="mt-3 inline-flex rounded-full bg-[var(--mf-brand)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--mf-brand-ink)]">
                  Build
                </span>
                <p className="mt-3 text-sm font-bold text-[var(--mf-pub-text)]">Bench Press</p>
                <p className="mt-0.5 text-xs text-[var(--mf-pub-text-muted)]">3×8 @ 82.5kg · ↑ from last week</p>
              </ShowcasePanel>
            </StaggerItem>

            {/* NUTRITION */}
            <StaggerItem className="sm:col-span-2">
              <ShowcasePanel
                accentBorder="hover:border-[var(--mf-brand)]/40"
                rotate="-rotate-[0.4deg]"
                chrome="Nutrition"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--mf-brand)]">Nutrition</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-[var(--mf-pub-text)]">
                  142<span className="text-sm font-bold text-[var(--mf-pub-text-muted)]"> / 180g</span>
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--mf-pub-text-muted)]">Protein today</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full w-4/5 rounded-full bg-[var(--mf-brand)]" />
                </div>
              </ShowcasePanel>
            </StaggerItem>

            {/* RECOVERY */}
            <StaggerItem className="sm:col-span-2">
              <ShowcasePanel
                accentBorder="hover:border-violet-400/50"
                rotate="rotate-[0.5deg]"
                chrome="Recovery"
              >
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--mf-pub-text-muted)]">Recovery</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight text-[var(--mf-pub-text)]">72</span>
                  <span className="rounded-full border border-violet-400/25 bg-violet-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--mf-violet)]">
                    Ready
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-[var(--mf-pub-text-muted)]">Low fatigue · 7.5h sleep last night</p>
              </ShowcasePanel>
            </StaggerItem>
          </StaggerContainer>

          <p className="mt-6 text-xs text-[var(--mf-pub-text-muted)]">
            Illustrative product interface — not a specific user&apos;s live data.
          </p>
        </div>
      </section>

      {/* ===================================================
          WHY CHOOSE MUSCLE FITNESS — one large lead capability
          (Adaptive Training) + smaller supporting capabilities (spec
          Part 19, option B), on the new near-black public brand
          surface. Dante-identity cards stay violet; everything else
          uses the lime brand accent for marketing emphasis only.
      =================================================== */}

      <section
        id="why-choose"
        className="
          relative

          border-y
          border-[var(--mf-pub-border)]

          bg-[var(--mf-pub-bg-deep)]

          px-5
          py-24

          sm:px-6
          lg:px-8
        "
      >
        <div aria-hidden="true" className="section-grid" />

        <div className="relative mx-auto max-w-7xl">
          <p
            className="
              text-xs
              font-black

              uppercase

              tracking-[0.28em]

              text-[var(--mf-brand)]
            "
          >
            Built Different
          </p>

          <h2
            className="
              mt-4

              max-w-4xl

              text-4xl
              font-black

              uppercase

              leading-[0.95]

              tracking-[-0.04em]

              sm:text-5xl
              lg:text-6xl
            "
          >
            Why choose{" "}
            <span className="text-[var(--mf-brand)]">Muscle Fitness</span>
          </h2>

          <p
            className="
              mt-6

              max-w-xl

              text-base
              leading-7

              text-[var(--mf-pub-text-secondary)]
            "
          >
            Not another static workout PDF or a chatbot bolted onto a
            tracker — one system that reads your real training,
            nutrition and recovery state before it recommends anything.
          </p>

          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <WhyCard lead {...leadDifferentiator} />
            </div>

            <div className="flex flex-col gap-4 lg:col-span-5">
              {danteDifferentiators.map((item) => (
                <div key={item.title} className="flex-1">
                  <WhyCard {...item} />
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-12 lg:grid-cols-4">
              {supportingDifferentiators.map((item) => (
                <WhyCard key={item.title} {...item} />
              ))}
            </div>
          </div>

          <div className="mt-12 flex justify-center">
            <Link
              href="/signup"
              className="
                inline-flex

                items-center

                gap-2

                rounded-2xl

                border
                border-[var(--mf-pub-border)]

                px-6
                py-4

                text-sm
                font-black

                uppercase

                tracking-wider

                text-white

                transition

                hover:border-[var(--mf-brand)]/40
                hover:text-[var(--mf-brand)]
              "
            >
              Start your profile
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===================================================
          FEATURE EXPLORER — editorial vertical accordion (spec Part
          19). One system per row; the active row expands into
          description + a real-representative preview + CTA, inactive
          rows stay compact so six domains never read as ten equal
          boxes.
      =================================================== */}

      <section className="px-5 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-[13px] font-black uppercase tracking-[0.18em] text-[var(--mf-brand)]">
            Explore the system
          </p>

          <h2 className="mt-4 text-[clamp(2rem,4.2vw,3.25rem)] font-black uppercase leading-[1.02] tracking-[-0.03em]">
            Every domain, one context.
          </h2>

          <div className="mt-10">
            <FeatureExplorer />
          </div>
        </div>
      </section>

      {/* ===================================================
          INSPIRATIONAL STORY
      =================================================== */}

      <InspirationStory />

      {/* ===================================================
          4D PHILOSOPHY
      =================================================== */}

      <section
        id="discipline"
        className="
          px-5
          py-24

          sm:px-6

          lg:px-8
          lg:py-32
        "
      >
        <div className="mx-auto max-w-7xl">
          <p
            className="
              text-xs
              font-black

              uppercase

              tracking-[0.28em]

              text-[var(--mf-brand)]
            "
          >
            The 4D Philosophy
          </p>

          <div
            className="
              mt-9

              grid

              gap-4

              md:grid-cols-2
              xl:grid-cols-4
            "
          >
            {pillars.map(
              (
                pillar,
                index,
              ) => (
                <article
                  key={pillar.title}
                  className="
                    rounded-3xl

                    border
                    border-white/10

                    bg-white/3

                    p-6
                  "
                >
                  <p
                    className="
                      text-xs
                      font-black

                      tracking-[0.2em]

                      text-zinc-700
                    "
                  >
                    0
                    {
                      index +
                      1
                    }
                  </p>

                  <h3
                    className="
                      mt-8

                      text-2xl
                      font-black

                      uppercase

                      text-white
                    "
                  >
                    {pillar.title}
                  </h3>

                  <p
                    className="
                      mt-3

                      text-sm
                      leading-6

                      text-zinc-500
                    "
                  >
                    {pillar.text}
                  </p>
                </article>
              ),
            )}
          </div>
        </div>
      </section>

      {/* ===================================================
          RESPONSIBLE AI
      =================================================== */}

      <section
        className="
          border-y
          border-[var(--mf-pub-border)]

          bg-[var(--mf-pub-bg-deep)]

          px-5
          py-24

          sm:px-6
          lg:px-8
        "
      >
        <div
          className="
            mx-auto

            grid
            max-w-7xl

            gap-10

            lg:grid-cols-[0.9fr_1.1fr]
            lg:items-center
          "
        >
          <div>
            <div className="inline-flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="size-4" />

              <p
                className="
                  text-xs
                  font-black

                  uppercase

                  tracking-[0.28em]
                "
              >
                Responsible AI
              </p>
            </div>

            <h2
              className="
                mt-5

                text-4xl
                font-black

                uppercase

                tracking-[-0.04em]

                sm:text-5xl
              "
            >
              Useful enough to act on. Careful enough to question.
            </h2>
          </div>

          <div>
            <p className="text-base leading-8 text-[var(--mf-pub-text-secondary)]">
              Dante provides educational fitness and wellness guidance.
              It does not diagnose disease, replace licensed clinicians,
              tell users to stop medication, or pretend weak evidence is
              certainty.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {[
                "No fabricated client data",
                "Evidence surfaced when available",
                "Medical uncertainty acknowledged",
                "High-risk cases escalated to professional care",
              ].map(
                (
                  item,
                ) => (
                  <span
                    key={item}
                    className="
                      rounded-full

                      border
                      border-emerald-500/15

                      bg-emerald-500/6

                      px-3
                      py-2

                      text-xs
                      font-semibold

                      text-emerald-300
                    "
                  >
                    {item}
                  </span>
                ),
              )}
            </div>

            <Link
              href="/responsible-ai"
              className="
                mt-7

                inline-flex

                items-center

                gap-2

                text-sm
                font-black

                uppercase

                tracking-wider

                text-emerald-400
              "
            >
              Read our responsible AI approach

              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===================================================
          FINAL CTA
      =================================================== */}

      <ProfileGateway />

      {/* ===================================================
          FOOTER
      =================================================== */}

      <footer
        className="
          border-t
          border-white/10

          px-5
          py-8

          sm:px-6
          lg:px-8
        "
      >
        <div
          className="
            mx-auto

            flex
            max-w-7xl

            flex-col

            gap-4

            text-sm

            text-zinc-600

            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <p>
            ©{" "}
            {
              new Date().getFullYear()
            }{" "}
            Muscle Fitness.
          </p>

          <div className="flex flex-wrap gap-5">
            <Link
              href="/ai-fair"
              className="transition hover:text-zinc-300"
            >
              AI Fair
            </Link>

            <Link
              href="/responsible-ai"
              className="transition hover:text-zinc-300"
            >
              Responsible AI
            </Link>

            <Link
              href="/login"
              className="transition hover:text-zinc-300"
            >
              Login
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
