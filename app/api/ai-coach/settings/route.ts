import {
  DEFAULT_COACH_SETTINGS,
} from "@/lib/ai-coach/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  preferred_tone: z.enum([
    "direct",
    "supportive",
    "analytical",
  ]),
  detail_level: z.enum([
    "concise",
    "balanced",
    "detailed",
  ]),
  language: z.enum(["vi", "en"]),
  timezone: z.string().trim().min(1).max(80),
  weekly_summary_enabled: z.boolean(),
  workout_reminders_enabled: z.boolean(),
  protein_reminders_enabled: z.boolean(),
  reminder_hour_local: z
    .number()
    .int()
    .min(0)
    .max(23),
  allow_conversation_memory: z.boolean(),
});

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone,
    }).format(new Date());

    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
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

  const usage = Array.isArray(usageResult.data)
    ? usageResult.data[0]
    : usageResult.data;

  return Response.json({
    settings: {
      ...DEFAULT_COACH_SETTINGS,
      ...(settingsResult.data || {}),
    },
    usage,
  });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const rawBody = await request.json();
  const parsed = settingsSchema.safeParse(rawBody);

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid settings.",
        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  if (!isValidTimeZone(parsed.data.timezone)) {
    return Response.json(
      {
        error: "Timezone không hợp lệ.",
      },
      {
        status: 400,
      },
    );
  }

  const result = await db
    .from("ai_user_settings")
    .upsert(
      {
        user_id: user.id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      },
    )
    .select("*")
    .single();

  if (result.error) {
    return Response.json(
      {
        error: result.error.message,
      },
      {
        status: 500,
      },
    );
  }

  return Response.json({
    settings: result.data,
  });
}