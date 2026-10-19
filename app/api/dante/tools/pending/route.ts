import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/tools/pending — the signed-in user's still-actionable Dante proposals (pending, not expired), newest first.
 * Read-only, user client (RLS: own rows only). Lets the chat restore a Confirm/Cancel card after navigation or refresh;
 * confirming still goes through /api/dante/tools/confirm, which re-checks status and expiry atomically.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("dante_tool_actions")
    .select("id, tool_name, summary, expires_at")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) return NextResponse.json({ error: "Couldn't load pending actions." }, { status: 500 });

  return NextResponse.json({
    pending: (data ?? []).map((row) => ({ actionId: row.id, toolName: row.tool_name, summary: row.summary, expiresAt: row.expires_at })),
  });
}
