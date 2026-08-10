import {
  asAiDatabaseClient,
  asAiRows,
} from "@/lib/ai/db";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadIdSchema = z.string().uuid();

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      threadId: string;
    }>;
  },
) {
  const supabase = await createClient();
  const db = asAiDatabaseClient(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const parsedId = threadIdSchema.safeParse(threadId);

  if (!parsedId.success) {
    return Response.json({ error: "Invalid thread ID." }, { status: 400 });
  }

  const threadResult = await db
    .from("ai_threads")
    .select("id")
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .eq("thread_type", "chat")
    .maybeSingle();

  if (threadResult.error || !threadResult.data) {
    return Response.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  const messagesResult = await db
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", parsedId.data)
    .eq("user_id", user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true });

  if (messagesResult.error) {
    return Response.json(
      { error: messagesResult.error.message },
      { status: 500 },
    );
  }

  return Response.json({
    messages: asAiRows(messagesResult.data).map((message) => ({
      id: String(message.id ?? ""),
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? ""),
      createdAt: String(message.created_at ?? ""),
    })),
  });
}
