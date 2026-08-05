import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  threadId: z.string().uuid(),
  messageId: z.string().uuid(),
  rating: z.union([
    z.literal(1),
    z.literal(-1),
  ]),
  comment: z
    .string()
    .trim()
    .max(1_000)
    .nullable()
    .optional(),
});

export async function POST(request: Request) {
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

  const rawBody = await request.json();
  const parsed = feedbackSchema.safeParse(rawBody);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid feedback.",
      },
      {
        status: 400,
      },
    );
  }

  const messageResult = await db
    .from("ai_messages")
    .select("id")
    .eq("id", parsed.data.messageId)
    .eq("thread_id", parsed.data.threadId)
    .eq("user_id", user.id)
    .eq("role", "assistant")
    .maybeSingle();

  if (
    messageResult.error ||
    !messageResult.data
  ) {
    return Response.json(
      {
        error: "Assistant message not found.",
      },
      {
        status: 404,
      },
    );
  }

  const result = await db.from("ai_feedback").upsert(
    {
      user_id: user.id,
      thread_id: parsed.data.threadId,
      message_id: parsed.data.messageId,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
    },
    {
      onConflict: "user_id,message_id",
    },
  );

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

  return Response.json({
    success: true,
  });
}