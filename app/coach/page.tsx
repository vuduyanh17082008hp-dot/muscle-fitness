import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dante | Muscle Fitness",
};

/**
 * Authenticated Dante entry used to live at `/coach` as a marketing
 * stub wrapped in a legacy shell. The real product surface is
 * `/dashboard/ai-coach` — keep this path as a stable redirect so old
 * bookmarks and nav links never land on the stub.
 */
export default function CoachPage() {
  redirect("/dashboard/ai-coach");
}
