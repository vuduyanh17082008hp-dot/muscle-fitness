import Link from "next/link";

import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const deliverables = [
  "Working prototype",
  "Deployable web application",
  "Source-code repository",
  "Professional README",
  "Responsible AI statement",
  "AI / data-source disclosure",
  "Demo script",
  "Presentation outline",
  "Surprise-feature list",
  "Access and run instructions",
] as const;

const standout = [
  "Dante — profile-aware, evidence-aware AI coaching",

  "Adaptive workout split recommendation and custom split building",

  "Muscle-priority, RIR, intensity and volume controls",

  "Nutrition and food-data integration",

  "Recovery-aware coaching context",

  "Explicit responsible-AI guardrails",
] as const;

export default function AIFairPage() {
  return (
    <main
      className="
        min-h-screen

        bg-[#070707]

        px-5
        py-10

        text-white

        sm:px-6
        lg:px-8
      "
    >
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="
            inline-flex

            items-center

            gap-2

            text-sm
            font-semibold

            text-zinc-500

            transition

            hover:text-white
          "
        >
          <ArrowLeft className="size-4" />

          Back to Muscle Fitness
        </Link>

        {/* =================================================
            HERO
        ================================================= */}

        <header
          className="
            mt-10

            rounded-3xl

            border
            border-white/10

            bg-[radial-gradient(circle_at_80%_20%,rgba(245,158,11,0.12),transparent_30%),#0d0d0d]

            p-7

            sm:p-10
          "
        >
          <div className="flex items-center gap-2 text-amber-400">
            <Sparkles className="size-5" />

            <p
              className="
                text-xs
                font-black

                uppercase

                tracking-[0.26em]
              "
            >
              AI Fair Submission
            </p>
          </div>

          <h1
            className="
              mt-5

              max-w-4xl

              text-4xl
              font-black

              uppercase

              leading-[0.95]

              tracking-[-0.04em]

              sm:text-6xl
            "
          >
            A real fitness product with AI where context actually
            matters.
          </h1>

          <p
            className="
              mt-6

              max-w-3xl

              text-base
              leading-8

              text-zinc-400
            "
          >
            Muscle Fitness combines training, nutrition and recovery
            around one authenticated client profile. Dante uses that
            context to generate more personalized guidance and can
            incorporate trusted external data where the integration is
            available.
          </p>
        </header>

        {/* =================================================
            WHY AI + RESPONSIBILITY
        ================================================= */}

        <div
          className="
            mt-8

            grid

            gap-4

            lg:grid-cols-2
          "
        >
          <section
            className="
              rounded-3xl

              border
              border-white/10

              bg-[#0d0d0d]

              p-7
            "
          >
            <div className="flex items-center gap-2 text-amber-400">
              <BrainCircuit className="size-5" />

              <h2 className="text-xl font-black">
                Why AI?
              </h2>
            </div>

            <p
              className="
                mt-4

                text-sm
                leading-7

                text-zinc-500
              "
            >
              Fitness decisions depend on interacting variables: goal,
              training history, schedule, food preferences, recovery,
              progression and evidence quality. Deterministic
              calculators remain useful, but AI helps synthesize those
              changing inputs into a practical response.
            </p>
          </section>

          <section
            className="
              rounded-3xl

              border
              border-white/10

              bg-[#0d0d0d]

              p-7
            "
          >
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="size-5" />

              <h2 className="text-xl font-black">
                Responsible by design
              </h2>
            </div>

            <p
              className="
                mt-4

                text-sm
                leading-7

                text-zinc-500
              "
            >
              The product distinguishes fitness education from medical
              diagnosis, avoids invented client facts, surfaces
              uncertainty, and directs high-risk health questions toward
              appropriate professional care.
            </p>
          </section>
        </div>

        {/* =================================================
            DELIVERABLES
        ================================================= */}

        <section
          className="
            mt-8

            rounded-3xl

            border
            border-white/10

            bg-[#0d0d0d]

            p-7
          "
        >
          <h2 className="text-2xl font-black">
            Submission deliverables
          </h2>

          <div
            className="
              mt-6

              grid

              gap-3

              sm:grid-cols-2
            "
          >
            {deliverables.map(
              (
                item,
              ) => (
                <div
                  key={
                    item
                  }
                  className="
                    flex

                    items-center

                    gap-3

                    rounded-2xl

                    border
                    border-white/10

                    bg-black/30

                    p-4
                  "
                >
                  <CheckCircle2
                    className="
                      size-4

                      shrink-0

                      text-emerald-400
                    "
                  />

                  <span className="text-sm text-zinc-300">
                    {item}
                  </span>
                </div>
              ),
            )}
          </div>
        </section>

        {/* =================================================
            FEATURES
        ================================================= */}

        <section
          className="
            mt-8

            rounded-3xl

            border
            border-amber-400/15

            bg-amber-400/4

            p-7
          "
        >
          <h2 className="text-2xl font-black">
            Standout features
          </h2>

          <div className="mt-5 space-y-3">
            {standout.map(
              (
                item,
                index,
              ) => (
                <div
                  key={
                    item
                  }
                  className="
                    grid

                    grid-cols-[36px_1fr]

                    gap-3

                    rounded-2xl

                    border
                    border-white/10

                    bg-black/20

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
                    0
                    {
                      index +
                      1
                    }
                  </span>

                  <p
                    className="
                      text-sm
                      leading-6

                      text-zinc-300
                    "
                  >
                    {item}
                  </p>
                </div>
              ),
            )}
          </div>
        </section>

        {/* =================================================
            ACTIONS
        ================================================= */}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/chatbot"
            className="
              inline-flex

              items-center

              gap-2

              rounded-xl

              bg-amber-400

              px-5
              py-3

              text-sm
              font-black

              text-black
            "
          >
            Demo Dante

            <ExternalLink className="size-4" />
          </Link>

          <Link
            href="/responsible-ai"
            className="
              inline-flex

              items-center

              gap-2

              rounded-xl

              border
              border-white/10

              px-5
              py-3

              text-sm
              font-bold

              text-zinc-300
            "
          >
            Responsible AI
          </Link>
        </div>
      </div>
    </main>
  );
}