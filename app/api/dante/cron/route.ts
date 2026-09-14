import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { runScheduledDanteCycles } from "@/lib/dante-core/proactive/run-scheduled-cycles";
import { PROACTIVE_CYCLE_TRIGGERS, type ProactiveCycleTrigger } from "@/lib/dante-core/proactive/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/dante/cron — the proactive/heartbeat cycle entry point
 * (mission Part 12). NOT invoked by any browser or authenticated user
 * session — it is meant to be hit by an external scheduler (Vercel Cron,
 * a Supabase Edge Function on a schedule, GitHub Actions cron, etc.)
 * configured with a bearer secret. Deliberately fails closed: if
 * `DANTE_CRON_SECRET` isn't set in the environment, every request is
 * rejected rather than the endpoint silently running unauthenticated.
 *
 * This is NOT wired into any deployment scheduler by this pass — no
 * `vercel.json` cron entry was added, and nothing calls this URL today.
 * See docs/implementation-progress.md for the exact manual step
 * (setting `DANTE_CRON_SECRET` + configuring an external scheduler)
 * required before this does anything in production.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.DANTE_CRON_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

function parseTrigger(value: unknown): ProactiveCycleTrigger {
  if (typeof value === "string" && (PROACTIVE_CYCLE_TRIGGERS as readonly string[]).includes(value)) {
    return value as ProactiveCycleTrigger;
  }
  return "manual";
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => ({}));
  const trigger = parseTrigger((body as { trigger?: unknown } | null)?.trigger);

  try {
    const adminClient = createAdminClient();
    const summary = await runScheduledDanteCycles(adminClient, trigger);

    console.log("[DANTE PROACTIVE CYCLE]", {
      trigger: summary.trigger,
      ranAt: summary.ranAt,
      userCount: summary.userCount,
      succeeded: summary.succeeded,
      failed: summary.failed,
    });

    // Aggregate counts only — this endpoint is secret-gated, but its
    // response has no reason to double as a way to enumerate user IDs
    // or individual decisions if the secret were ever compromised.
    return NextResponse.json({
      ok: true,
      trigger: summary.trigger,
      ranAt: summary.ranAt,
      userCount: summary.userCount,
      succeeded: summary.succeeded,
      failed: summary.failed,
    });
  } catch (error) {
    console.error("[DANTE PROACTIVE CYCLE ERROR]", error);

    return NextResponse.json(
      { ok: false, error: "Could not run the scheduled Dante cycle." },
      { status: 500 },
    );
  }
}
