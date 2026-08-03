"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const reveal = {
  hidden: {
    opacity: 0,
    y: 32,
  },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

export default function StoryTeaser() {
  return (
    <section
      id="story"
      className="
        relative overflow-hidden
        bg-[#090807]
        px-6 py-28
        text-[#f3eadf]
        md:px-10 md:py-40
      "
    >
      {/* BACKGROUND */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-[#090807] to-black" />

        <div
          className="
            absolute left-1/2 top-1/2
            h-[650px] w-[1100px]
            -translate-x-1/2 -translate-y-1/2
            rounded-full
            bg-white/[0.025]
            blur-[140px]
          "
        />

        <div className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        {/* subtle vertical line */}
        <div className="absolute left-6 top-0 hidden h-full w-px bg-white/[0.05] md:block" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl">

        {/* TOP LABEL */}
        <motion.div
          variants={reveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          className="mb-10 flex items-center gap-4"
        >
          <span className="h-px w-10 bg-[#c8a97e]" />

          <p
            className="
              text-[10px] font-bold
              uppercase tracking-[0.35em]
              text-[#c8a97e]
              sm:text-xs
            "
          >
            Why Muscle Fitness Exists
          </p>
        </motion.div>

        {/* MAIN GRID */}
        <div
          className="
            grid items-start gap-16
            lg:grid-cols-[1.15fr_0.85fr]
            lg:gap-24
          "
        >
          {/* LEFT SIDE */}
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 35 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.85,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="
                max-w-4xl
                text-5xl font-black
                uppercase
                leading-[0.9]
                tracking-[-0.055em]
                sm:text-6xl
                md:text-7xl
                lg:text-[88px]
              "
            >
              This was never
              <br />

              <span className="text-white/35">
                about a number.
              </span>
            </motion.h2>

            {/* QUOTE */}
            <motion.blockquote
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.8,
                delay: 0.15,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="
                mt-12
                max-w-3xl
                border-l border-[#c8a97e]/60
                pl-6
                text-xl font-semibold
                leading-[1.5]
                text-white
                md:text-2xl
              "
            >
              “The hardest part was never losing the weight.
              It was becoming someone who refused to quit.”
            </motion.blockquote>

            {/* STORY */}
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{
                duration: 0.8,
                delay: 0.25,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="
                mt-10
                max-w-3xl
                space-y-6
                text-[15px]
                leading-8
                text-white/55
                md:text-base
              "
            >
              <p>
                There were mornings when motivation was gone.
                Days when progress felt invisible.
                Sessions where quitting would have been easier
                than finishing one more set.
              </p>

              <p>
                But I kept showing up.
              </p>

              <p>
                Not because I always felt strong —
                but because I was tired of becoming the person
                who kept making promises to himself
                and breaking them.
              </p>

              <p className="font-semibold text-white/85">
                Training became more than training.
                It became proof that I could change my life
                by refusing to walk away from it.
              </p>
            </motion.div>
          </div>

          {/* RIGHT SIDE */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.9,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="
              relative
              border border-white/[0.08]
              bg-white/[0.025]
              p-7
              backdrop-blur-sm
              md:p-10
            "
          >
            {/* number */}
            <span
              className="
                absolute right-6 top-3
                select-none
                text-[100px] font-black
                leading-none tracking-[-0.08em]
                text-white/[0.025]
                md:text-[140px]
              "
            >
              01
            </span>

            <p
              className="
                relative z-10
                text-[10px] font-bold
                uppercase tracking-[0.3em]
                text-white/35
              "
            >
              The reason behind it
            </p>

            <h3
              className="
                relative z-10
                mt-8
                text-3xl font-black
                uppercase
                leading-[1]
                tracking-[-0.04em]
                text-white
                md:text-4xl
              "
            >
              I built what
              <br />
              I once needed.
            </h3>

            <div
              className="
                relative z-10
                mt-9 space-y-6
                text-sm leading-7
                text-white/50
              "
            >
              <p>
                Muscle Fitness was not created because I wanted
                another fitness website.
              </p>

              <p>
                It came from the years of trial and error,
                self-doubt, discipline, missed comfort,
                repeated failures, and the decision to keep
                moving forward anyway.
              </p>

              <p>
                I wanted to build the kind of system I wish
                I had when I started — something that gives
                people structure when motivation disappears,
                direction when progress feels slow,
                and a reason to keep going when quitting
                feels easier.
              </p>
            </div>

            {/* SMALL TRANSFORMATION PROOF */}
            <div
              className="
                relative z-10
                mt-10
                grid grid-cols-2
                border-y border-white/[0.08]
                py-6
              "
            >
              <div>
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/30">
                  Where it began
                </p>

                <p className="mt-2 text-xl font-black text-white/70">
                  88 KG
                </p>
              </div>

              <div className="border-l border-white/[0.08] pl-6">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/30">
                  Not the finish line
                </p>

                <p className="mt-2 text-xl font-black text-white/70">
                  68 KG
                </p>
              </div>
            </div>

            <p
              className="
                relative z-10
                mt-5
                text-xs italic leading-6
                text-white/30
              "
            >
              The weight changed first.
              The person behind it took much longer.
            </p>
          </motion.div>
        </div>

        {/* STRONG TRANSITION */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{
            duration: 0.8,
            delay: 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="
            mt-24
            border-t border-white/[0.08]
            pt-14
            md:mt-32 md:pt-16
          "
        >
          <div
            className="
              flex flex-col gap-10
              lg:flex-row
              lg:items-end
              lg:justify-between
            "
          >
            <div className="max-w-4xl">
              <p
                className="
                  mb-5
                  text-[10px] font-bold
                  uppercase tracking-[0.35em]
                  text-[#c8a97e]
                "
              >
                Dedication over motivation
              </p>

              <h3
                className="
                  text-3xl font-black
                  uppercase
                  leading-[1.05]
                  tracking-[-0.04em]
                  text-white
                  sm:text-4xl
                  md:text-5xl
                "
              >
                Motivation started it.
                <br />

                <span className="text-white/35">
                  Dedication rebuilt everything.
                </span>
              </h3>

              <p
                className="
                  mt-7 max-w-2xl
                  text-sm leading-7
                  text-white/45
                  md:text-base
                "
              >
                This platform exists for the days when you
                do not feel motivated — because those are
                often the days that decide who you become.
              </p>
            </div>

            {/* CTA */}
            <Link
              href="/story"
              className="
                group
                inline-flex
                w-fit
                items-center
                gap-4
                border-b
                border-white/30
                pb-2
                text-xs font-bold
                uppercase
                tracking-[0.22em]
                text-white
                transition-colors
                duration-300
                hover:border-[#c8a97e]
                hover:text-[#c8a97e]
              "
            >
              Read My Full Story

              <ArrowRight
                size={17}
                className="
                  transition-transform
                  duration-300
                  group-hover:translate-x-2
                "
              />
            </Link>
          </div>
        </motion.div>

      </div>
    </section>
  );
}