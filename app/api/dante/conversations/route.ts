import { NextResponse } from "next/server";

import { listDanteThreads, loadDanteThread } from "@/lib/dante-core/conversation-store";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/conversations — the signed-in user's Dante conversations, most recent first.
 * GET /api/dante/conversations?id=<threadId> — that conversation's messages in order, with each proposal's
 * authoritative status read from dante_tool_actions. Read-only, user client (RLS: own rows only); hydration never
 * re-runs a tool call. An unknown or foreign id is a 404 either way.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  try {
    if (!id) return NextResponse.json({ threads: await listDanteThreads(supabase, user.id) });
    const messages = await loadDanteThread(supabase, user.id, id);
    if (!messages) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    return NextResponse.json({ threadId: id, messages });
  } catch (error) {
    console.error("[DANTE HISTORY] read failed", error);
    return NextResponse.json({ error: "Couldn't load conversation history." }, { status: 500 });
  }
}
