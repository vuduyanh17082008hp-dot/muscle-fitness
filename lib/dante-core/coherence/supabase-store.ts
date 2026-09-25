import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  encodeState,
  type CoherenceCommitResult,
  type CoherenceLoadResult,
  type CoherenceStateStore,
} from "@/lib/dante-core/coherence/persistence";
import { restoreVersionedState } from "@/lib/dante-core/coherence/reducer";
import { COHERENCE_STATE_SCHEMA_VERSION } from "@/lib/dante-core/coherence/types";

const TABLE = "dante_coherence_state";
const UNIQUE_VIOLATION = "23505";

type StateRow = {
  state: unknown;
  state_version: number;
  schema_version: number;
};

/**
 * Phase 2 state store backed by `public.dante_coherence_state` (one row per user, RLS-scoped to the owner).
 * Writes are compare-and-swap on `state_version`, evaluated atomically inside a single statement.
 */
export function createSupabaseCoherenceStore(supabase: SupabaseClient): CoherenceStateStore {
  return {
    async load(userId): Promise<CoherenceLoadResult> {
      const { data, error } = await supabase
        .from(TABLE)
        .select("state, state_version, schema_version")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) return { status: "error", detail: error.message };
      if (!data) return { status: "empty" };
      const row = data as StateRow;
      if (row.schema_version > COHERENCE_STATE_SCHEMA_VERSION) {
        // Written by a newer deploy. Do not read it wrongly and do not overwrite it.
        return { status: "error", detail: `newer_schema:${row.schema_version}` };
      }
      const state = restoreVersionedState(row.state);
      return state
        ? { status: "found", state, rowVersion: row.state_version }
        : { status: "corrupt", rowVersion: row.state_version };
    },

    async commit(userId, next, expectedVersion): Promise<CoherenceCommitResult> {
      const payload = {
        state_version: next.version,
        schema_version: COHERENCE_STATE_SCHEMA_VERSION,
        state: encodeState(next),
        updated_at: new Date().toISOString(),
      };

      if (expectedVersion === null) {
        const { error } = await supabase.from(TABLE).insert({ user_id: userId, ...payload });
        if (!error) return { ok: true };
        return error.code === UNIQUE_VIOLATION
          ? { ok: false, reason: "conflict" }
          : { ok: false, reason: "error", detail: error.message };
      }

      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq("user_id", userId)
        .eq("state_version", expectedVersion)
        .select("state_version");
      if (error) return { ok: false, reason: "error", detail: error.message };
      return Array.isArray(data) && data.length === 1 ? { ok: true } : { ok: false, reason: "conflict" };
    },
  };
}
