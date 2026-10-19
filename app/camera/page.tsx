import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Form Coach | Muscle Fitness",
};

/** Legacy public Form Coach. Canonical product: /dashboard/workouts/form-coach. */
export default function CameraPage() {
  redirect("/dashboard/workouts/form-coach");
}
