import { redirect } from "next/navigation";

import {
  SettingsForm,
  type AiCoachSettings,
  type AiCoachUsage,
} from "@/features/ai-coach/settings-form";
import {
  DEFAULT_COACH_SETTINGS,
} from "@/lib/ai-coach/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiCoachSettingsPage() {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(
      "/login?next=/ai-coach/settings",
    );
  }

  const [settingsResult, usageResult] =
    await Promise.all([
      db
        .from("ai_user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),

      db.rpc("get_ai_usage_snapshot"),
    ]);

  if (settingsResult.error) {
    console.error(
      "Unable to load AI settings:",
      settingsResult.error,
    );
  }

  if (usageResult.error) {
    console.error(
      "Unable to load AI usage:",
      usageResult.error,
    );
  }

  const settings: AiCoachSettings = {
    preferred_tone:
      settingsResult.data?.preferred_tone ??
      DEFAULT_COACH_SETTINGS.preferred_tone,

    detail_level:
      settingsResult.data?.detail_level ??
      DEFAULT_COACH_SETTINGS.detail_level,

    language:
      settingsResult.data?.language ??
      DEFAULT_COACH_SETTINGS.language,

    timezone:
      settingsResult.data?.timezone ??
      DEFAULT_COACH_SETTINGS.timezone,

    weekly_summary_enabled:
      settingsResult.data
        ?.weekly_summary_enabled ??
      DEFAULT_COACH_SETTINGS
        .weekly_summary_enabled,

    workout_reminders_enabled:
      settingsResult.data
        ?.workout_reminders_enabled ??
      DEFAULT_COACH_SETTINGS
        .workout_reminders_enabled,

    protein_reminders_enabled:
      settingsResult.data
        ?.protein_reminders_enabled ??
      DEFAULT_COACH_SETTINGS
        .protein_reminders_enabled,

    reminder_hour_local:
      settingsResult.data
        ?.reminder_hour_local ??
      DEFAULT_COACH_SETTINGS
        .reminder_hour_local,

    allow_conversation_memory:
      settingsResult.data
        ?.allow_conversation_memory ??
      DEFAULT_COACH_SETTINGS
        .allow_conversation_memory,
  };

  const rawUsage = Array.isArray(
    usageResult.data,
  )
    ? usageResult.data[0] ?? null
    : usageResult.data ?? null;

  const usage: AiCoachUsage | null = rawUsage
    ? {
        plan_code:
          rawUsage.plan_code ?? "free",

        messages_used:
          rawUsage.messages_used ?? 0,

        daily_limit:
          rawUsage.daily_limit ?? 10,

        remaining:
          rawUsage.remaining ?? 10,

        total_tokens:
          rawUsage.total_tokens ?? 0,
      }
    : null;

  return (
    <main className="mx-auto min-h-[calc(100vh-80px)] w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
          Personal configuration
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          AI Coach Settings
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Điều chỉnh cách AI trả lời, conversation
          memory, workout reminder và weekly progress
          summary.
        </p>
      </div>

      <SettingsForm
        initialSettings={settings}
        usage={usage}
      />
    </main>
  );
}