import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Training | Muscle Fitness",
};

/**
 * Historical standalone training UI. Canonical product: /dashboard/workouts.
 */
export default function TrainingPage() {
  redirect("/dashboard/workouts");
}
