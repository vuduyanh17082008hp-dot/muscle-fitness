import Link from "next/link";

import {
  Activity,
  Apple,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Database,
  Dumbbell,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

import {
  InspirationStory,
} from "@/components/home/inspiration-story";
import { DanteRobot } from "@/components/dante/dante-robot";
import { Reveal, StaggerContainer, StaggerItem } from "@/components/animation/reveal";
import { PageVisual } from "@/components/visual/page-visual";

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
    title: "Training",
    text:
      "Recommended splits, custom plans, exercise selection, sets, reps, RIR, volume and progression.",
    href: "/training",
  },

  {
    icon: Apple,
    title: "Nutrition",
    text:
      "Calorie and macro targets, practical food guidance and profile-aware meal recommendations.",
    href: "/meal-plan",
  },

  {
    icon: HeartPulse,
    title: "Recovery",
    text:
      "Sleep, stress and check-in context that helps coaching reflect how the client is actually recovering.",
    href: "/dashboard/recovery",
  },

  {
    icon: BrainCircuit,
    title: "Dante",
    text:
      "The AI layer that combines client context, product data and external evidence into practical next actions.",
    href: "/chatbot",
  },
] as const;

const aiSources = [
  "Client profile",
  "Workout data",
  "Nutrition context",
  "Recovery signals",
  "PubMed / NCBI",
  "USDA FoodData Central",
  "wger",
  "Open Food Facts",
  "PubChem",
  "openFDA",
] as const;

const features = [
  {
    icon: BrainCircuit,
    title: "Dante — Evidence-Aware AI Coach",
    text:
      "Contextual coaching that can use real client data and retrieved evidence instead of generic one-shot prompting.",
  },

  {
    icon: Target,
    title: "Adaptive Workout Builder",
    text:
      "Guided split recommendations for beginners with full customization for advanced clients.",
  },

  {
    icon: Database,
    title: "Connected Fitness Context",
    text:
      "Training, nutrition and recovery live in one system so advice can reflect the whole client rather than one isolated metric.",
  },

  {
    icon: ShieldCheck,
    title: "Responsible AI Guardrails",
    text:
      "Dante does not diagnose disease, fabricate certainty or replace professional medical care.",
  },
] as const;

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
   PAGE
