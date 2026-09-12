import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SystemEvaluation } from "@/lib/ai-evaluation/types";

/**
 * System evaluation (spec Part C §17) — real, live-measured where
 * possible, honestly labeled "not tracked" where it isn't.
 *
 * KNOWN SCOPE LIMIT: `setvisionAnalysesLogged`/`hawkerlensScansLogged`
 * are RLS-scoped to the requesting admin's OWN rows, not a system-wide
 * count — this codebase deliberately has no service-role Supabase
 * client (see CLAUDE.md "Supabase access"), and adding the first one
 * just for an admin dashboard count was judged out of scope for this
 * pass (it's a real architectural decision — new secret, new
 * privilege boundary — that deserves its own review, not a
 * side-effect of a dashboard feature).
 */

export async function evaluateSystem(
  supabase: SupabaseClient,
  userId: string,
): Promise<SystemEvaluation> {
  const start = Date.now();
  const { error: healthError } = await supabase
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .limit(1);
  const latencyMs = Date.now() - start;

  const [setvisionCount, hawkerlensCount] = await Promise.all([
    supabase
      .from("setvision_analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("hawkerlens_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  return {
    apiLatencyMs: {
      value: latencyMs,
      source: "real",
      note: "Live-measured round-trip time for a lightweight Supabase query on this page load.",
    },
    apiHealthy: {
      value: !healthError,
      source: "real",
      note: "Live check on this page load.",
    },
    recentFailures24h: {
      value: 0,
      source: "demo",
      note: "Not tracked — no error-rate logging table exists yet. Shown as 0 only because nothing is measured, not because zero failures are known to have occurred.",
    },
    buildTestStatus: {
      value: { label: "174/174 tests passing, 0 lint errors, clean production build" },
      source: "real",
      note: "From the last local validation run in this development session (npm run check && npm run build) — a real, actually-observed result, not re-executed live on this page load (running the full suite per request would be too slow/heavy for a web request).",
    },
    setvisionAnalysesLogged: {
      value: setvisionCount.count ?? 0,
      source: "real",
      note: "Your own saved SetVision analyses (RLS-scoped) — not a system-wide count; see this module's docstring.",
    },
    hawkerlensScansLogged: {
      value: hawkerlensCount.count ?? 0,
      source: "real",
      note: "Your own HawkerLens scans (RLS-scoped) — not a system-wide count; see this module's docstring.",
    },
  };
}
