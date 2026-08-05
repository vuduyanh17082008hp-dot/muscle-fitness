import { redirect } from "next/navigation";

import { HistoryClient } from "@/features/ai-coach/history-client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiCoachHistoryPage() {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?next=/ai-coach/history",
    );
  }

  const result = await db
    .from("ai_threads")
    .select(
      "id, title, created_at, last_message_at",
    )
    .eq("user_id", user.id)
    .eq("thread_type", "chat")
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    });

  return (
    <main className="mx-auto min-h-[calc(100vh-80px)] w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
          Conversation archive
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          AI Coach History
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Mở lại hoặc xóa vĩnh viễn cuộc trò chuyện.
        </p>
      </div>

      <HistoryClient
        initialThreads={result.data || []}
      />
    </main>
  );
}