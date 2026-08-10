import { redirect } from "next/navigation";

import {
  AiCoachClient,
  type AiCoachThreadSummary,
  type AiCoachUiMessage,
  type AiCoachUsage,
} from "@/features/ai-coach/ai-coach-client";
import { asAiDatabaseClient } from "@/lib/ai/db";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AiCoachPageProps = {
  searchParams: Promise<{
    thread?: string;
  }>;
};

type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type StoredThread = {
  id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
};

export default async function AiCoachPage({
  searchParams,
}: AiCoachPageProps) {
  const supabase = await createClient();
  const db = asAiDatabaseClient(supabase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login?next=/ai-coach");
  }

  const params = await searchParams;

  let selectedThreadId: string | null =
    typeof params.thread === "string" ? params.thread : null;

  const threadsResult = await db
    .from("ai_threads")
    .select("id, title, last_message_at, created_at")
    .eq("user_id", user.id)
    .eq("thread_type", "chat")
    .eq("status", "active")
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(40);

  const initialThreads: AiCoachThreadSummary[] = (
    (threadsResult.data ?? []) as StoredThread[]
  ).map((thread) => ({
    id: String(thread.id),
    title: String(thread.title || "New conversation"),
    lastMessageAt: thread.last_message_at
      ? String(thread.last_message_at)
      : String(thread.created_at),
  }));

  if (selectedThreadId) {
    const owned = initialThreads.some(
      (thread) => thread.id === selectedThreadId,
    );

    if (!owned) {
      const threadResult = await db
        .from("ai_threads")
        .select("id")
        .eq("id", selectedThreadId)
        .eq("user_id", user.id)
        .eq("thread_type", "chat")
        .maybeSingle();

      if (threadResult.error || !threadResult.data) {
        selectedThreadId = null;
      }
    }
  }

  if (!selectedThreadId && initialThreads[0]) {
    selectedThreadId = initialThreads[0].id;
  }

  let initialMessages: AiCoachUiMessage[] = [];

  if (selectedThreadId) {
    const messagesResult = await db
      .from("ai_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", selectedThreadId)
      .eq("user_id", user.id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true });

    if (messagesResult.error) {
      console.error(
        "Unable to load AI messages:",
        messagesResult.error,
      );
    } else {
      initialMessages = (
        (messagesResult.data ?? []) as StoredMessage[]
      ).map((message) => ({
        id: String(message.id),
        role: message.role,
        content: String(message.content ?? ""),
        createdAt: String(message.created_at),
      }));
    }
  }

  const usageResult = await db.rpc("get_ai_usage_snapshot");

  if (usageResult.error) {
    console.error("Unable to load AI usage:", usageResult.error);
  }

  const rawUsage = Array.isArray(usageResult.data)
    ? usageResult.data[0] ?? null
    : usageResult.data ?? null;

  const initialUsage: AiCoachUsage | null = rawUsage
    ? {
        plan_code:
          typeof rawUsage.plan_code === "string"
            ? rawUsage.plan_code
            : "free",
        messages_used:
          typeof rawUsage.messages_used === "number"
            ? rawUsage.messages_used
            : 0,
        daily_limit:
          typeof rawUsage.daily_limit === "number"
            ? rawUsage.daily_limit
            : 5,
        remaining:
          typeof rawUsage.remaining === "number"
            ? rawUsage.remaining
            : 5,
      }
    : null;

  return (
    <AiCoachClient
      initialThreadId={selectedThreadId}
      initialMessages={initialMessages}
      initialUsage={initialUsage}
      initialThreads={initialThreads}
    />
  );
}
