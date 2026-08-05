import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/*
 * Legacy test-mode chat UI. Production coach lives at /ai-coach.
 */
export default function ChatbotPage() {
  redirect("/ai-coach");
}
