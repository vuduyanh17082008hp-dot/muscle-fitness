import {
  buildCoachInstructions,
  DEFAULT_COACH_SETTINGS,
  runToolCall,
  type CoachSettings,
} from "@/lib/ai-coach/server";
import { completeCoachText } from "@/lib/ai-coach/transport";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getLocalParts(
  timeZone: string,
): {
  date: string;
  hour: number;
  weekday: number;
} {
  let safeZone = timeZone;

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone,
    }).format(new Date());
  } catch {
    safeZone = "UTC";
  }

  const now = new Date();

  const dateParts =
    new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

  const year = dateParts.find(
    (part) => part.type === "year",
  )?.value;

  const month = dateParts.find(
    (part) => part.type === "month",
  )?.value;

  const day = dateParts.find(
    (part) => part.type === "day",
  )?.value;

  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );

  const weekdayName =
    new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone,
      weekday: "short",
    }).format(now);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    date: `${year}-${month}-${day}`,
    hour,
    weekday: weekdayMap[weekdayName] ?? 0,
  };
}

async function ensureReminderThread(
  db: any,
  userId: string,
): Promise<string> {
  const existing = await db
    .from("ai_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("thread_type", "reminder")
    .limit(1)
    .maybeSingle();

  if (existing.data?.id) {
    return existing.data.id;
  }

  const created = await db
    .from("ai_threads")
    .insert({
      user_id: userId,
      title: "Coach Reminders",
      thread_type: "reminder",
      status: "active",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (created.error) {
    throw new Error(created.error.message);
  }

  return created.data.id;
}

async function deliverReminder(args: {
  db: any;
  userId: string;
  key: string;
  content: string;
}): Promise<boolean> {
  const { db, userId, key, content } = args;

  const duplicate = await db
    .from("ai_messages")
    .select("id")
    .eq("user_id", userId)
    .contains("metadata", {
      reminder_key: key,
    })
    .limit(1)
    .maybeSingle();

  if (duplicate.data?.id) {
    return false;
  }

  const threadId = await ensureReminderThread(
    db,
    userId,
  );

  const insertResult = await db
    .from("ai_messages")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role: "assistant",
      content,
      metadata: {
        reminder_key: key,
        generated_by: "ai-coach-cron",
      },
      model: "system-reminder",
    });

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }

  await db
    .from("ai_threads")
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  return true;
}

function sessionCompleted(
  session: Record<string, unknown>,
): boolean {
  const status = String(
    session.status ?? "",
  ).toLowerCase();

  return (
    status === "completed" ||
    Boolean(session.completed_at) ||
    session.is_completed === true
  );
}

