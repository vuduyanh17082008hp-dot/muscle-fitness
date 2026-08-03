// components/story/StoryHero.tsx

"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

export default function StoryHero() {
  const shouldReduceMotion = useReducedMotion();

  const revealAnimation = shouldReduceMotion
    ? false
    : {
        opacity: 0,
        y: 40,
      };

  return (
    <section className="relative min-h-[calc(100svh-88px)] overflow-hidden bg-black">
      {/* Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_38%,rgba(127,29,29,0.30),transparent_34%),radial-gradient(circle_at_28%_82%,rgba(180,83,9,0.14),transparent_30%),linear-gradient(to_bottom,#030303,#080505_55%,#000)]" />

      {/* Animated glow */}
      <motion.div
        aria-hidden="true"
        initial={
          shouldReduceMotion
            ? false
            : {
                opacity: 0,
                scale: 1.1,
              }
        }
        animate={{
          opacity: 1,
          scale: 1,
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 2.2,
          ease: "easeOut",
        }}
        className="pointer-events-none absolute inset-0"
      >
        <div className="absolute left-[10%] top-[22%] size-64 rounded-full bg-red-900/20 blur-[120px]" />
        <div className="absolute bottom-[6%] right-[8%] size-80 rounded-full bg-amber-700/15 blur-[140px]" />
      </motion.div>

      {/* Dark overlays */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black via-black/60 to-black/30" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black" />

      {/* Grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-88px)] w-full max-w-7xl flex-col px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
        {/* Back button */}
        <motion.div
          initial={
            shouldReduceMotion
              ? false
              : {
                  opacity: 0,
                  x: -20,
                }
          }
          animate={{
            opacity: 1,
            x: 0,
          }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.6,
            ease: "easeOut",
          }}
        >
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-5 text-sm font-semibold text-zinc-300 backdrop-blur-md transition duration-300 hover:border-white/30 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            <ArrowLeft
              aria-hidden="true"
              className="size-4"
            />

            Home
          </Link>
        </motion.div>

        {/* Main hero content */}
        <div className="flex flex-1 items-center py-10 sm:py-12 lg:py-14">
          <motion.div
            initial={revealAnimation}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.9,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="w-full max-w-6xl"
          >
            <div className="mb-5 flex items-center gap-4">
              <span className="text-xs font-black tracking-[0.36em] text-red-500 sm:text-sm">
                FROM 88 KG TO 68 KG
              </span>

              <span className="hidden h-px max-w-40 flex-1 bg-gradient-to-r from-red-800/80 to-transparent sm:block" />
            </div>

            <h1 className="max-w-6xl text-[clamp(3.2rem,7.1vw,6.9rem)] font-black uppercase leading-[0.86] tracking-[-0.055em] text-white">
              <span className="block">
                From Hiding
              </span>

              <span className="block text-zinc-500">
                From the World
              </span>

              <span className="block bg-gradient-to-r from-white via-amber-100 to-amber-500 bg-clip-text text-transparent">
                To Building a
              </span>

              <span className="block bg-gradient-to-r from-white via-amber-100 to-amber-500 bg-clip-text text-transparent">
                Movement
              </span>
            </h1>

            <p className="mt-7 max-w-3xl text-base leading-7 text-zinc-400 sm:text-lg sm:leading-8">
              I once struggled to run, face a mirror or believe I deserved
              confidence. Eight months later, I reached 68 kilograms—but the
              person I discovered along the way became the real
              transformation.
            </p>

            <blockquote className="mt-7 max-w-3xl border-l-2 border-red-800 py-1 pl-5 sm:pl-6">
              <p className="text-lg font-semibold italic leading-8 text-zinc-200 sm:text-xl">
                “The weight on my body was visible. The weight inside my mind
                was not.”
              </p>
            </blockquote>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href="#the-beginning"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 text-sm font-black uppercase tracking-[0.14em] text-black transition duration-300 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
              >
                Read My Journey

                <ArrowDown
                  aria-hidden="true"
                  className="size-4"
                />
              </a>

              <Link
                href="/login"
                className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full border border-white/15 bg-white/[0.035] px-7 text-sm font-black uppercase tracking-[0.14em] text-white backdrop-blur-md transition duration-300 hover:border-white/35 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                Start Your Transformation

                <ArrowRight
                  aria-hidden="true"
                  className="size-4"
                />
              </Link>
            </div>

            <div className="mt-10 grid max-w-3xl grid-cols-3 gap-3 sm:mt-12 sm:gap-6">
              <article className="border-t border-white/10 pt-4">
                <p className="text-lg font-black text-white sm:text-2xl">
                  20 KG
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">
                  Weight lost
                </p>
              </article>

              <article className="border-t border-white/10 pt-4">
                <p className="text-lg font-black text-white sm:text-2xl">
                  8 MONTHS
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">
                  Transformation
                </p>
              </article>

              <article className="border-t border-white/10 pt-4">
                <p className="text-lg font-black text-white sm:text-2xl">
                  4D
                </p>

                <p className="mt-1 text-xs leading-5 text-zinc-500 sm:text-sm">
                  Core philosophy
                </p>
              </article>
            </div>
          </motion.div>
        </div>

        {/* Scroll button */}
        <motion.a
          href="#the-beginning"
          aria-label="Go to the first story chapter"
          initial={
            shouldReduceMotion
              ? false
              : {
                  opacity: 0,
                }
          }
          animate={{
            opacity: 1,
          }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.7,
            delay: shouldReduceMotion ? 0 : 0.7,
          }}
          className="mx-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-zinc-500 backdrop-blur-sm transition duration-300 hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <ArrowDown
            aria-hidden="true"
            className={
              shouldReduceMotion
                ? "size-5"
                : "size-5 animate-bounce"
            }
          />
        </motion.a>
      </div>
    </section>
  );
}