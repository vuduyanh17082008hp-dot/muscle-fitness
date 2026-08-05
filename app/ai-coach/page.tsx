import { redirect } from "next/navigation";

import { AiCoachClient } from "@/features/ai-coach/ai-coach-client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<{
    thread?: string;
  }>;
};

export default async function AiCoachPage({
  searchParams,
}: PageProps) {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/ai-coach");
  }

  const query = await searchParams;
  let selectedThreadId = query.thread ?? null;

  if (selectedThreadId) {
    const selectedResult = await db
      .from("ai_threads")
      .select("id")
      .eq("id", selectedThreadId)
      .eq("user_id", user.id)
      .eq("thread_type", "chat")
      .maybeSingle();

    if (!selectedResult.data) {
      selectedThreadId = null;
    }
  }

  if (!selectedThreadId) {
    const latestResult = await db
      .from("ai_threads")
      .select("id")
      .eq("user_id", user.id)
      .eq("thread_type", "chat")
      .eq("status", "active")
      .order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

    selectedThreadId =
      latestResult.data?.id ?? null;
  }

  let messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }> = [];

  if (selectedThreadId) {
    const messagesResult = await db
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", selectedThreadId)
      .eq("user_id", user.id)
      .in("role", ["user", "assistant"])
      .order("created_at", {
        ascending: true,
      });

    messages = (messagesResult.data || []).map(
      (message: {
        id: string;
        role: "user" | "assistant";
        content: string;
        created_at: string;
      }) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      }),
    );
  }

  const usageResult = await db.rpc(
    "get_ai_usage_snapshot",
  );

  const usage = Array.isArray(usageResult.data)
    ? usageResult.data[0] ?? null
    : usageResult.data ?? null;

  return (
    <AiCoachClient
      initialThreadId={selectedThreadId}
      initialMessages={messages}
      initialUsage={usage}
    />
  );
}