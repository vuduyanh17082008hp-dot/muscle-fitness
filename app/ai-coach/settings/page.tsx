import { redirect } from "next/navigation";

import { SettingsForm } from "@/features/ai-coach/settings-form";
import {
  asAiDatabaseClient,
  asAiRow,
  asAiRows,
} from "@/lib/ai/db";
import {
  DEFAULT_COACH_SETTINGS,
  type CoachSettings,
} from "@/lib/ai/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AiCoachSettingsPage() {
  const supabase = await createClient();
  const db = asAiDatabaseClient(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/ai-coach/settings");
  }

  const [settingsResult, usageResult] = await Promise.all([
    db
      .from("ai_user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    db.rpc("get_ai_usage_snapshot"),
  ]);

  const settings: CoachSettings = {
    ...DEFAULT_COACH_SETTINGS,
    ...(asAiRow(settingsResult.data) as Partial<CoachSettings> | null),
  };

  const usageRow =
    asAiRows(usageResult.data)[0] ?? asAiRow(usageResult.data);

  const usage = usageRow
    ? {
        plan_code:
          typeof usageRow.plan_code === "string"
            ? usageRow.plan_code
            : "free",
        messages_used:
          typeof usageRow.messages_used === "number"
            ? usageRow.messages_used
            : 0,
        daily_limit:
          typeof usageRow.daily_limit === "number"
            ? usageRow.daily_limit
            : 5,
        remaining:
          typeof usageRow.remaining === "number"
            ? usageRow.remaining
            : 5,
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

        <p className="mt-3 text-sm leading-6 text-zinc-500">
          Điều chỉnh cách AI trả lời, memory, reminder và weekly
          summary.
        </p>
      </div>

      <SettingsForm initialSettings={settings} usage={usage} />
    </main>
  );
}
