"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

export function Hero() {
  return (
    <section className="relative min-h-[100svh] overflow-hidden bg-ink text-bone">
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=2400&q=80"
          alt="Athlete training under overhead lights in a weight room"
          fill
          priority
          className="hero-media object-cover object-[center_30%]"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/92 via-ink/70 to-ink/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/40" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-5 pb-16 pt-28 sm:px-8 sm:pb-20">
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-5xl leading-none tracking-[0.03em] text-lime sm:text-7xl md:text-8xl"
        >
          Muscle Fitness
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 max-w-xl text-2xl font-medium leading-tight text-bone sm:text-3xl"
        >
          Train with intent. Measure what matters. Build strength that lasts.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-md text-base leading-relaxed text-bone/75 sm:text-lg"
        >
          Adaptive programs, AI coaching, and form feedback — one training system
          for serious lifters.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <Link
            href="/dashboard"
            className="bg-lime px-6 py-3 text-sm font-semibold tracking-wide text-ink transition hover:bg-white"
          >
            Start training
          </Link>
          <a
            href="#method"
            className="border border-bone/35 px-6 py-3 text-sm font-medium text-bone transition hover:border-lime hover:text-lime"
          >
            See the method
          </a>
        </motion.div>
        <div className="mt-10 h-px w-40 bg-lime accent-line" />
      </div>
    </section>
  );
}
