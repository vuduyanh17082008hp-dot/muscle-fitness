import type { Metadata } from "next";
import Link from "next/link";

import PoseCameraClient from "@/components/PoseCameraClient";

export const metadata: Metadata = {
  title: "AI Form Coach | Muscle Fitness",
  description:
    "Use your camera and AI pose detection to monitor exercise form and count repetitions.",
};

export default function CameraPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-neutral-400 transition hover:text-white"
        >
          <span aria-hidden="true">←</span>
          Return to dashboard
        </Link>

        <header className="mt-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-500">
            Muscle Fitness AI
          </p>

          <h1 className="mt-4 text-4xl font-black uppercase tracking-tight sm:text-5xl">
            AI Form Coach
          </h1>

          <p className="mt-5 leading-7 text-neutral-400">
            Position your full body inside the camera frame.
            The AI will analyse your keypoints, monitor joint
            angles, and count completed squat repetitions.
          </p>
        </header>

        <div className="mt-10">
          <PoseCameraClient />
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-bold text-white">
              1. Position the camera
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Make sure your hips, knees, and ankles remain
              visible.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-bold text-white">
              2. Control each repetition
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Lower under control and stand fully upright before
              starting the next rep.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="font-bold text-white">
              3. Review the result
            </p>

            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Use the counter and angle information to improve
              your technique.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}