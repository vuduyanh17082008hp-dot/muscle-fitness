import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft, Video } from "lucide-react";

import { VideoAnalyzerClient } from "@/components/setvision/video-analyzer-client";

export const metadata: Metadata = {
  title: "SetVision | Muscle Fitness",
  description:
    "Upload a set of Bench Press, Squat or Deadlift and get rep count, ROM, tempo, velocity and technique consistency — analysed locally in your browser.",
};

export default function SetVisionPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-9">
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

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          SetVision — Beta
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Video analysis for Bench Press, Squat &amp; Deadlift
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Upload a video of one set. Pose estimation runs locally in your browser to
          count reps, and estimate range of motion, tempo, bar-path consistency and
          velocity loss. Velocity is a normalized, per-lifter speed measure unless you
          note otherwise — never presented as true m/s without calibration. Nothing is
          uploaded unless you choose to save.
        </p>
      </header>

      <VideoAnalyzerClient />

      <p className="text-center text-xs text-zinc-700">
        <Link href="/dashboard/workouts/setvision/annotate" className="hover:text-zinc-500">
          Internal: ground-truth annotation tool
        </Link>
      </p>
    </div>
  );
}
