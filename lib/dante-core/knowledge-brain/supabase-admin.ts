import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for the Knowledge Brain ingestion
 * pipeline ONLY (scripts/ingest-dante-knowledge.ts). This is the one
 * place in the Knowledge Brain that intentionally bypasses RLS — it
 * needs to write 'global' rows, which no authenticated-user RLS
 * policy allows (see supabase/migrations/20260926090000_dante_
 * knowledge_brain.sql). Every other Knowledge Brain path (retrieval,
 * private-knowledge writes) uses the normal request-scoped,
 * cookie-authenticated client from lib/supabase/server.ts so RLS
 * still applies.
 *
 * SUPABASE_SECRET_KEY must never be prefixed NEXT_PUBLIC_ and must
 * never be imported from client components or app routes rendered to
 * the browser — the `server-only` import above throws if this module
 * is ever pulled into a browser bundle.
 */
export function createKnowledgeBrainAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim() ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url) {
    throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) for knowledge ingestion.");
  }

  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SECRET_KEY. The ingestion script needs the service-role key to write " +
        "'global' knowledge rows — it must never be exposed with a NEXT_PUBLIC_ prefix.",
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
