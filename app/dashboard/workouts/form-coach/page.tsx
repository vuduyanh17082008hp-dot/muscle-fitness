import type { Metadata } from "next"
import Link from "next/link"

import { ArrowLeft, ScanEye } from "lucide-react"

import { FormCoachCameraClient } from "@/components/form-coach/form-coach-camera-client"

export const metadata: Metadata = {
  title: "Form Coach | Muscle Fitness",
  description:
    "Camera-based squat, push-up and plank form feedback, analysed locally in your browser.",
}

export default function FormCoachPage() {
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
          <ScanEye className="size-6" />
        </span>

        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          Form Coach — Beta
        </p>

        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
          Camera-based form feedback
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Your webcam and on-device pose estimation track joint angles in
          real time to count reps and surface one prioritised cue at a
          time — for Squat, Push-up and Plank.
        </p>
      </header>

      <FormCoachCameraClient />
    </div>
  )
}
