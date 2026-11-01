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
          Choose the exercise, then upload one set. Pose estimation runs locally in your
          browser. Squats get rep count, phase timing, joint range and consistency;
          presses, pulls, curls, triceps extensions, lateral raises and hinges have
          experimental rep counting; exercises without a movement model can still be
          reviewed by hand. Every count can be corrected before you save, and your
          corrections are kept apart from what SetVision measured. Nothing is uploaded
          unless you choose to save.
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
