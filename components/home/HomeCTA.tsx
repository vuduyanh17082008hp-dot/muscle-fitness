"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export default function HomeCTA() {
  return (
    <section className="relative overflow-hidden bg-black px-6 py-28 md:px-10 md:py-36">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950 via-black to-black" />

        <div
          className="
            absolute left-1/2 top-1/2
            h-[500px] w-[900px]
            -translate-x-1/2 -translate-y-1/2
            rounded-full
            bg-white/[0.03]
            blur-[120px]
          "
        />

        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{
          duration: 0.8,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="
          relative z-10 mx-auto
          flex max-w-5xl flex-col
          items-center text-center
        "
      >
        {/* Small title */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="
            mb-6 text-xs font-semibold
            uppercase tracking-[0.35em]
            text-zinc-500
          "
        >
          Your transformation starts here
        </motion.p>

        {/* Main title */}
        <motion.h2
          initial={{ opacity: 0, y: 25 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{
            duration: 0.7,
            delay: 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="
            max-w-4xl
            text-4xl font-black uppercase
            leading-[0.95] tracking-[-0.04em]
            text-white
            sm:text-5xl
            md:text-7xl
            lg:text-8xl
          "
        >
          Stop waiting.
          <br />

          <span className="text-zinc-500">
            Start building.
          </span>
        </motion.h2>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, delay: 0.25 }}
          className="
            mt-8 max-w-2xl
            text-sm leading-7 text-zinc-400
            md:text-base
          "
        >
          Training is more than changing how you look.
          Build discipline, strength and a body that represents
          the work you put in every day.
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65, delay: 0.35 }}
          className="
            mt-10 flex flex-col
            items-center gap-4
            sm:flex-row
          "
        >
          <Link
            href="/signup"
            className="
              group flex min-w-[180px]
              items-center justify-center gap-2
              bg-white px-7 py-4
              text-sm font-bold uppercase
              tracking-[0.12em] text-black
              transition-all duration-300
              hover:-translate-y-1
              hover:bg-zinc-200
            "
          >
            Start Free

            <ArrowRight
              size={17}
              className="
                transition-transform duration-300
                group-hover:translate-x-1
              "
            />
          </Link>

          <Link
            href="/story"
            className="
              group flex min-w-[180px]
              items-center justify-center gap-2
              border border-white/15
              bg-white/[0.03]
              px-7 py-4
              text-sm font-semibold uppercase
              tracking-[0.12em]
              text-white
              backdrop-blur-sm
              transition-all duration-300
              hover:border-white/35
              hover:bg-white/[0.07]
            "
          >
            My Story

            <ArrowRight
              size={17}
              className="
                transition-transform duration-300
                group-hover:translate-x-1
              "
            />
          </Link>
        </motion.div>
      </motion.div>
    </section>
  );
}