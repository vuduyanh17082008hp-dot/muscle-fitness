import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { LiveSquatClient } from "@/components/form-coach/live/live-squat-client";

export const metadata: Metadata = {
  title: "Live rep counting (pilot) | Muscle Fitness",
  description: "Experimental pilot: count bodyweight squat movement cycles live from your camera, analysed on your device.",
};

export default function FormCoachLivePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <Link
        href="/dashboard/workouts/form-coach"
        className="inline-flex items-center gap-2 text-xs font-semibold text-mf-glass-text-muted transition hover:text-mf-glass-text"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to Form Coach
      </Link>
      <PageHeader
        glass
        eyebrow="Form Coach · Live pilot · Experimental"
        title="Live squat rep counting"
        description="Prop your camera side-on, stand in frame and squat. Movement cycles are counted live on this device, then you review and correct them. Counts are unvalidated estimates: they do not judge depth, technique or safety, and nothing is saved to your workouts."
      />
      <LiveSquatClient />
    </div>
  );
}
