import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isDemoScenarioId, type DemoScenarioId } from "@/lib/demo/scenarios";

export type DemoSettings = {
  enabled: boolean;
  scenario: DemoScenarioId | null;
};

const DEFAULT_SETTINGS: DemoSettings = { enabled: false, scenario: null };

export async function loadDemoSettings(supabase: SupabaseClient, userId: string): Promise<DemoSettings> {
  const { data, error } = await supabase
    .from("user_demo_settings")
    .select("enabled, scenario")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[DEMO SETTINGS] load failed:", error.message);
    return DEFAULT_SETTINGS;
  }

  if (!data) return DEFAULT_SETTINGS;

  const scenario = typeof data.scenario === "string" && isDemoScenarioId(data.scenario) ? data.scenario : null;

  return { enabled: data.enabled === true && scenario !== null, scenario };
}

export async function saveDemoSettings(
  supabase: SupabaseClient,
  userId: string,
  input: DemoSettings,
): Promise<{ success: true } | { success: false; error: string }> {
  if (input.enabled && !input.scenario) {
    return { success: false, error: "Select a scenario to enable demo mode." };
  }

  const { error } = await supabase.from("user_demo_settings").upsert(
    {
      user_id: userId,
      enabled: input.enabled,
      scenario: input.scenario,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
