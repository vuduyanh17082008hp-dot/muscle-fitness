// components/home/StoryPreview.tsx

import Link from "next/link";
import {
  ArrowRight,
  Quote,
} from "lucide-react";

export default function StoryPreview() {
  return (
    <section
      id="my-story"
      className="border-y border-white/[0.07] bg-zinc-950"
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20 lg:px-12"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_50%_25%,rgba(127,29,29,0.35),transparent_38%),linear-gradient(to_bottom_right,#27272a,#050505)]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-6xl font-black tracking-[-0.08em] text-white sm:text-8xl">
                88
                <span className="mx-3 text-red-600">→</span>
                68
              </p>

              <p className="mt-3 text-xs font-black tracking-[0.35em] text-zinc-500">
                KILOGRAMS
              </p>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-7">
            <p className="text-sm font-semibold text-zinc-300">
              Eight months changed my body.
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              The struggle changed everything else.
            </p>
          </div>
        </div>

        <div>
          <p className="text-xs font-black tracking-[0.35em] text-red-500">
            MY STORY
          </p>

          <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-[-0.045em] text-white sm:text-6xl">
            I Did Not Begin
            <span className="block text-zinc-500">As the Person You See</span>
          </h2>

          <p className="mt-7 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg">
            Before Muscle Fitness became a platform, it was a promise I made
            to myself when I was overweight, insecure and tired of hiding from
            my own life.
          </p>

          <blockquote className="mt-8 border-l-2 border-red-800 pl-6">
            <Quote
              aria-hidden="true"
              className="mb-4 size-5 text-white/25"
            />

            <p className="text-xl font-semibold italic leading-8 text-zinc-200">
              “I do not hate the person I used to be. He was the one brave
              enough to begin.”
            </p>
          </blockquote>

          <Link
            href="/story"
            className="mt-9 inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-white px-7 text-sm font-black uppercase tracking-[0.14em] text-black transition hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-4 focus-visible:ring-offset-zinc-950"
          >
            Read My Full Story
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}