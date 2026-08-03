// components/story/StoryChapter.tsx

"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Quote } from "lucide-react";

import type {
  StoryChapterData,
  StoryTheme,
} from "@/data/storyContent";
import StoryVisual from "./StoryVisual";

type StoryChapterProps = {
  chapter: StoryChapterData;
};

const sectionStyles: Record<StoryTheme, string> = {
  dark: "bg-black",
  crimson:
    "bg-[radial-gradient(circle_at_25%_50%,rgba(127,29,29,0.20),transparent_40%),#050505]",
  steel:
    "bg-[radial-gradient(circle_at_75%_50%,rgba(100,116,139,0.15),transparent_42%),#050505]",
  gold:
    "bg-[radial-gradient(circle_at_50%_35%,rgba(180,83,9,0.15),transparent_42%),#050505]",
};

const eyebrowStyles: Record<StoryTheme, string> = {
  dark: "text-zinc-500",
  crimson: "text-red-500",
  steel: "text-slate-400",
  gold: "text-amber-500",
};

const quoteBorderStyles: Record<StoryTheme, string> = {
  dark: "border-zinc-700",
  crimson: "border-red-800",
  steel: "border-slate-600",
  gold: "border-amber-700",
};

export default function StoryChapter({ chapter }: StoryChapterProps) {
  const shouldReduceMotion = useReducedMotion();
  const visualFirst = chapter.alignment === "left";

  return (
    <section
      id={chapter.id}
      aria-labelledby={`${chapter.id}-title`}
      className={`scroll-mt-20 border-t border-white/[0.06] ${sectionStyles[chapter.theme]}`}
    >
      <motion.div
        initial={
          shouldReduceMotion
            ? false
            : {
                opacity: 0,
                y: 55,
              }
        }
        whileInView={{
          opacity: 1,
          y: 0,
        }}
        viewport={{
          once: true,
          amount: 0.15,
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.75,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-12 lg:py-36"
      >
        <div className={visualFirst ? "lg:order-1" : "lg:order-2"}>
          <StoryVisual
            media={chapter.media}
            theme={chapter.theme}
            chapterNumber={chapter.chapterNumber}
          />
        </div>

        <div className={visualFirst ? "lg:order-2" : "lg:order-1"}>
          <div className="mb-6 flex items-center gap-4">
            <span
              className={`text-xs font-black tracking-[0.32em] ${eyebrowStyles[chapter.theme]}`}
            >
              {chapter.eyebrow}
            </span>

            <span className="h-px flex-1 bg-white/10" />
          </div>

          <h2
            id={`${chapter.id}-title`}
            className="max-w-3xl text-4xl font-black uppercase leading-[0.98] tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl"
          >
            {chapter.title}
          </h2>

          <div className="mt-8 space-y-5">
            {chapter.paragraphs.map((paragraph) => (
              <p
                key={paragraph}
                className="max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg sm:leading-9"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <blockquote
            className={`relative mt-10 border-l-2 py-2 pl-6 sm:pl-8 ${quoteBorderStyles[chapter.theme]}`}
          >
            <Quote
              aria-hidden="true"
              className="mb-4 size-6 text-white/25"
            />

            <p className="max-w-2xl text-xl font-semibold italic leading-8 text-zinc-200 sm:text-2xl sm:leading-9">
              “{chapter.quote}”
            </p>
          </blockquote>
        </div>
      </motion.div>
    </section>
  );
}