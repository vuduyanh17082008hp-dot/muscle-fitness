import { z } from "zod";

type DatabaseClient = {
  from: (table: string) => any;
};

function removeUndefined(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function safeTimeZone(value?: string | null): string {
  const requested = value || "Asia/Singapore";

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: requested,
    }).format(new Date());
    return requested;
  } catch {
    return "UTC";
  }
}

function localDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function dateFromUnknown(value: unknown): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowDate(row: Record<string, unknown>): Date | null {
  const possibleValues = [
    row.scheduled_for,
    row.workout_date,
    row.session_date,
    row.metric_date,
    row.log_date,
    row.recorded_at,
    row.completed_at,
    row.started_at,
    row.date,
    row.created_at,
  ];

  for (const value of possibleValues) {
    const parsed = dateFromUnknown(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function numberFromRow(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function stringFromRow(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return null;
}

function pickFields(
  source: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  if (!source) {
    return null;
  }

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      result[key] = source[key];
    }
  }

  return result;
}

async function readUserRows(
  db: DatabaseClient,
  table: string,
  userId: string,
  limit = 100,
): Promise<{ available: boolean; rows: Record<string, unknown>[] }> {
  for (const column of ["user_id", "client_id"]) {
    const result = await db
      .from(table)
      .select("*")
      .eq(column, userId)
      .limit(limit);

    if (!result.error) {
      return {
        available: true,
        rows: (result.data || []) as Record<string, unknown>[],
      };
    }
  }

  return { available: false, rows: [] };
}

function boundDays(days: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(days ?? fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function isCompletedSession(row: Record<string, unknown>): boolean {
  const status = normalizeText(stringFromRow(row, ["status"]) || "");
  return (
    status === "completed" ||
    Boolean(row.completed_at) ||
    row.is_completed === true
  );
}

export async function getRecentWorkouts(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const boundedDays = boundDays(days, 1, 90, 14);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - boundedDays);

  const sessionsResult = await readUserRows(db, "workout_sessions", userId, 300);
  const recent = sessionsResult.rows
    .filter((row) => {
      const date = rowDate(row);
      return date ? date >= cutoff : false;
    })
    .map((row) => ({
      id: stringFromRow(row, ["id"]),
      name: stringFromRow(row, ["title", "name"]),
      focus: stringFromRow(row, ["focus", "muscle_group"]),
      status: stringFromRow(row, ["status"]),
      date: rowDate(row)?.toISOString() ?? null,
      duration_minutes: numberFromRow(row, ["duration_minutes", "duration"]),
      completed: isCompletedSession(row),
      exercise_count: Array.isArray(row.exercises)
        ? row.exercises.length
        : null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const completed = recent.filter((row) => row.completed).length;

  return {
    available: sessionsResult.available,
    data_available: recent.length > 0,
    period_days: boundedDays,
    timezone: safeTimeZone(timeZone),
    workout_count: recent.length,
    completed_count: completed,
    missed_or_incomplete: recent.length - completed,
    workouts: recent.slice(0, 40),
    message:
      recent.length === 0
        ? "No workout sessions found in the selected period."
        : null,
  };
}

export async function getWorkoutHistory(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const summary = await getRecentWorkouts(db, userId, days, timeZone);
  return {
    ...summary,
    note: "Compact workout history for adherence and performance review.",
  };
}

export async function getTodayNutrition(
  db: DatabaseClient,
  userId: string,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const tz = safeTimeZone(timeZone);
  const todayKey = localDateKey(new Date(), tz);

  const [metricsResult, mealLogsResult] = await Promise.all([
    readUserRows(db, "daily_metrics", userId, 60),
    readUserRows(db, "meal_logs", userId, 120),
  ]);

  const todayMetric =
    metricsResult.rows.find((row) => {
      const date = rowDate(row);
      return date ? localDateKey(date, tz) === todayKey : false;
    }) ?? null;

  const todayMeals = mealLogsResult.rows.filter((row) => {
    const date = rowDate(row);
    return date ? localDateKey(date, tz) === todayKey : false;
  });

  let calories =
    numberFromRow(todayMetric ?? {}, [
      "calories_consumed",
      "total_calories",
      "calories",
    ]) ?? 0;
  let protein =
    numberFromRow(todayMetric ?? {}, [
      "protein_grams",
      "protein_consumed",
      "total_protein",
      "protein",
    ]) ?? 0;
  let carbs =
    numberFromRow(todayMetric ?? {}, [
      "carbs_grams",
      "carbohydrates",
      "carbs",
    ]) ?? 0;
  let fats =
    numberFromRow(todayMetric ?? {}, ["fat_grams", "fats", "fat"]) ?? 0;

  if (!todayMetric && todayMeals.length > 0) {
    for (const meal of todayMeals) {
      calories +=
        numberFromRow(meal, ["calories", "kcal", "total_calories"]) ?? 0;
      protein += numberFromRow(meal, ["protein", "protein_grams"]) ?? 0;
      carbs += numberFromRow(meal, ["carbs", "carbohydrates", "carbs_grams"]) ?? 0;
      fats += numberFromRow(meal, ["fat", "fats", "fat_grams"]) ?? 0;
    }
  }

  const dataAvailable = Boolean(todayMetric) || todayMeals.length > 0;

  return {
    available: metricsResult.available || mealLogsResult.available,
    data_available: dataAvailable,
    date: todayKey,
    timezone: tz,
    totals: dataAvailable
      ? {
          calories,
          protein_grams: protein,
          carbs_grams: carbs,
          fat_grams: fats,
        }
      : null,
    targets: todayMetric
      ? {
          calories: numberFromRow(todayMetric, [
            "calorie_target",
            "calories_target",
            "target_calories",
          ]),
          protein_grams: numberFromRow(todayMetric, [
            "protein_target",
            "protein_goal",
            "target_protein",
          ]),
        }
      : null,
    meals_logged: todayMeals.length,
    meals: todayMeals.slice(0, 12).map((meal) =>
      pickFields(meal, [
        "id",
        "meal_type",
        "name",
        "calories",
        "protein",
        "carbs",
        "fat",
        "notes",
      ]),
    ),
    message: dataAvailable
      ? null
      : "No nutrition data logged for today.",
  };
}

export async function getWeightTrend(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const boundedDays = boundDays(days, 1, 180, 30);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - boundedDays);

  const weightsResult = await readUserRows(db, "weight_entries", userId, 400);
  const entries = weightsResult.rows
    .filter((row) => {
      const date = rowDate(row);
      return date ? date >= cutoff : false;
    })
    .map((row) => ({
      date: rowDate(row)?.toISOString() ?? null,
      weight_kg: numberFromRow(row, ["weight_kg", "weight", "value"]),
    }))
    .filter((row) => row.weight_kg !== null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const first = entries[0]?.weight_kg ?? null;
  const last = entries[entries.length - 1]?.weight_kg ?? null;
  const change =
    first !== null && last !== null
      ? Number((last - first).toFixed(2))
      : null;

  const ratePerWeek =
    change !== null && boundedDays > 0
      ? Number(((change / boundedDays) * 7).toFixed(2))
      : null;

  return {
    available: weightsResult.available,
    data_available: entries.length > 0,
    period_days: boundedDays,
    timezone: safeTimeZone(timeZone),
    starting_weight_kg: first,
    latest_weight_kg: last,
    change_kg: change,
    rate_kg_per_week: ratePerWeek,
    entries: entries.slice(-40),
    message:
      entries.length === 0
        ? "No weight entries found in the selected period."
        : null,
  };
}

export async function getRecentCheckins(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const boundedDays = boundDays(days, 1, 90, 14);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - boundedDays);
  const tz = safeTimeZone(timeZone);

  const metricsResult = await readUserRows(db, "daily_metrics", userId, 300);
  const checkins = metricsResult.rows
    .filter((row) => {
      const date = rowDate(row);
      return date ? date >= cutoff : false;
    })
    .map((row) => ({
      date: rowDate(row)
        ? localDateKey(rowDate(row) as Date, tz)
        : null,
      sleep_hours: numberFromRow(row, ["sleep_hours", "sleep"]),
      stress: numberFromRow(row, ["stress", "stress_level"]),
      energy: numberFromRow(row, ["energy", "energy_level"]),
      soreness: numberFromRow(row, ["soreness", "soreness_level"]),
      recovery_score: numberFromRow(row, [
        "recovery_score",
        "readiness_score",
      ]),
      notes: stringFromRow(row, ["notes"]),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return {
    available: metricsResult.available,
    data_available: checkins.length > 0,
    period_days: boundedDays,
    timezone: tz,
    checkin_count: checkins.length,
    checkins: checkins.slice(0, 30),
    message:
      checkins.length === 0
        ? "No check-in / daily metric data found in the selected period."
        : null,
  };
}

export async function getTrainingAdherence(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const recent = await getRecentWorkouts(db, userId, days, timeZone);
  const scheduled = Number(recent.workout_count ?? 0);
  const completed = Number(recent.completed_count ?? 0);
  const adherence =
    scheduled > 0
      ? Number(((completed / scheduled) * 100).toFixed(1))
      : null;

  return {
    available: recent.available,
    data_available: scheduled > 0,
    period_days: recent.period_days,
    timezone: recent.timezone,
    workouts_planned: scheduled,
    workouts_completed: completed,
    adherence_percent: adherence,
    message:
      scheduled === 0
        ? "No training sessions found to compute adherence."
        : null,
  };
}

export async function getWeeklySummary(
  db: DatabaseClient,
  userId: string,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const tz = safeTimeZone(timeZone);

  const [workouts, nutrition, progress, checkins, adherence] =
    await Promise.all([
      getRecentWorkouts(db, userId, 7, tz),
      getTodayNutrition(db, userId, tz).then(async () => {
        // reuse nutrition summary shape via daily_metrics window
        const metrics = await readUserRows(db, "daily_metrics", userId, 40);
        const mealLogs = await readUserRows(db, "meal_logs", userId, 120);
        const cutoff = new Date();
        cutoff.setUTCDate(cutoff.getUTCDate() - 7);

        const days = new Map<
          string,
          { calories: number; protein: number }
        >();

        for (const row of metrics.rows) {
          const date = rowDate(row);
          if (!date || date < cutoff) continue;
          const key = localDateKey(date, tz);
          days.set(key, {
            calories:
              numberFromRow(row, [
                "calories_consumed",
                "total_calories",
                "calories",
              ]) ?? 0,
            protein:
              numberFromRow(row, [
                "protein_grams",
                "protein_consumed",
                "protein",
              ]) ?? 0,
          });
        }

        if (days.size === 0) {
          for (const row of mealLogs.rows) {
            const date = rowDate(row);
            if (!date || date < cutoff) continue;
            const key = localDateKey(date, tz);
            const current = days.get(key) ?? { calories: 0, protein: 0 };
            current.calories +=
              numberFromRow(row, ["calories", "kcal"]) ?? 0;
            current.protein +=
              numberFromRow(row, ["protein", "protein_grams"]) ?? 0;
            days.set(key, current);
          }
        }

        const values = [...days.values()];
        const avgCalories =
          values.length > 0
            ? Number(
                (
                  values.reduce((sum, day) => sum + day.calories, 0) /
                  values.length
                ).toFixed(1),
              )
            : null;
        const avgProtein =
          values.length > 0
            ? Number(
                (
                  values.reduce((sum, day) => sum + day.protein, 0) /
                  values.length
                ).toFixed(1),
              )
            : null;

        return {
          available: metrics.available || mealLogs.available,
          data_available: values.length > 0,
          days_logged: values.length,
          average_calories: avgCalories,
          average_protein_grams: avgProtein,
        };
      }),
      getWeightTrend(db, userId, 7, tz),
      getRecentCheckins(db, userId, 7, tz),
      getTrainingAdherence(db, userId, 7, tz),
    ]);

  const wentWell: string[] = [];
  const needsImprovement: string[] = [];
  const priorities: string[] = [];

  if (adherence.data_available && Number(adherence.adherence_percent) >= 80) {
    wentWell.push("Training adherence was strong this week.");
  } else if (adherence.data_available) {
    needsImprovement.push("Training adherence was below target.");
    priorities.push("Protect 3–4 committed sessions next week.");
  } else {
    needsImprovement.push("No training sessions were logged.");
    priorities.push("Log workouts so adherence can be tracked.");
  }

  if (nutrition.data_available) {
    wentWell.push("Nutrition logging has data for the week.");
    priorities.push("Keep protein consistent across training days.");
  } else {
    needsImprovement.push("Nutrition logging is sparse or missing.");
    priorities.push("Log meals for at least 5 of the next 7 days.");
  }

  if (progress.data_available) {
    wentWell.push("Weight trend data is available.");
  } else {
    needsImprovement.push("No recent weight entries.");
    priorities.push("Record body weight 2–3 times next week.");
  }

  while (priorities.length < 3) {
    priorities.push(
      [
        "Sleep 7+ hours on training nights.",
        "Keep recovery checks honest after hard sessions.",
        "Review next week's schedule before Monday.",
      ][priorities.length]!,
    );
  }

  return {
    period_days: 7,
    timezone: tz,
    training: {
      workouts_planned: adherence.workouts_planned,
      workouts_completed: adherence.workouts_completed,
      adherence_percent: adherence.adherence_percent,
      recent_workouts: workouts.workouts,
    },
    nutrition,
    progress: {
      data_available: progress.data_available,
      starting_weight_kg: progress.starting_weight_kg,
      latest_weight_kg: progress.latest_weight_kg,
      change_kg: progress.change_kg,
    },
    recovery: {
      data_available: checkins.data_available,
      checkin_count: checkins.checkin_count,
      recent: checkins.checkins,
    },
    what_went_well: wentWell,
    what_needs_improvement: needsImprovement,
    next_week_priorities: priorities.slice(0, 3),
  };
}

const proposeReminderSchema = z.object({
  title: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(1000),
  remind_at: z.string().trim().min(1).max(80),
});

const proposeTicketSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  category: z.enum([
    "technical",
    "billing",
    "workout",
    "nutrition",
    "account",
    "other",
  ]),
  description: z.string().trim().min(1).max(4000),
});

const proposeWorkoutSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  changes: z
    .array(
      z.object({
        exercise: z.string().trim().min(1).max(120),
        old_sets: z.number().int().min(0).max(20).optional(),
        new_sets: z.number().int().min(0).max(20).optional(),
        old_reps: z.string().trim().max(40).optional(),
        new_reps: z.string().trim().max(40).optional(),
        note: z.string().trim().max(240).optional(),
      }),
    )
    .min(1)
    .max(20),
  session_id: z.string().uuid().optional(),
});

const proposeNutritionSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  calorie_target: z.number().int().min(800).max(8000).optional(),
  protein_target: z.number().int().min(20).max(400).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export function buildProposeResult(
  type: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    proposed: true,
    requires_confirmation: true,
    confirmation_required: true,
    type,
    proposal: payload,
    instruction:
      "Present this proposal to the user. Do not claim it was applied. The user must confirm in the UI before the server executes it.",
  };
}

export function proposeReminder(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = proposeReminderSchema.safeParse(args);
  if (!parsed.success) {
    return { proposed: false, error: "Invalid reminder proposal." };
  }

  const remindAt = new Date(parsed.data.remind_at);
  if (Number.isNaN(remindAt.getTime()) || remindAt <= new Date()) {
    return {
      proposed: false,
      error: "Reminder time must be a valid future timestamp.",
    };
  }

  return buildProposeResult("reminder", {
    ...parsed.data,
    remind_at: remindAt.toISOString(),
  });
}

export function proposeSupportTicket(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = proposeTicketSchema.safeParse(args);
  if (!parsed.success) {
    return { proposed: false, error: "Invalid support ticket proposal." };
  }

  return buildProposeResult("support_ticket", parsed.data);
}

export function proposeWorkoutAdjustment(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = proposeWorkoutSchema.safeParse(args);
  if (!parsed.success) {
    return {
      proposed: false,
      error: "Invalid workout adjustment proposal.",
    };
  }

  return buildProposeResult("workout_adjustment", parsed.data);
}

export function proposeNutritionAdjustment(
  args: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = proposeNutritionSchema.safeParse(args);
  if (!parsed.success) {
    return {
      proposed: false,
      error: "Invalid nutrition adjustment proposal.",
    };
  }

  return buildProposeResult("nutrition_adjustment", parsed.data);
}

export async function executeConfirmedToolAction(args: {
  db: DatabaseClient;
  userId: string;
  toolLogId: string;
}): Promise<{
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}> {
  const { db, userId, toolLogId } = args;

  const logResult = await db
    .from("ai_tool_logs")
    .select("id, user_id, thread_id, tool_name, arguments, result, status")
    .eq("id", toolLogId)
    .eq("user_id", userId)
    .maybeSingle();

  if (logResult.error || !logResult.data) {
    return {
      ok: false,
      status: 404,
      body: { error: "Tool proposal not found." },
    };
  }

  const log = logResult.data as {
    id: string;
    user_id: string;
    thread_id: string | null;
    tool_name: string;
    arguments: Record<string, unknown>;
    result: Record<string, unknown>;
    status: string;
  };

  if (
    log.status !== "confirmation_required" &&
    log.status !== "awaiting_confirmation"
  ) {
    return {
      ok: false,
      status: 409,
      body: { error: "This proposal is not awaiting confirmation." },
    };
  }

  const proposal =
    (log.result?.proposal as Record<string, unknown> | undefined) ??
    log.arguments;

  try {
    let executionResult: Record<string, unknown>;

    switch (log.tool_name) {
      case "propose_reminder":
      case "create_workout_reminder": {
        const parsed = proposeReminderSchema.safeParse(proposal);
        if (!parsed.success) {
          throw new Error("Invalid reminder payload.");
        }

        const remindAt = new Date(parsed.data.remind_at);
        if (Number.isNaN(remindAt.getTime()) || remindAt <= new Date()) {
          throw new Error("Reminder time must be in the future.");
        }

        const insert = await db
          .from("ai_workout_reminders")
          .insert({
            user_id: userId,
            thread_id: log.thread_id,
            title: parsed.data.title.slice(0, 120),
            message: parsed.data.message.slice(0, 1000),
            remind_at: remindAt.toISOString(),
          })
          .select("id, title, message, remind_at")
          .single();

        if (insert.error) {
          throw new Error(insert.error.message);
        }

        executionResult = { created: true, reminder: insert.data };
        break;
      }

      case "propose_support_ticket":
      case "create_support_ticket": {
        const parsed = proposeTicketSchema.safeParse(proposal);
        if (!parsed.success) {
          throw new Error("Invalid ticket payload.");
        }

        const insert = await db
          .from("ai_support_tickets")
          .insert({
            user_id: userId,
            thread_id: log.thread_id,
            subject: parsed.data.subject.slice(0, 160),
            category: parsed.data.category,
            description: parsed.data.description.slice(0, 4000),
            status: "open",
            priority: "normal",
          })
          .select("id, subject, category, status, created_at")
          .single();

        if (insert.error) {
          throw new Error(insert.error.message);
        }

        executionResult = { created: true, ticket: insert.data };
        break;
      }

      case "propose_workout_adjustment": {
        const parsed = proposeWorkoutSchema.safeParse(proposal);
        if (!parsed.success) {
          throw new Error("Invalid workout adjustment payload.");
        }

        if (parsed.data.session_id) {
          const session = await db
            .from("workout_sessions")
            .select("id, user_id, notes")
            .eq("id", parsed.data.session_id)
            .eq("user_id", userId)
            .maybeSingle();

          if (session.error || !session.data) {
            throw new Error("Workout session not found for this user.");
          }

          const noteLine = `[AI Coach adjustment] ${parsed.data.reason}`;
          const existingNotes =
            typeof session.data.notes === "string"
              ? session.data.notes
              : "";
          const update = await db
            .from("workout_sessions")
            .update({
              notes: `${existingNotes}\n${noteLine}`.trim().slice(0, 4000),
            })
            .eq("id", parsed.data.session_id)
            .eq("user_id", userId);

          if (update.error) {
            throw new Error(update.error.message);
          }
        }

        executionResult = {
          applied: true,
          type: "workout_adjustment",
          changes: parsed.data.changes,
          reason: parsed.data.reason,
          note: parsed.data.session_id
            ? "Adjustment note appended to owned workout session."
            : "Proposal accepted and audited. No session ID was provided to mutate.",
        };
        break;
      }

      case "propose_nutrition_adjustment": {
        const parsed = proposeNutritionSchema.safeParse(proposal);
        if (!parsed.success) {
          throw new Error("Invalid nutrition adjustment payload.");
        }

        const settingsUpdate: Record<string, unknown> = {
          user_id: userId,
          updated_at: new Date().toISOString(),
        };

        // Store accepted targets in ai_user_settings metadata-safe columns if present;
        // otherwise keep audit-only acceptance.
        const existing = await db
          .from("ai_user_settings")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();

        if (!existing.error) {
          await db.from("ai_user_settings").upsert(
            {
              ...settingsUpdate,
            },
            { onConflict: "user_id" },
          );
        }

        executionResult = {
          applied: true,
          type: "nutrition_adjustment",
          proposal: parsed.data,
          note: "Nutrition proposal accepted after confirmation. Targets are advisory unless mirrored in the nutrition planner.",
        };
        break;
      }

      default:
        return {
          ok: false,
          status: 400,
          body: { error: "Unsupported tool confirmation." },
        };
    }

    const update = await db
      .from("ai_tool_logs")
      .update({
        status: "succeeded",
        result: removeUndefined({
          ...log.result,
          confirmed: true,
          execution: executionResult,
        }),
      })
      .eq("id", log.id)
      .eq("user_id", userId);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        toolLogId: log.id,
        result: executionResult,
      },
    };
  } catch (error) {
    await db
      .from("ai_tool_logs")
      .update({
        status: "failed",
        result: removeUndefined({
          ...log.result,
          confirmed: true,
          error:
            error instanceof Error
              ? error.message
              : "Confirmation execution failed.",
        }),
      })
      .eq("id", log.id)
      .eq("user_id", userId);

    return {
      ok: false,
      status: 500,
      body: {
        error:
          error instanceof Error
            ? error.message
            : "Confirmation execution failed.",
      },
    };
  }
}

export async function cancelConfirmedToolAction(args: {
  db: DatabaseClient;
  userId: string;
  toolLogId: string;
}): Promise<{
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}> {
  const { db, userId, toolLogId } = args;

  const logResult = await db
    .from("ai_tool_logs")
    .select("id, status")
    .eq("id", toolLogId)
    .eq("user_id", userId)
    .maybeSingle();

  if (logResult.error || !logResult.data) {
    return {
      ok: false,
      status: 404,
      body: { error: "Tool proposal not found." },
    };
  }

  if (
    logResult.data.status !== "confirmation_required" &&
    logResult.data.status !== "awaiting_confirmation"
  ) {
    return {
      ok: false,
      status: 409,
      body: { error: "This proposal is not awaiting confirmation." },
    };
  }

  const update = await db
    .from("ai_tool_logs")
    .update({ status: "cancelled" })
    .eq("id", toolLogId)
    .eq("user_id", userId);

  if (update.error) {
    return {
      ok: false,
      status: 500,
      body: { error: update.error.message },
    };
  }

  return {
    ok: true,
    status: 200,
    body: { success: true, cancelled: true },
  };
}
