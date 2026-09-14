import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The one service-role Supabase client in this codebase — bypasses RLS
 * entirely. By design there is exactly one constructor for it (see
 * CLAUDE.md's Supabase-access section); extend its callers below rather
 * than adding a second one.
 *
 * Current sanctioned callers, both server-only / never client-bundled:
 *  - `scripts/ingest-dante-knowledge.ts` (via the
 *    `createKnowledgeBrainAdminClient` re-export in
 *    `lib/dante-core/knowledge-brain/supabase-admin.ts`) — writes
 *    `global`-visibility knowledge rows no per-user RLS policy allows.
 *  - `app/api/dante/cron/route.ts` — runs Dante's closed-loop cycle for
 *    users other than the calling session, which by definition can't go
 *    through a request-scoped, cookie-authenticated client. Gated by
 *    `DANTE_CRON_SECRET`, never invoked from client-bundled code.
 *
 * `SUPABASE_SECRET_KEY` must never be prefixed `NEXT_PUBLIC_`. The
 * `server-only` import above throws if this module is ever pulled into a
 * browser bundle.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) for the admin Supabase client.");
  }

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. Server-only privileged operations need the service-role key — " +
        "it must never be exposed with a NEXT_PUBLIC_ prefix.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
