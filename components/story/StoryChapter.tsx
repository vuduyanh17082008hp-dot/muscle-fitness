import Image from "next/image"

import type {
  StoryChapterData,
  StoryTheme,
} from "@/data/storyContent"

export type StoryChapterProps = {
  chapter: StoryChapterData
  index?: number
}

type ThemeClasses = {
  section: string
  glow: string
  accent: string
  badge: string
  quoteBorder: string
}

const themeClasses: Record<
  StoryTheme,
  ThemeClasses
> = {
  dark: {
    section:
      "border-white/10 bg-[#070707]",
    glow:
      "bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_45%)]",
    accent: "text-zinc-400",
    badge:
      "border-white/15 bg-white/5 text-zinc-300",
    quoteBorder:
      "border-zinc-500",
  },

  steel: {
    section:
      "border-slate-500/20 bg-gradient-to-br from-[#0b0d10] via-[#08090b] to-black",
    glow:
      "bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.12),transparent_45%)]",
    accent: "text-slate-300",
    badge:
      "border-slate-400/20 bg-slate-400/10 text-slate-200",
    quoteBorder:
      "border-slate-400",
  },

  bronze: {
    section:
      "border-amber-500/20 bg-gradient-to-br from-[#130d07] via-[#090807] to-black",
    glow:
      "bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_45%)]",
    accent: "text-amber-500",
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
    quoteBorder:
      "border-amber-500",
  },

  red: {
    section:
      "border-red-500/20 bg-gradient-to-br from-[#150808] via-[#0a0707] to-black",
    glow:
      "bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.13),transparent_45%)]",
    accent: "text-red-400",
    badge:
      "border-red-500/30 bg-red-500/10 text-red-300",
    quoteBorder:
      "border-red-500",
  },
}

function ChapterVisual({
  chapter,
}: {
  chapter: StoryChapterData
}) {
  const theme =
    themeClasses[chapter.theme]

  if (chapter.image) {
    return (
      <div className="relative min-h-[420px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0d0d0d]">
        <Image
          src={chapter.image}
          alt={
            chapter.imageAlt ??
            chapter.title
          }
          fill
          sizes="(max-width: 1024px) 100vw, 45vw"
          className="object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-7">
          <p
            className={`text-xs font-black uppercase tracking-[0.3em] ${theme.accent}`}
          >
            Chapter{" "}
            {String(
              chapter.chapterNumber,
            ).padStart(2, "0")}
          </p>

          <p className="mt-3 max-w-md text-lg font-bold leading-7 text-white">
            {chapter.quote}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0b0b] p-8">
      <div
        aria-hidden="true"
        className={`absolute inset-0 ${theme.glow}`}
      />

      <div
        aria-hidden="true"
        className="absolute inset-6 rounded-[24px] border border-white/5"
      />

      <div className="relative text-center">
        <p className="text-[100px] font-black leading-none tracking-tighter text-white/[0.04] sm:text-[140px]">
          {String(
            chapter.chapterNumber,
          ).padStart(2, "0")}
        </p>

        <p
          className={`mt-4 text-xs font-black uppercase tracking-[0.35em] ${theme.accent}`}
        >
          {chapter.eyebrow}
        </p>

        <blockquote className="mx-auto mt-6 max-w-md text-lg font-semibold italic leading-8 text-zinc-300">
          “{chapter.quote}”
        </blockquote>
      </div>
    </div>
  )
}

export default function StoryChapter({
  chapter,
  index = 0,
}: StoryChapterProps) {
  const theme =
    themeClasses[chapter.theme]

  const shouldReverse =
    chapter.reverse ?? index % 2 === 1

  return (
    <section
      id={chapter.id}
      className={`relative overflow-hidden border-y px-4 py-20 text-white sm:px-6 lg:px-8 lg:py-28 ${theme.section}`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${theme.glow}`}
      />

      <div
        className={`relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center lg:gap-16 ${
          shouldReverse
            ? "lg:[&>*:first-child]:order-2"
            : ""
        }`}
      >
        <ChapterVisual
          chapter={chapter}
        />

        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] ${theme.badge}`}
            >
              Chapter{" "}
              {String(
                chapter.chapterNumber,
              ).padStart(2, "0")}
            </span>

            <span
              className={`text-xs font-black uppercase tracking-[0.3em] ${theme.accent}`}
            >
              {chapter.eyebrow}
            </span>
          </div>

          <h2 className="mt-6 text-3xl font-black uppercase leading-tight tracking-tight text-white sm:text-4xl xl:text-5xl">
            {chapter.title}
          </h2>

          {chapter.subtitle ? (
            <p className="mt-5 text-lg font-medium leading-8 text-zinc-300">
              {chapter.subtitle}
            </p>
          ) : null}

          <div className="mt-7 space-y-5">
            {chapter.paragraphs.map(
              (
                paragraph: string,
                paragraphIndex: number,
              ) => (
                <p
                  key={`${chapter.id}-paragraph-${paragraphIndex}`}
                  className="text-base leading-8 text-zinc-400"
                >
                  {paragraph}
                </p>
              ),
            )}
          </div>

          <blockquote
            className={`mt-8 border-l-2 pl-6 text-lg font-semibold italic leading-8 text-zinc-200 ${theme.quoteBorder}`}
          >
            “{chapter.quote}”
          </blockquote>
        </div>
      </div>
    </section>
  )
}