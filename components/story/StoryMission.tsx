"use client"

import Link from "next/link"

import {
  ArrowRight,
  Dumbbell,
  Heart,
  Users,
} from "lucide-react"

import type {
  LucideIcon,
} from "lucide-react"

import {
  motion,
} from "framer-motion"

export default function StoryMission() {
  return (
    <section className="relative flex min-h-screen items-center overflow-hidden bg-[#090807] px-6 py-32">

      <motion.div
        animate={{
          scale: [1, 1.12, 1],
          opacity: [0.03, 0.08, 0.03],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#c9a16d] blur-[200px]"
      />

      <div className="relative mx-auto w-full max-w-7xl">

        <div className="grid items-center gap-16 lg:grid-cols-[1.2fr_.8fr]">

          <div>

            <motion.p
              initial={{
                opacity: 0,
                y: 30,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: false,
              }}
              className="text-xs font-black tracking-[0.35em] text-[#c9a16d]"
            >
              WHY MUSCLE FITNESS EXISTS
            </motion.p>

            <motion.h2
              initial={{
                opacity: 0,
                y: 80,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: false,
              }}
              transition={{
                duration: 0.9,
              }}
              className="mt-6 text-6xl font-black uppercase leading-[0.88] tracking-[-0.06em] md:text-8xl"
            >

              MY JOURNEY

              <br />

              BECAME

              <br />

              <span className="text-[#c9a16d]">
                MY PURPOSE.
              </span>

            </motion.h2>

            <motion.p
              initial={{
                opacity: 0,
                y: 30,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: false,
              }}
              transition={{
                delay: 0.2,
              }}
              className="mt-10 max-w-2xl text-xl leading-9 text-[#b7a897]"
            >
              I know what it feels like to want to change
              but not know where to begin.
              That is why Muscle Fitness exists.
            </motion.p>

            <motion.p
              initial={{
                opacity: 0,
                y: 30,
              }}
              whileInView={{
                opacity: 1,
                y: 0,
              }}
              viewport={{
                once: false,
              }}
              transition={{
                delay: 0.35,
              }}
              className="mt-5 max-w-2xl text-xl leading-9 text-[#ded3c5]"
            >
              I don&apos;t want you to become another version of me.
              I want to help you discover the strongest version of yourself.
            </motion.p>

          </div>

          <div className="space-y-4">

            <MissionCard
              icon={Dumbbell}
              title="TRAIN WITH PURPOSE"
              text="Every workout should move you closer to the person you want to become."
              delay={0}
            />

            <MissionCard
              icon={Heart}
              title="BUILD YOURSELF"
              text="Fitness is not punishment for who you are. It is an investment in who you can become."
              delay={0.12}
            />

            <MissionCard
              icon={Users}
              title="GO FURTHER TOGETHER"
              text="You may start alone, but you do not have to figure everything out alone."
              delay={0.24}
            />

          </div>

        </div>

        <motion.div
          initial={{
            opacity: 0,
            y: 80,
          }}
          whileInView={{
            opacity: 1,
            y: 0,
          }}
          viewport={{
            once: false,
          }}
          transition={{
            duration: 0.9,
          }}
          className="mt-28 border-t border-[#3a2f26] pt-16"
        >

          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">

            <div>

              <p className="text-xs font-black tracking-[0.3em] text-[#766a5c]">
                YOUR TURN
              </p>

              <h3 className="mt-4 max-w-4xl text-4xl font-black uppercase leading-tight tracking-[-0.04em] md:text-6xl">

                ONE DAY,

                <br />

                YOU&apos;LL LOOK BACK

                <br />

                <span className="text-[#c9a16d]">
                  AND BE GLAD YOU STARTED.
                </span>

              </h3>

            </div>

            <motion.div
              whileHover={{
                scale: 1.04,
              }}
              whileTap={{
                scale: 0.96,
              }}
            >

              <Link
                href="/signup"
                className="group flex items-center justify-center gap-4 rounded-xl bg-[#c9a16d] px-8 py-5 text-sm font-black tracking-[0.16em] text-[#130e09]"
              >
                START YOUR STORY

                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-2" />
              </Link>

            </motion.div>

          </div>

        </motion.div>

      </div>
    </section>
  )
}

function MissionCard({
  icon: Icon,
  title,
  text,
  delay,
}: {
  icon: LucideIcon
  title: string
  text: string
  delay: number
}) {
  return (
    <motion.article
      initial={{
        opacity: 0,
        x: 70,
      }}
      whileInView={{
        opacity: 1,
        x: 0,
      }}
      viewport={{
        once: false,
        amount: 0.35,
      }}
      transition={{
        duration: 0.75,
        delay,
      }}
      whileHover={{
        x: -8,
      }}
      className="rounded-2xl border border-[#392e25] bg-[#110e0c] p-6"
    >

      <div className="flex gap-5">

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#493a2d] bg-[#18120e]">

          <Icon className="h-5 w-5 text-[#c9a16d]" />

        </div>

        <div>

          <h4 className="text-sm font-black tracking-[0.15em]">
            {title}
          </h4>

          <p className="mt-3 leading-7 text-[#8f8274]">
            {text}
          </p>

        </div>

      </div>

    </motion.article>
  )
}
