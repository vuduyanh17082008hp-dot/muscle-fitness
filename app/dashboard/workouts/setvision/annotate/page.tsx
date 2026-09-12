import type { Metadata } from "next";
import Link from "next/link";

import { ArrowLeft, ClipboardList } from "lucide-react";

import { GroundTruthAnnotator } from "@/components/setvision/ground-truth-annotator";

export const metadata: Metadata = {
  title: "SetVision Ground Truth | Muscle Fitness",
  description: "Internal tool for labeling video ground truth to benchmark SetVision.",
};

export default function SetVisionAnnotatePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <header className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-[#111111] to-black p-7 sm:p-9">
        <Link
          href="/dashboard/workouts/setvision"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 transition hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Back to SetVision
        </Link>

        <span className="mt-5 inline-grid size-14 place-items-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
          <ClipboardList className="size-6" />
        </span>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          Internal tool
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Ground-truth annotation
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Not part of the product experience for end users. This exists to build a real
          labeled dataset so SetVision&apos;s accuracy can eventually be measured
          honestly, instead of asserted.
        </p>
      </header>

      <GroundTruthAnnotator />
    </div>
  );
}
