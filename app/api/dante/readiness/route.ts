import { createClient } from "@/lib/supabase/server";
import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/readiness — Dante Core's readiness engine (spec
 * Part A §3), wired to the current user's own real data. Deterministic
 * only — no LLM involved in this route.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return Response.json(
        { ok: false, error: "Not authenticated." },
        { status: 401 },
      );
    }

    const { readiness } = await loadReadinessForUser(supabase, user.id);

    return Response.json({ ok: true, readiness });
  } catch (error) {
    console.error("[DANTE READINESS API ERROR]", error);

    return Response.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error."
            : "Could not compute readiness.",
      },
      { status: 500 },
    );
  }
}
