import Link from "next/link";

import {
  ArrowLeft,
  BrainCircuit,
  Database,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

const safeguards = [
  {
    title:
      "No diagnosis",

    text:
      "Dante provides educational fitness and wellness guidance and does not diagnose medical conditions.",
  },

  {
    title:
      "No medication instructions",

    text:
      "Dante should not tell users to stop or alter prescribed medication. Medication questions require appropriate professional guidance.",
  },

  {
    title:
      "No invented evidence",

    text:
      "PMIDs, food-data identifiers, product nutrition values and client information must not be fabricated.",
  },

  {
    title:
      "Uncertainty is visible",

    text:
      "When evidence is mixed, missing or low quality, the answer should say so instead of presenting certainty.",
  },
] as const;

export default function ResponsibleAIPage() {
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
      <div className="mx-auto max-w-5xl">
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

          Back home
        </Link>

        <header
          className="
            mt-10

            rounded-3xl

            border
            border-white/10

            bg-white/3

            p-7

            sm:p-10
          "
        >
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="size-5" />

            <p
              className="
                text-xs
                font-black

                uppercase

                tracking-[0.26em]
              "
            >
              Responsible AI
            </p>
          </div>

          <h1
            className="
              mt-5

              text-4xl
              font-black

              uppercase

              tracking-[-0.04em]

              sm:text-6xl
            "
          >
            Dante should help people make better decisions — not
            pretend to be a doctor.
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
            Muscle Fitness uses AI to synthesize client context,
            training, nutrition and recovery information. Safety
            depends on knowing where that system is useful and where
            human professional judgment still matters.
          </p>
        </header>

        <section
          className="
            mt-8

            grid

            gap-4

            md:grid-cols-2
          "
        >
          {safeguards.map(
            (
              item,
            ) => (
              <article
                key={
                  item.title
                }
                className="
                  rounded-3xl

                  border
                  border-white/10

                  bg-[#0d0d0d]

                  p-6
                "
              >
                <ShieldAlert className="size-5 text-amber-400" />

                <h2
                  className="
                    mt-5

                    text-xl
                    font-black
                  "
                >
                  {item.title}
                </h2>

                <p
                  className="
                    mt-3

                    text-sm
                    leading-6

                    text-zinc-500
                  "
                >
                  {item.text}
                </p>
              </article>
            ),
          )}
        </section>

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
          <div
            className="
              grid

              gap-8

              md:grid-cols-2
            "
          >
            <div>
              <BrainCircuit className="size-5 text-amber-400" />

              <h2
                className="
                  mt-4

                  text-2xl
                  font-black
                "
              >
                What AI is used for
              </h2>

              <p
                className="
                  mt-3

                  text-sm
                  leading-7

                  text-zinc-500
                "
              >
                Contextual coaching, evidence-aware explanation,
                training personalization, nutrition guidance and
                synthesis of multiple client inputs.
              </p>
            </div>

            <div>
              <Database className="size-5 text-amber-400" />

              <h2
                className="
                  mt-4

                  text-2xl
                  font-black
                "
              >
                What data can inform it
              </h2>

              <p
                className="
                  mt-3

                  text-sm
                  leading-7

                  text-zinc-500
                "
              >
                Authenticated client profile data, workout and nutrition
                context, recovery/check-in information and external
                sources that are actually connected at runtime.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}