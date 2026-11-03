import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft, Video } from "lucide-react";

import { VideoAnalyzerClient } from "@/components/setvision/video-analyzer-client";

export const metadata: Metadata = {
  title: "SetVision | Muscle Fitness",
  description:
    "Choose your exercise and upload one set. Squats get rep count, phase timing and consistency analysed locally in your browser; presses, pulls, curls and other movement families have experimental analysis; every exercise can be reviewed, corrected and saved.",
};

export default function SetVisionPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-7 sm:p-9">
        <Link
          href="/dashboard/workouts"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Back to Training
        </Link>

        <span className="mt-5 inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <Video className="size-6" />
        </span>

        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-amber-300">
          SetVision — Beta
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Video analysis of one set
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Pick any exercise, upload one set, analyze. Squats get tracked rep counting;
          presses, pulls, curls, extensions, raises and hinges get experimental tracking;
          every exercise can get an AI visual review — qualitative feedback with replay
          times, never invented reps or angles. Tracking runs in your browser; AI review
          sends a few stills to OpenAI and doesn&apos;t store them. Nothing is saved unless
          you choose to.
        </p>

        <Link
          href="/dashboard/workouts/setvision/squat"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white underline-offset-4 hover:underline"
          data-testid="setvision-squat-p0-link"
        >
          Experimental: review a bodyweight squat clip rep by rep →
        </Link>
      </header>

      <VideoAnalyzerClient />
    </div>
  );
}
