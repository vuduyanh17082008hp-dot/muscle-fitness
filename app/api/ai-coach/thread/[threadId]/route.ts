import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadIdSchema = z.string().uuid();

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      threadId: string;
    }>;
  },
) {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const { threadId } = await context.params;
  const parsedId = threadIdSchema.safeParse(threadId);

  if (!parsedId.success) {
    return Response.json(
      {
        error: "Invalid thread ID.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await db
    .from("ai_threads")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .eq("thread_type", "chat")
    .select("id");

  if (result.error) {
    return Response.json(
      {
        error: result.error.message,
      },
      {
        status: 500,
      },
    );
  }

  if (!result.data?.length) {
    return Response.json(
      {
        error: "Conversation not found.",
      },
      {
        status: 404,
      },
    );
  }

  return Response.json({
    success: true,
  });
}