========================================================= */

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#070707] text-white">
      {/* ===================================================
          NAVBAR
      =================================================== */}

      <header
        className="
          sticky
          top-0
          z-50

          border-b
          border-white/10

          bg-black/85

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

          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <div
              className="
                grid
                size-10
                place-items-center

                rounded-xl

                border
                border-amber-400/30

                bg-amber-400/10

                text-xs
                font-black

                text-amber-400
              "
            >
              MF
            </div>

            <div>
              <p
                className="
                  text-sm
                  font-black

                  uppercase

                  tracking-[0.2em]
                "
              >
                Muscle Fitness
              </p>

              <p
                className="
                  hidden

                  text-[9px]

                  uppercase

                  tracking-[0.2em]

                  text-zinc-600

                  sm:block
                "
              >
                AI-powered personal training
              </p>
            </div>
          </Link>

          {/* DESKTOP NAV */}

          <nav
            className="
              hidden
              items-center
              gap-6

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

                hover:text-white
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

                hover:text-white
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

                hover:text-white
              "
            >
              The First Rep
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

                hover:text-white
              "
            >
              AI Fair
            </Link>
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

                bg-amber-400

                px-4
                py-2.5

                text-xs
                font-black

                uppercase

                tracking-wider

                text-black

                transition

                hover:bg-amber-300

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

            bg-[radial-gradient(circle_at_75%_20%,rgba(245,158,11,0.16),transparent_28%),linear-gradient(to_bottom,rgba(255,255,255,0.025),transparent_32%)]
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
                border-amber-400/20

                bg-amber-400/10

                px-3
                py-2

                text-[10px]
                font-black

                uppercase

                tracking-[0.22em]

                text-amber-400
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

                <span className="block text-amber-400">
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

                text-zinc-400

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

                  bg-amber-400

                  px-6
                  py-4

                  text-sm
                  font-black

                  uppercase

                  tracking-wider

                  text-black

                  transition

                  hover:bg-amber-300
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

                <BrainCircuit className="size-4 text-amber-400" />
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

                text-amber-400
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

                        text-amber-400
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

              text-amber-400
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

                        text-amber-400
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

      <section
        id="solution"
        className="
          border-y
          border-white/10

          bg-[#0b0b0b]

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

              text-amber-400
            "
          >
            The Solution
          </p>

          <h2
            className="
              mt-4

              text-4xl
              font-black

              uppercase

              tracking-[-0.04em]

              sm:text-5xl
            "
          >
            One profile. One system. One coach.
          </h2>

          <StaggerContainer
            className="
              mt-10

              grid

              gap-4

              md:grid-cols-2
              xl:grid-cols-4
            "
          >
            {productSystems.map(
              (
                system,
              ) => {
                const Icon =
                  system.icon;

                return (
                  <StaggerItem key={system.title}>
                  <Link
                    href={system.href}
                    className="
                      group

                      rounded-3xl

                      border
                      border-white/10

                      bg-black/30

                      p-6

                      transition

                      hover:border-amber-400/30
                      hover:bg-amber-400/4
                    "
                  >
                    <div
                      className="
                        grid
                        size-11
                        place-items-center

                        rounded-2xl

                        border
                        border-white/10

                        bg-white/4

                        text-zinc-300

                        transition

                        group-hover:border-amber-400/20
                        group-hover:text-amber-400
                      "
                    >
                      <Icon className="size-5" />
                    </div>

                    <h3
                      className="
                        mt-7

                        text-xl
                        font-black
                      "
                    >
                      {system.title}
                    </h3>

                    <p
                      className="
                        mt-3

                        text-sm
                        leading-6

                        text-zinc-500
                      "
                    >
                      {system.text}
                    </p>

                    <ArrowRight
                      className="
                        mt-7

                        size-4

                        text-zinc-700

                        transition

                        group-hover:translate-x-1
                        group-hover:text-amber-400
                      "
                    />
                  </Link>
                  </StaggerItem>
                );
              },
            )}
          </StaggerContainer>
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
              <div className="inline-flex items-center gap-2 text-amber-400">
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

                  text-zinc-400
                "
              >
                Dante is designed to combine the client&apos;s real
                profile, product context and external evidence when
                available. The goal is not more text. The goal is a
                better next decision.
              </p>

              <Link
                href="/chatbot"
                className="
                  mt-8

                  inline-flex

                  items-center

                  gap-2

                  text-sm
                  font-black

                  uppercase

                  tracking-wider

                  text-amber-400
                "
              >
                Ask Dante

                <ArrowRight className="size-4" />
              </Link>
            </Reveal>

            <Reveal
              delay={0.15}
              className="
                rounded-3xl

                border
                border-white/10

                bg-white/3

                p-5

                sm:p-7
              "
            >
              <div
                className="
                  grid

                  gap-3

                  sm:grid-cols-2
                "
              >
                {aiSources.map(
                  (
                    source,
                  ) => (
                    <div
                      key={source}
                      className="
                        flex

                        items-center

                        gap-3

                        rounded-2xl

                        border
                        border-white/10

                        bg-black/30

                        px-4
                        py-3
                      "
                    >
                      <Activity className="size-4 text-amber-400" />

                      <span
                        className="
                          text-sm
                          font-semibold

                          text-zinc-300
                        "
                      >
                        {source}
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-white/10" />

                <BrainCircuit className="size-5 text-amber-400" />

                <span className="h-px flex-1 bg-white/10" />
              </div>

              <div
                className="
                  rounded-2xl

                  border
                  border-amber-400/20

                  bg-amber-400/6

                  p-5
                "
              >
                <p
                  className="
                    text-xs
                    font-black

                    uppercase

                    tracking-[0.2em]

                    text-amber-400
                  "
                >
                  Personalized action
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
          FEATURES
      =================================================== */}

      <section
        className="
          border-y
          border-white/10

          bg-[#0b0b0b]

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

              text-amber-400
            "
          >
            AI Features
          </p>

          <h2
            className="
              mt-4

              max-w-4xl

              text-4xl
              font-black

              uppercase

              tracking-[-0.04em]

              sm:text-5xl
            "
          >
            AI where it changes the decision — not where it only adds
            decoration.
          </h2>

          <div
            className="
              mt-10

              grid

              gap-4

              md:grid-cols-2
            "
          >
            {features.map(
              (
                feature,
              ) => {
                const Icon =
                  feature.icon;

                return (
                  <article
                    key={feature.title}
                    className="
                      rounded-3xl

                      border
                      border-white/10

                      bg-black/25

                      p-6
                    "
                  >
                    <Icon className="size-5 text-amber-400" />

                    <h3
                      className="
                        mt-5

                        text-xl
                        font-black
                      "
                    >
                      {feature.title}
                    </h3>

                    <p
                      className="
                        mt-3

                        text-sm
                        leading-6

                        text-zinc-500
                      "
                    >
                      {feature.text}
                    </p>
                  </article>
                );
              },
            )}
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

              text-amber-400
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
          border-white/10

          bg-[#0b0b0b]

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
            <p className="text-base leading-8 text-zinc-400">
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

      <section
        className="
          px-5
          py-28

          sm:px-6

          lg:px-8
          lg:py-36
        "
      >
        <div className="mx-auto max-w-5xl text-center">
          <p
            className="
              text-xs
              font-black

              uppercase

              tracking-[0.28em]

              text-amber-400
            "
          >
            Your next rep starts here
          </p>

          <h2
            className="
              mt-6

              text-5xl
              font-black

              uppercase

              leading-[0.9]

              tracking-tighter

              sm:text-6xl
              lg:text-7xl
            "
          >
            Start before you feel ready.
          </h2>

          <p
            className="
              mx-auto

              mt-7

              max-w-2xl

              text-base
              leading-8

              text-zinc-500
            "
          >
            Build your profile, define your goal, and give the system
            enough context to make the next decision more personal.
          </p>

          <div
            className="
              mt-9

              flex
              flex-col

              justify-center

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

                bg-amber-400

                px-6
                py-4

                text-sm
                font-black

                uppercase

                tracking-wider

                text-black

                transition

                hover:bg-amber-300
              "
            >
              Build my profile

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

                px-6
                py-4

                text-sm
                font-black

                uppercase

                tracking-wider

                text-zinc-200

                transition

                hover:bg-white/4
              "
            >
              Ask Dante

              <BrainCircuit className="size-4 text-amber-400" />
            </Link>
          </div>

          <p
            className="
              mt-10

              text-sm
              font-black

              uppercase

              tracking-[0.22em]

              text-zinc-700
            "
          >
            Dedication · Determination · Drive · Discipline
          </p>
        </div>
      </section>

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