import {
  ArrowRight,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
} from "lucide-react";

const moments = [
  {
    icon:
      Footprints,

    label:
      "START",

    title:
      "One small decision",

    text:
      "You do not need the perfect plan. You need one reason to return tomorrow.",
  },

  {
    icon:
      Gauge,

    label:
      "RESISTANCE",

    title:
      "Progress slows",

    text:
      "Motivation fades. Progress stalls. Sometimes the answer is not quitting — the plan needs to change.",
  },

  {
    icon:
      Dumbbell,

    label:
      "DISCOVERY",

    title:
      "Strength changes the goal",

    text:
      "The question changes from “How much can I lose?” to “What can I become?”",
  },

  {
    icon:
      Flame,

    label:
      "FORWARD",

    title:
      "Keep moving",

    text:
      "A pawn can be anything if it pushes forward.",
  },
] as const;

export function InspirationStory() {
  return (
    <section
      id="inspiration"
      className="
        relative

        overflow-hidden

        border-y
        border-white/10

        bg-[#090909]

        px-5
        py-24

        sm:px-6

        lg:px-8
        lg:py-32
      "
    >
      <div
        aria-hidden="true"
        className="
          pointer-events-none

          absolute
          inset-0

          bg-[radial-gradient(circle_at_20%_10%,rgba(245,158,11,0.12),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(255,255,255,0.05),transparent_26%)]
        "
      />

      <div className="relative mx-auto max-w-7xl">
        <div
          className="
            grid

            gap-14

            lg:grid-cols-[0.9fr_1.1fr]
            lg:gap-20
          "
        >
          {/* STORY */}

          <div>
            <p
              className="
                text-xs
                font-black

                uppercase

                tracking-[0.3em]

                text-amber-400
              "
            >
              The First Rep
            </p>

            <h2
              className="
                mt-5

                max-w-3xl

                text-4xl
                font-black

                uppercase

                leading-[0.95]

                tracking-[-0.04em]

                text-white

                sm:text-5xl
                lg:text-6xl
              "
            >
              The mirror did not change first.

              <span
                className="
                  mt-2

                  block

                  text-zinc-600
                "
              >
                The person looking into it did.
              </span>
            </h2>

            <div
              className="
                mt-8

                space-y-5

                text-base
                leading-8

                text-zinc-400
              "
            >
              <p>
                At first, the gym felt built for someone else. Progress
                looked distant, and confidence even further away.
              </p>

              <p>
                So the beginning stayed small: one walk, one session, one
                reason to return tomorrow.
              </p>

              <p>
                Then progress slowed. Motivation disappeared. Instead of
                quitting, the plan changed. Training became deliberate.
                Nutrition became intentional. Recovery began to matter.
              </p>

              <p className="font-semibold text-zinc-200">
                Eventually, the goal was no longer simply to look
                different. It was to become stronger, more capable, more
                disciplined — and more at peace with the person being
                built.
              </p>
            </div>

            <blockquote
              className="
                mt-9

                border-l-2
                border-amber-400

                pl-5

                text-xl
                font-bold

                leading-8

                text-white
              "
            >
              “A pawn can be anything if it pushes forward.”
            </blockquote>
          </div>

          {/* MOMENTS */}

          <div
            className="
              grid

              gap-3

              sm:grid-cols-2
            "
          >
            {moments.map(
              (
                moment,
                index,
              ) => {
                const Icon =
                  moment.icon;

                return (
                  <article
                    key={
                      moment.label
                    }
                    className="
                      group

                      rounded-3xl

                      border
                      border-white/10

                      bg-white/3

                      p-6

                      transition

                      hover:border-amber-400/30
                      hover:bg-amber-400/4
                    "
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="
                          grid

                          size-11

                          place-items-center

                          rounded-2xl

                          border
                          border-amber-400/20

                          bg-amber-400/10

                          text-amber-400
                        "
                      >
                        <Icon className="size-5" />
                      </div>

                      <span
                        className="
                          text-xs
                          font-black

                          tracking-[0.22em]

                          text-zinc-700
                        "
                      >
                        0
                        {
                          index +
                          1
                        }
                      </span>
                    </div>

                    <p
                      className="
                        mt-8

                        text-[10px]
                        font-black

                        uppercase

                        tracking-[0.22em]

                        text-amber-400
                      "
                    >
                      {moment.label}
                    </p>

                    <h3
                      className="
                        mt-2

                        text-xl
                        font-black

                        text-white
                      "
                    >
                      {moment.title}
                    </h3>

                    <p
                      className="
                        mt-3

                        text-sm
                        leading-6

                        text-zinc-500
                      "
                    >
                      {moment.text}
                    </p>
                  </article>
                );
              },
            )}
          </div>
        </div>

        <div
          className="
            mt-14

            flex
            flex-col
            items-start

            gap-6

            border-t
            border-white/10

            pt-8

            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <p
            className="
              text-sm
              font-bold

              uppercase

              tracking-[0.2em]

              text-zinc-500
            "
          >
            You will always wish you started sooner. But{" "}
            <span className="text-amber-400">
              today is the youngest you will ever be.
            </span>
          </p>

          <a
            href="#discipline"
            className="
              inline-flex

              shrink-0

              items-center

              gap-2

              text-sm
              font-bold

              text-zinc-400

              transition

              hover:text-amber-400
            "
          >
            Keep moving

            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export default InspirationStory;