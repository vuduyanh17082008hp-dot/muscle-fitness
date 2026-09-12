import type { Metadata } from "next";

import { PresentationStageClient } from "@/components/presentation/presentation-stage-client";

export const metadata: Metadata = {
  title: "Muscle Fitness — Presentation",
  description: "Deterministic, offline-safe demo sequence introducing Dante, SetVision, HawkerLens and the adaptive decision loop.",
};

/**
 * Presentation Mode (spec Part E §26).
 *
 * Deliberately public (no auth) and deliberately makes zero Supabase/
 * network calls anywhere in its render path — see
 * lib/presentation/demo-data.ts and docs/presentation.md
 * "Failure-safe strategy". A presenter should be able to load this
 * once, then run it with no internet connection at all.
 */
export default function PresentationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black">
      <PresentationStageClient />
    </main>
  );
}
