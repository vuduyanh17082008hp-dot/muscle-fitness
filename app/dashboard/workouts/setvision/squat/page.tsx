import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { SquatP0Client } from "@/components/setvision/squat-p0/squat-p0-client";

export const metadata: Metadata = {
  title: "SetVision squat review | Muscle Fitness",
  description: "Experimental: review bodyweight squat movement cycles in a side-view clip, analysed on your device.",
};

export default function SetVisionSquatPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <Link
        href="/dashboard/workouts/setvision"
        className="inline-flex items-center gap-2 text-xs font-semibold text-mf-glass-text-muted transition hover:text-mf-glass-text"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to SetVision
      </Link>
      <PageHeader
        glass
        eyebrow="SetVision · Experimental"
        title="Squat clip review"
        description="Upload a short side-on clip of bodyweight squats. Each detected movement cycle links to its moment in the video so you can check it yourself. Counts are unvalidated estimates: they do not judge depth, technique or safety, and nothing is saved to your workouts."
      />
      <Link
        href="/dashboard/workouts/form-coach/live"
        className="inline-flex items-center gap-2 text-sm font-semibold text-mf-glass-text underline-offset-4 hover:underline"
        data-testid="sv-live-link"
      >
        Prefer to count live from your camera? Try the Form Coach pilot →
      </Link>
      <SquatP0Client />
    </div>
  );
}
