import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dante | Muscle Fitness",
};

/**
 * Legacy public Dante shell. Canonical product: /dashboard/ai-coach.
 * Logged-out visitors are sent to login by the existing dashboard proxy.
 */
export default function ChatbotPage() {
  redirect("/dashboard/ai-coach");
}
