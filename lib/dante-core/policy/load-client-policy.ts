import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadDanteMemory } from "@/lib/dante-core/memory";
import { loadLearnedPatterns } from "@/lib/dante-core/memory-hierarchy/load-patterns";
import { buildClientPolicy } from "@/lib/dante-core/policy/build-client-policy";
import { DEFAULT_AUTONOMY_LEVEL, type AutonomyLevel, type ClientPolicy } from "@/lib/dante-core/policy/types";

function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return value === "guide" || value === "assist" || value === "autopilot";
}

async function loadAutonomyLevel(supabase: SupabaseClient, userId: string): Promise<AutonomyLevel> {
  const { data, error } = await supabase
    .from("dante_memory")
    .select("autonomy_level")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[DANTE POLICY] Unable to load autonomy level:", error.message);
    return DEFAULT_AUTONOMY_LEVEL;
  }

  const value = (data as { autonomy_level: string | null } | null)?.autonomy_level;
  return isAutonomyLevel(value) ? value : DEFAULT_AUTONOMY_LEVEL;
}

export async function loadClientPolicy(supabase: SupabaseClient, userId: string): Promise<ClientPolicy> {
  const [memory, patterns, autonomyLevel] = await Promise.all([
    loadDanteMemory(supabase, userId),
    loadLearnedPatterns(supabase, userId),
    loadAutonomyLevel(supabase, userId),
  ]);

  return buildClientPolicy(userId, patterns, memory, autonomyLevel);
}

export async function saveAutonomyLevel(
  supabase: SupabaseClient,
  userId: string,
  autonomyLevel: AutonomyLevel,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("dante_memory")
    .upsert({ user_id: userId, autonomy_level: autonomyLevel }, { onConflict: "user_id" });

  if (error) {
    console.error("[DANTE POLICY] Unable to save autonomy level:", error.message);
    return { ok: false, error: "Unable to save this setting. Please try again." };
  }

  return { ok: true };
}
