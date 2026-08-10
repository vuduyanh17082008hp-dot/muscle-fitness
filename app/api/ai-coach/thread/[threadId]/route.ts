import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const threadIdSchema = z.string().uuid();
const renameSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      threadId: string;
    }>;
  },
) {
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as {
    from: (table: string) => any;
  };

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const parsedId = threadIdSchema.safeParse(threadId);

  if (!parsedId.success) {
    return Response.json({ error: "Invalid thread ID." }, { status: 400 });
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedBody = renameSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return Response.json({ error: "Invalid title." }, { status: 400 });
  }

  const result = await db
    .from("ai_threads")
    .update({
      title: parsedBody.data.title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .eq("thread_type", "chat")
    .select("id, title")
    .maybeSingle();

  if (result.error) {
    return Response.json({ error: result.error.message }, { status: 500 });
  }

  if (!result.data) {
    return Response.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  return Response.json({ success: true, thread: result.data });
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      threadId: string;
    }>;
  },
) {
  const { supabase, user } = await requireUser();
  const db = supabase as unknown as {
    from: (table: string) => any;
  };

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await context.params;
  const parsedId = threadIdSchema.safeParse(threadId);

  if (!parsedId.success) {
    return Response.json({ error: "Invalid thread ID." }, { status: 400 });
  }

  const result = await db
    .from("ai_threads")
    .delete()
    .eq("id", parsedId.data)
    .eq("user_id", user.id)
    .eq("thread_type", "chat")
    .select("id");

  if (result.error) {
    return Response.json({ error: result.error.message }, { status: 500 });
  }

  if (!result.data?.length) {
    return Response.json(
      { error: "Conversation not found." },
      { status: 404 },
    );
  }

  return Response.json({ success: true });
}