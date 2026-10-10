import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const SESSION_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!SESSION_ID_RE.test(id)) {
    return NextResponse.json(
      { error: "Invalid session id." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("workout_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[SESSIONS] load failed:", error.code ?? "unknown");
    return NextResponse.json(
      { error: "Unable to load workout session." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ session: data });
}
