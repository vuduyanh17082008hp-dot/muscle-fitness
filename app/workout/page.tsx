import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Training | Muscle Fitness",
};

/** Legacy Smart Workouts prototype. Canonical product: /dashboard/workouts. */
export default function WorkoutPage() {
  redirect("/dashboard/workouts");
}
