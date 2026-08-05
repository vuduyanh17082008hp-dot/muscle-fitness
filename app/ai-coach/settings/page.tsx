import { redirect } from "next/navigation";

import { SettingsForm } from "@/features/ai-coach/settings-form";
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
  } = await supabase.auth.getUser();

  if (!user) {
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

  const settings = {
    ...DEFAULT_COACH_SETTINGS,
    ...(settingsResult.data || {}),
  };

  const usage = Array.isArray(usageResult.data)
    ? usageResult.data[0] ?? null
    : usageResult.data ?? null;

  return (
    <main className="mx-auto min-h-[calc(100vh-80px)] w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-400">
          Personal configuration
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight text-white">
          AI Coach Settings
        </h1>

        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Điều chỉnh cách AI trả lời, memory, reminder và
          weekly summary.
        </p>
      </div>

      <SettingsForm
        initialSettings={settings}
        usage={usage}
      />
    </main>
  );
}