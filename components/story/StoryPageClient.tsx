// components/story/StoryPageClient.tsx

"use client";

import Link from "next/link";
import {
  useRef,
  useState,
} from "react";
import {
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import {
  fourDPillars,
  storyChapters,
} from "@/data/storyContent";
import StoryChapter from "./StoryChapter";
import StoryHero from "./StoryHero";

const previewChapters = storyChapters.slice(0, 3);
const hiddenChapters = storyChapters.slice(3);

export default function StoryPageClient() {
  const [expanded, setExpanded] = useState(false);
  const firstHiddenChapterRef = useRef<HTMLDivElement>(null);
  const keepReadingRef = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const scrollBehavior = shouldReduceMotion ? "auto" : "smooth";

  function handleKeepReading() {
    if (!expanded) {
      setExpanded(true);

      window.setTimeout(
        () => {
          firstHiddenChapterRef.current?.scrollIntoView({
            behavior: scrollBehavior,
            block: "start",
          });
        },
        shouldReduceMotion ? 0 : 300,
      );

      return;
    }

    firstHiddenChapterRef.current?.scrollIntoView({
      behavior: scrollBehavior,
      block: "start",
    });
  }

  function handleCollapse() {
    keepReadingRef.current?.scrollIntoView({
      behavior: scrollBehavior,
      block: "center",
    });

    window.setTimeout(
      () => {
        setExpanded(false);
      },
      shouldReduceMotion ? 0 : 450,
    );
  }

  return (
    <main className="story-page overflow-x-clip bg-black text-white">
      <StoryHero />

      {previewChapters.map((chapter) => (
        <StoryChapter key={chapter.id} chapter={chapter} />
      ))}

      <section
        ref={keepReadingRef}
        className="relative border-y border-white/[0.07] bg-zinc-950"
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center px-5 py-20 text-center sm:px-8 sm:py-28">
          <p className="text-xs font-black tracking-[0.35em] text-red-500">
            THE TURNING POINT
          </p>

          <h2 className="mt-5 text-4xl font-black uppercase tracking-[-0.04em] text-white sm:text-6xl">
            The Story Goes Deeper
          </h2>

          <p className="mt-6 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg">
            The first three chapters explain where the struggle began. The
            next chapters reveal the decision, sacrifice, discipline and
            purpose that followed.
          </p>

          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="deeper-story"
            onClick={handleKeepReading}
            className="mt-9 inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-8 text-sm font-black uppercase tracking-[0.16em] text-black transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-zinc-950"
          >
            {expanded ? "Continue the Journey" : "Keep Reading"}

            <ChevronDown
              aria-hidden="true"
              className={`size-5 transition-transform duration-300 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>

          <p className="mt-4 text-xs text-zinc-600">
            {expanded
              ? "Seven deeper chapters are now open."
              : "Continue through the complete transformation."}
          </p>
        </div>
      </section>

      <motion.div
        id="deeper-story"
        aria-hidden={!expanded}
        initial={false}
        animate={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.75,
          ease: [0.22, 1, 0.36, 1],
        }}
        className={`grid ${
          expanded ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div ref={firstHiddenChapterRef} className="scroll-mt-20">
            {hiddenChapters.map((chapter) => (
              <StoryChapter key={chapter.id} chapter={chapter} />
            ))}
          </div>

          <section className="border-t border-white/10 bg-[radial-gradient(circle_at_center_top,rgba(180,83,9,0.28),transparent_38%),#050505]">
            <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-36">
              <div className="text-center">
                <p className="text-xs font-black tracking-[0.4em] text-amber-500">
                  THE 4D CODE
                </p>

                <h2 className="mt-5 text-4xl font-black uppercase tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
                  Dedication. Determination.
                  <span className="block text-zinc-500">
                    Drive. Discipline.
                  </span>
                </h2>
              </div>

              <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {fourDPillars.map((pillar, index) => (
                  <motion.article
                    key={pillar.title}
                    initial={
                      shouldReduceMotion
                        ? false
                        : {
                            opacity: 0,
                            y: 30,
                          }
                    }
                    whileInView={{
                      opacity: 1,
                      y: 0,
                    }}
                    viewport={{
                      once: true,
                      amount: 0.25,
                    }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.6,
                      delay: shouldReduceMotion ? 0 : index * 0.08,
                    }}
                    className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 transition hover:border-amber-600/50 hover:bg-white/[0.06]"
                  >
                    <span className="text-xs font-bold tracking-[0.3em] text-zinc-600">
                      0{index + 1}
                    </span>

                    <h3 className="mt-8 text-2xl font-black uppercase text-white">
                      {pillar.title}
                    </h3>

                    <p className="mt-4 leading-7 text-zinc-400">
                      “{pillar.text}”
                    </p>
                  </motion.article>
                ))}
              </div>

              <div className="mx-auto mt-20 max-w-4xl text-center">
                <h2 className="text-4xl font-black uppercase tracking-[-0.04em] text-white sm:text-6xl">
                  Your First Day Can Begin Here
                </h2>

                <p className="mx-auto mt-7 max-w-2xl text-lg leading-9 text-zinc-400">
                  You do not need to transform your entire life today. You
                  only need to make one decision that your future self will
                  thank you for.
                </p>

                <p className="mx-auto mt-5 max-w-2xl text-xl font-semibold leading-9 text-zinc-200">
                  You will always wish you started sooner. But today is the
                  youngest you will ever be.
                </p>

                <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
                  <Link
                    href="/login"
                    className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-amber-400 px-8 text-sm font-black uppercase tracking-[0.15em] text-black transition hover:bg-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-black"
                  >
                    Start Your Transformation
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>

                  <Link
                    href="/"
                    className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/15 px-8 text-sm font-black uppercase tracking-[0.15em] text-white transition hover:border-white/35 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    Return Home
                  </Link>
                </div>

                <button
                  type="button"
                  onClick={handleCollapse}
                  className="mt-10 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-zinc-500 transition hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <ChevronUp aria-hidden="true" className="size-4" />
                  Show Less
                </button>
              </div>
            </div>
          </section>
        </div>
      </motion.div>
    </main>
  );
}