export async function GET(request: Request) {
  const authorization =
    request.headers.get("authorization");

  if (
    !process.env.CRON_SECRET ||
    authorization !==
      `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", {
      status: 401,
    });
  }

  const db = createAdminClient() as any;
  let delivered = 0;
  const errors: string[] = [];

  /*
   * Deliver user-created reminders.
   */
  const dueReminders = await db
    .from("ai_workout_reminders")
    .select("*")
    .is("delivered_at", null)
    .is("cancelled_at", null)
    .lte("remind_at", new Date().toISOString())
    .order("remind_at", {
      ascending: true,
    })
    .limit(100);

  for (const reminder of dueReminders.data || []) {
    try {
      const wasDelivered = await deliverReminder({
        db,
        userId: reminder.user_id,
        key: `custom-reminder:${reminder.id}`,
        content: `## ${reminder.title}\n\n${reminder.message}`,
      });

      await db
        .from("ai_workout_reminders")
        .update({
          delivered_at: new Date().toISOString(),
        })
        .eq("id", reminder.id);

      if (wasDelivered) {
        delivered += 1;
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Custom reminder failed.",
      );
    }
  }

  /*
   * Check automatic reminders.
   * Limit each hourly invocation so it stays within
   * serverless execution limits.
   */
  const settingsResult = await db
    .from("ai_user_settings")
    .select("*")
    .limit(50);

  for (const rawSettings of
    settingsResult.data || []) {
    try {
      const settings: CoachSettings = {
        ...DEFAULT_COACH_SETTINGS,
        ...rawSettings,
      };

      const userId = rawSettings.user_id;
      const local = getLocalParts(
        settings.timezone,
      );

      if (
        local.hour !==
        settings.reminder_hour_local
      ) {
        continue;
      }

      const threadId =
        await ensureReminderThread(db, userId);

      const commonToolArgs = {
        db,
        userId,
        threadId,
        latestUserMessage:
          "Scheduled AI Coach reminder check.",
        settings,
      };

      if (
        settings.workout_reminders_enabled
      ) {
        const workoutTool = await runToolCall({
          ...commonToolArgs,
          call: {
            name: "get_today_workout",
            arguments: "{}",
            call_id: `cron-workout-${userId}-${local.date}`,
          },
        });

        const sessions = Array.isArray(
          workoutTool.result.today_sessions,
        )
          ? (workoutTool.result
              .today_sessions as Record<
              string,
              unknown
            >[])
          : [];

        const hasScheduledWorkout =
          sessions.length > 0;

        const hasCompletedWorkout =
          sessions.some(sessionCompleted);

        if (
          hasScheduledWorkout &&
          !hasCompletedWorkout
        ) {
          const wasDelivered =
            await deliverReminder({
              db,
              userId,
              key: `missed-workout:${local.date}`,
              content:
                "Bạn vẫn còn một workout đã lên lịch nhưng chưa được đánh dấu hoàn thành. Nếu bạn đã tập, hãy cập nhật session. Nếu chưa thể tập, hãy cho AI Coach biết để điều chỉnh recovery hoặc lịch tập phù hợp.",
            });

          if (wasDelivered) {
            delivered += 1;
          }
        }
      }

      if (
        settings.protein_reminders_enabled
      ) {
        const nutritionTool =
          await runToolCall({
            ...commonToolArgs,
            call: {
              name: "get_nutrition_summary",
              arguments: JSON.stringify({
                days: 1,
              }),
              call_id: `cron-protein-${userId}-${local.date}`,
            },
          });

        const days = Array.isArray(
          nutritionTool.result.days,
        )
          ? (nutritionTool.result.days as Array<{
              date?: string;
              protein?: number;
              protein_target?: number | null;
            }>)
          : [];

        const today = days.find(
          (day) => day.date === local.date,
        );

        const protein =
          typeof today?.protein === "number"
            ? today.protein
            : null;

        const target =
          typeof today?.protein_target ===
          "number"
            ? today.protein_target
            : null;

        if (
          protein !== null &&
          target !== null &&
          target > 0 &&
          protein < target * 0.8
        ) {
          const remainingProtein = Math.max(
            Math.round(target - protein),
            0,
          );

          const wasDelivered =
            await deliverReminder({
              db,
              userId,
              key: `low-protein:${local.date}`,
              content: `Protein hôm nay đang thấp hơn target. Bạn còn khoảng ${remainingProtein} g để đạt mục tiêu đã lưu. Ưu tiên nguồn protein phù hợp với allergies, excluded foods và calorie budget của bạn.`,
            });

          if (wasDelivered) {
            delivered += 1;
          }
        }
      }

      /*
       * Sunday weekly summary.
       */
      if (
        settings.weekly_summary_enabled &&
        local.weekday === 0
      ) {
        const summaryKey = `weekly-summary:${local.date}`;

        const duplicate = await db
          .from("ai_messages")
          .select("id")
          .eq("user_id", userId)
          .contains("metadata", {
            reminder_key: summaryKey,
          })
          .limit(1)
          .maybeSingle();

        if (!duplicate.data?.id) {
          const [profile, progress, nutrition] =
            await Promise.all([
              runToolCall({
                ...commonToolArgs,
                call: {
                  name: "get_client_profile",
                  arguments: "{}",
                  call_id: `weekly-profile-${userId}-${local.date}`,
                },
              }),
              runToolCall({
                ...commonToolArgs,
                call: {
                  name: "get_recent_progress",
                  arguments: JSON.stringify({
                    days: 7,
                  }),
                  call_id: `weekly-progress-${userId}-${local.date}`,
                },
              }),
              runToolCall({
                ...commonToolArgs,
                call: {
                  name: "get_nutrition_summary",
                  arguments: JSON.stringify({
                    days: 7,
                  }),
                  call_id: `weekly-nutrition-${userId}-${local.date}`,
                },
              }),
            ]);

          const weeklyPrompt = `
${buildCoachInstructions(settings)}

Create a weekly fitness progress summary.
Use only the supplied tool data.
Include:
1. workout adherence;
2. weight trend;
3. calories and protein adherence;
4. recovery;
5. two realistic priorities for next week.

Do not diagnose medical conditions.
Do not change the active plan.
Keep it practical and under 500 words.
`.trim();

          const weeklyPayload = JSON.stringify({
            profile: profile.result,
            progress: progress.result,
            nutrition: nutrition.result,
          });

          const weeklyContent = await completeCoachText({
            instructions: weeklyPrompt,
            input: weeklyPayload,
            maxTokens: 800,
          });

          const wasDelivered =
            await deliverReminder({
              db,
              userId,
              key: summaryKey,
              content:
                weeklyContent ||
                "Chưa đủ dữ liệu để tạo weekly summary.",
            });

          if (wasDelivered) {
            delivered += 1;
          }
        }
      }
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Automatic reminder failed.",
      );
    }
  }

  return Response.json({
    success: true,
    delivered,
    errors: errors.slice(0, 20),
  });
}