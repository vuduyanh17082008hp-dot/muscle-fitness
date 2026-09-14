import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

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
 * Re-exports the one shared admin-client constructor
 * (`lib/supabase/admin.ts`) under its original name so existing
 * imports keep working — see that module for the full list of
 * sanctioned callers.
 */
export const createKnowledgeBrainAdminClient = createAdminClient;
