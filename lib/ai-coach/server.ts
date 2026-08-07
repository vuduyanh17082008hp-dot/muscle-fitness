import type OpenAI from "openai";
import { z } from "zod";
import {
  getAiClient,
  getAiModel,
  getAiSummaryModel,
  usesResponsesApi,
} from "@/lib/ai-coach/provider";

type DatabaseClient = any;

export type CoachSettings = {
  preferred_tone: "direct" | "supportive" | "analytical";
  detail_level: "concise" | "balanced" | "detailed";
  language: "vi" | "en";
  timezone: string;
  weekly_summary_enabled: boolean;
  workout_reminders_enabled: boolean;
  protein_reminders_enabled: boolean;
  reminder_hour_local: number;
  allow_conversation_memory: boolean;
};

export type CoachAttachment = {
  kind: "image" | "file";
  filename: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  preferred_tone: "supportive",
  detail_level: "balanced",
  language: "vi",
  timezone: "Asia/Singapore",
  weekly_summary_enabled: true,
  workout_reminders_enabled: true,
  protein_reminders_enabled: true,
  reminder_hour_local: 21,
  allow_conversation_memory: true,
};

const attachmentSchema = z.object({
  kind: z.enum(["image", "file"]),
  filename: z.string().trim().min(1).max(160),
  mimeType: z.string().trim().min(1).max(160),
  size: z.number().int().positive().max(4_500_000),
  dataUrl: z
    .string()
    .min(20)
    .max(7_000_000)
    .refine((value) => value.startsWith("data:"), {
      message: "Attachment must be a data URL.",
    }),
});

export const chatRequestSchema = z.object({
  threadId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(6_000),
  attachment: attachmentSchema.nullable().optional(),
});

export function getOpenAI(): OpenAI {
  return getAiClient();
}

/** Resolved at call time so env changes apply after restart. */
export function getAiModelName(): string {
  return getAiModel();
}

export function getAiSummaryModelName(): string {
  return getAiSummaryModel();
}

/** @deprecated Use getAiModelName() — kept for existing imports. */
export const AI_MODEL =
  process.env.OPENROUTER_MODEL ||
  process.env.AI_MODEL ||
  process.env.OPENAI_MODEL ||
  "";
export const AI_SUMMARY_MODEL =
  process.env.OPENROUTER_SUMMARY_MODEL ||
  process.env.AI_SUMMARY_MODEL ||
  process.env.OPENAI_SUMMARY_MODEL ||
  AI_MODEL;

export const PLAN_AI_LIMITS = {
  free: 10,
  starter: 40,
  pro: 150,
  elite: 500,
} as const;

export const COACH_TOOLS = [
  {
    type: "function",
    name: "get_client_profile",
    description:
      "Read the authenticated client's onboarding profile, goal, age, gender, measurements, training preferences and relevant limitations. Never request a user ID.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_today_workout",
    description:
      "Read today's scheduled workout and active workout plan for the authenticated client.",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_recent_progress",
    description:
      "Read recent body-weight, completed workout, adherence and recovery data for the authenticated client.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 90,
          description: "Number of recent days to examine.",
        },
      },
      required: ["days"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_nutrition_summary",
    description:
      "Read calorie, protein and meal-log totals for the authenticated client.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Number of recent days to summarize.",
        },
      },
      required: ["days"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_workout_reminder",
    description:
      "Create a workout reminder. This is a write action and must only succeed after the user explicitly says XÁC NHẬN TẠO NHẮC NHỞ.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short reminder title.",
        },
        message: {
          type: "string",
          description: "Reminder content.",
        },
        remind_at: {
          type: "string",
          description: "ISO-8601 date and time including timezone.",
        },
        confirmed: {
          type: "boolean",
          description:
            "True only when the latest user message explicitly confirms the action.",
        },
      },
      required: ["title", "message", "remind_at", "confirmed"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_support_ticket",
    description:
      "Create a support ticket. This is a write action and must only succeed after the user explicitly says XÁC NHẬN TẠO TICKET.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        subject: {
          type: "string",
          description: "Short support ticket subject.",
        },
        category: {
          type: "string",
          enum: [
            "technical",
            "billing",
            "workout",
            "nutrition",
            "account",
            "other",
          ],
        },
        description: {
          type: "string",
          description: "Full support request.",
        },
        confirmed: {
          type: "boolean",
          description:
            "True only when the latest user message explicitly confirms the action.",
        },
      },
      required: ["subject", "category", "description", "confirmed"],
      additionalProperties: false,
    },
  },
] as const;

/** Chat Completions tool schema (OpenRouter / OpenAI-compatible). */
export const COACH_CHAT_TOOLS = COACH_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

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

function localDateKey(
  date: Date,
  timeZone: string,
): string {
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

async function readSingleRecord(
  db: DatabaseClient,
  table: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const byUserId = await db
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!byUserId.error) {
    return byUserId.data as Record<string, unknown> | null;
  }

  const byId = await db
    .from(table)
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!byId.error) {
    return byId.data as Record<string, unknown> | null;
  }

  return null;
}

export async function readUserRows(
  db: DatabaseClient,
  table: string,
  userId: string,
  limit = 100,
): Promise<{
  available: boolean;
  rows: Record<string, unknown>[];
}> {
  const possibleColumns = ["user_id", "client_id"];

  for (const column of possibleColumns) {
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

  return {
    available: false,
    rows: [],
  };
}

function calculateAge(dateOfBirth: unknown): number | null {
  if (typeof dateOfBirth !== "string") {
    return null;
  }

  const birthDate = new Date(dateOfBirth);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();

  const monthDifference =
    today.getUTCMonth() - birthDate.getUTCMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 &&
      today.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

async function getClientProfile(
  db: DatabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const [profile, fitnessProfile, preferences, aiSettings] =
    await Promise.all([
      readSingleRecord(db, "profiles", userId),
      readSingleRecord(db, "fitness_profiles", userId),
      readSingleRecord(db, "user_preferences", userId),
      readSingleRecord(db, "ai_user_settings", userId),
    ]);

  const profileSafe = pickFields(profile, [
    "full_name",
    "display_name",
    "first_name",
    "date_of_birth",
    "gender",
    "timezone",
    "onboarding_completed",
  ]);

  const fitnessSafe = pickFields(fitnessProfile, [
    "goal",
    "primary_goal",
    "height_cm",
    "height",
    "weight_kg",
    "weight",
    "target_weight_kg",
    "experience",
    "experience_level",
    "training_days",
    "training_days_per_week",
    "session_duration",
    "session_duration_minutes",
    "training_location",
    "available_equipment",
    "priority_muscles",
    "physical_limitations",
    "limitations",
    "calorie_target",
    "daily_calorie_target",
    "protein_target",
    "daily_protein_target",
    "carbohydrate_target",
    "fat_target",
  ]);

  const preferenceSafe = pickFields(preferences, [
    "meals_per_day",
    "food_preferences",
    "excluded_foods",
    "allergies",
    "budget",
    "cooking_ability",
    "meal_prep_frequency",
    "sleep_hours",
    "daily_steps",
    "work_schedule",
    "school_schedule",
    "stress_level",
    "preferred_training_time",
  ]);

  const dateOfBirth =
    profileSafe?.date_of_birth ??
    fitnessSafe?.date_of_birth ??
    null;

  const age = calculateAge(dateOfBirth);

  return {
    available: Boolean(profile || fitnessProfile || preferences),
    profile: profileSafe,
    fitness_profile: fitnessSafe,
    preferences: preferenceSafe,
    age,
    minor: age !== null && age < 18,
    ai_settings: pickFields(aiSettings, [
      "preferred_tone",
      "detail_level",
      "language",
      "timezone",
    ]),
    missing_data_notice:
      !profile && !fitnessProfile
        ? "Onboarding or fitness profile data is unavailable."
        : null,
  };
}

async function getTodayWorkout(
  db: DatabaseClient,
  userId: string,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const [sessionsResult, plansResult] = await Promise.all([
    readUserRows(db, "workout_sessions", userId, 150),
    readUserRows(db, "workout_plans", userId, 30),
  ]);

  const todayKey = localDateKey(new Date(), timeZone);

  const todaySessions = sessionsResult.rows
    .filter((row) => {
      const date = rowDate(row);

      return date
        ? localDateKey(date, timeZone) === todayKey
        : false;
    })
    .map((row) =>
      pickFields(row, [
        "id",
        "title",
        "name",
        "focus",
        "status",
        "scheduled_for",
        "workout_date",
        "started_at",
        "completed_at",
        "duration_minutes",
        "exercises",
        "notes",
        "workout_plan_id",
      ]),
    );

  const activePlan =
    plansResult.rows.find((row) => {
      const status = stringFromRow(row, ["status"]);
      const active = row.active ?? row.is_active;

      return status === "active" || active === true;
    }) ??
    plansResult.rows[0] ??
    null;

  return {
    available:
      sessionsResult.available || plansResult.available,
    date: todayKey,
    timezone: timeZone,
    today_sessions: todaySessions,
    active_plan: activePlan
      ? pickFields(activePlan, [
          "id",
          "name",
          "title",
          "goal",
          "status",
          "start_date",
          "end_date",
          "training_days",
          "weekly_schedule",
          "notes",
        ])
      : null,
    message:
      todaySessions.length === 0
        ? "No scheduled workout was found for today."
        : null,
  };
}

async function getRecentProgress(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const boundedDays = Math.min(Math.max(days, 1), 90);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - boundedDays);

  const [weightsResult, sessionsResult, metricsResult] =
    await Promise.all([
      readUserRows(db, "weight_entries", userId, 300),
      readUserRows(db, "workout_sessions", userId, 300),
      readUserRows(db, "daily_metrics", userId, 300),
    ]);

  const recentWeights = weightsResult.rows
    .filter((row) => {
      const date = rowDate(row);

      return date ? date >= cutoff : false;
    })
    .map((row) => ({
      date: rowDate(row)?.toISOString() ?? null,
      weight_kg: numberFromRow(row, [
        "weight_kg",
        "weight",
        "value",
      ]),
    }))
    .filter((row) => row.weight_kg !== null)
    .sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );

  const recentSessions = sessionsResult.rows.filter((row) => {
    const date = rowDate(row);

    return date ? date >= cutoff : false;
  });

  const completedSessions = recentSessions.filter((row) => {
    const status = normalizeText(
      stringFromRow(row, ["status"]) || "",
    );

    return (
      status === "completed" ||
      Boolean(row.completed_at) ||
      row.is_completed === true
    );
  });

  const scheduledSessions = recentSessions.filter((row) => {
    const status = normalizeText(
      stringFromRow(row, ["status"]) || "",
    );

    return !["cancelled", "deleted"].includes(status);
  });

  const recoveryScores = metricsResult.rows
    .filter((row) => {
      const date = rowDate(row);

      return date ? date >= cutoff : false;
    })
    .map((row) =>
      numberFromRow(row, [
        "recovery_score",
        "readiness_score",
      ]),
    )
    .filter((value): value is number => value !== null);

  const firstWeight = recentWeights[0]?.weight_kg ?? null;
  const lastWeight =
    recentWeights[recentWeights.length - 1]?.weight_kg ?? null;

  const weightChange =
    firstWeight !== null && lastWeight !== null
      ? Number((lastWeight - firstWeight).toFixed(2))
      : null;

  const adherence =
    scheduledSessions.length > 0
      ? Number(
          (
            (completedSessions.length /
              scheduledSessions.length) *
            100
          ).toFixed(1),
        )
      : null;

  const averageRecovery =
    recoveryScores.length > 0
      ? Number(
          (
            recoveryScores.reduce(
              (sum, value) => sum + value,
              0,
            ) / recoveryScores.length
          ).toFixed(1),
        )
      : null;

  return {
    available:
      weightsResult.available ||
      sessionsResult.available ||
      metricsResult.available,
    period_days: boundedDays,
    timezone: timeZone,
    weight: {
      entries: recentWeights,
      starting_weight_kg: firstWeight,
      latest_weight_kg: lastWeight,
      change_kg: weightChange,
    },
    workouts: {
      scheduled: scheduledSessions.length,
      completed: completedSessions.length,
      adherence_percent: adherence,
    },
    recovery: {
      average_score: averageRecovery,
      recorded_days: recoveryScores.length,
    },
  };
}

async function getNutritionSummary(
  db: DatabaseClient,
  userId: string,
  days: number,
  timeZone: string,
): Promise<Record<string, unknown>> {
  const boundedDays = Math.min(Math.max(days, 1), 30);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - boundedDays);

  const [metricsResult, mealLogsResult] = await Promise.all([
    readUserRows(db, "daily_metrics", userId, 300),
    readUserRows(db, "meal_logs", userId, 500),
  ]);

  const dailyMap = new Map<
    string,
    {
      date: string;
      calories: number;
      protein: number;
      calorie_target: number | null;
      protein_target: number | null;
      source: string;
    }
  >();

  const metricRows = metricsResult.rows.filter((row) => {
    const date = rowDate(row);

    return date ? date >= cutoff : false;
  });

  for (const row of metricRows) {
    const date = rowDate(row);

    if (!date) {
      continue;
    }

    const key = localDateKey(date, timeZone);

    dailyMap.set(key, {
      date: key,
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
          "total_protein",
          "protein",
        ]) ?? 0,
      calorie_target: numberFromRow(row, [
        "calorie_target",
        "calories_target",
        "target_calories",
      ]),
      protein_target: numberFromRow(row, [
        "protein_target",
        "protein_goal",
        "target_protein",
      ]),
      source: "daily_metrics",
    });
  }

  if (dailyMap.size === 0) {
    const mealRows = mealLogsResult.rows.filter((row) => {
      const date = rowDate(row);

      return date ? date >= cutoff : false;
    });

    for (const row of mealRows) {
      const date = rowDate(row);

      if (!date) {
        continue;
      }

      const key = localDateKey(date, timeZone);
      const current = dailyMap.get(key) ?? {
        date: key,
        calories: 0,
        protein: 0,
        calorie_target: null,
        protein_target: null,
        source: "meal_logs",
      };

      current.calories +=
        numberFromRow(row, [
          "calories",
          "kcal",
          "total_calories",
        ]) ?? 0;

      current.protein +=
        numberFromRow(row, [
          "protein",
          "protein_grams",
        ]) ?? 0;

      dailyMap.set(key, current);
    }
  }

  const dailyValues = [...dailyMap.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const averageCalories =
    dailyValues.length > 0
      ? Number(
          (
            dailyValues.reduce(
              (sum, day) => sum + day.calories,
              0,
            ) / dailyValues.length
          ).toFixed(1),
        )
      : null;

  const averageProtein =
    dailyValues.length > 0
      ? Number(
          (
            dailyValues.reduce(
              (sum, day) => sum + day.protein,
              0,
            ) / dailyValues.length
          ).toFixed(1),
        )
      : null;

  const proteinTargetDays = dailyValues.filter(
    (day) =>
      day.protein_target !== null &&
      day.protein >= day.protein_target,
  ).length;

  const calorieTargetDays = dailyValues.filter(
    (day) =>
      day.calorie_target !== null &&
      Math.abs(day.calories - day.calorie_target) <=
        day.calorie_target * 0.1,
  ).length;

  return {
    available:
      metricsResult.available || mealLogsResult.available,
    period_days: boundedDays,
    timezone: timeZone,
    recorded_days: dailyValues.length,
    days: dailyValues,
    averages: {
      calories: averageCalories,
      protein_grams: averageProtein,
    },
    adherence: {
      protein_target_days: proteinTargetDays,
      calorie_target_days: calorieTargetDays,
    },
  };
}

function reminderConfirmationPresent(
  latestUserMessage: string,
): boolean {
  return normalizeText(latestUserMessage).includes(
    "xac nhan tao nhac nho",
  );
}

function supportConfirmationPresent(
  latestUserMessage: string,
): boolean {
  return normalizeText(latestUserMessage).includes(
    "xac nhan tao ticket",
  );
}

async function createWorkoutReminder(
  db: DatabaseClient,
  userId: string,
  threadId: string,
  latestUserMessage: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const confirmed =
    args.confirmed === true &&
    reminderConfirmationPresent(latestUserMessage);

  if (!confirmed) {
    return {
      created: false,
      requires_confirmation: true,
      confirmation_phrase: "XÁC NHẬN TẠO NHẮC NHỞ",
      instruction:
        "Show the proposed title, content and time. Ask the user to reply with the exact confirmation phrase.",
    };
  }

  const title =
    typeof args.title === "string" ? args.title.trim() : "";

  const message =
    typeof args.message === "string"
      ? args.message.trim()
      : "";

  const remindAt =
    typeof args.remind_at === "string"
      ? new Date(args.remind_at)
      : new Date("invalid");

  if (!title || !message || Number.isNaN(remindAt.getTime())) {
    return {
      created: false,
      error: "Invalid reminder data.",
    };
  }

  const now = new Date();
  const maximumDate = new Date();
  maximumDate.setUTCFullYear(maximumDate.getUTCFullYear() + 1);

  if (remindAt <= now) {
    return {
      created: false,
      error: "Reminder time must be in the future.",
    };
  }

  if (remindAt > maximumDate) {
    return {
      created: false,
      error: "Reminder cannot be more than one year away.",
    };
  }

  const result = await db
    .from("ai_workout_reminders")
    .insert({
      user_id: userId,
      thread_id: threadId,
      title: title.slice(0, 120),
      message: message.slice(0, 1_000),
      remind_at: remindAt.toISOString(),
    })
    .select("id, title, message, remind_at")
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    created: true,
    reminder: result.data,
  };
}

async function createSupportTicket(
  db: DatabaseClient,
  userId: string,
  threadId: string,
  latestUserMessage: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const confirmed =
    args.confirmed === true &&
    supportConfirmationPresent(latestUserMessage);

  if (!confirmed) {
    return {
      created: false,
      requires_confirmation: true,
      confirmation_phrase: "XÁC NHẬN TẠO TICKET",
      instruction:
        "Show the proposed ticket subject, category and description. Ask the user to reply with the exact confirmation phrase.",
    };
  }

  const categoryValues = [
    "technical",
    "billing",
    "workout",
    "nutrition",
    "account",
    "other",
  ];

  const subject =
    typeof args.subject === "string"
      ? args.subject.trim()
      : "";

  const category =
    typeof args.category === "string" &&
    categoryValues.includes(args.category)
      ? args.category
      : "other";

  const description =
    typeof args.description === "string"
      ? args.description.trim()
      : "";

  if (!subject || !description) {
    return {
      created: false,
      error: "Ticket subject and description are required.",
    };
  }

  const result = await db
    .from("ai_support_tickets")
    .insert({
      user_id: userId,
      thread_id: threadId,
      subject: subject.slice(0, 160),
      category,
      description: description.slice(0, 4_000),
      status: "open",
      priority: "normal",
    })
    .select("id, subject, category, status, created_at")
    .single();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    created: true,
    ticket: result.data,
  };
}

export async function runToolCall(args: {
  db: DatabaseClient;
  userId: string;
  threadId: string;
  latestUserMessage: string;
  settings: CoachSettings;
  call: {
    name: string;
    arguments: string;
    call_id: string;
  };
}): Promise<{
  name: string;
  callId: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}> {
  const {
    db,
    userId,
    threadId,
    latestUserMessage,
    settings,
    call,
  } = args;

  const startedAt = Date.now();
  let parsedArguments: Record<string, unknown> = {};
  let result: Record<string, unknown>;
  let status:
    | "success"
    | "error"
    | "confirmation_required" = "success";

  try {
    parsedArguments = call.arguments
      ? JSON.parse(call.arguments)
      : {};

    switch (call.name) {
      case "get_client_profile":
        result = await getClientProfile(db, userId);
        break;

      case "get_today_workout":
        result = await getTodayWorkout(
          db,
          userId,
          safeTimeZone(settings.timezone),
        );
        break;

      case "get_recent_progress":
        result = await getRecentProgress(
          db,
          userId,
          Number(parsedArguments.days ?? 7),
          safeTimeZone(settings.timezone),
        );
        break;

      case "get_nutrition_summary":
        result = await getNutritionSummary(
          db,
          userId,
          Number(parsedArguments.days ?? 7),
          safeTimeZone(settings.timezone),
        );
        break;

      case "create_workout_reminder":
        result = await createWorkoutReminder(
          db,
          userId,
          threadId,
          latestUserMessage,
          parsedArguments,
        );

        if (result.requires_confirmation === true) {
          status = "confirmation_required";
        }

        break;

      case "create_support_ticket":
        result = await createSupportTicket(
          db,
          userId,
          threadId,
          latestUserMessage,
          parsedArguments,
        );

        if (result.requires_confirmation === true) {
          status = "confirmation_required";
        }

        break;

      default:
        throw new Error(`Unknown AI tool: ${call.name}`);
    }
  } catch (error) {
    status = "error";

    result = {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Tool execution failed.",
    };
  }

  await db.from("ai_tool_logs").insert({
    user_id: userId,
    thread_id: threadId,
    tool_name: call.name,
    call_id: call.call_id,
    arguments: removeUndefined(parsedArguments),
    result: removeUndefined(result),
    status,
    duration_ms: Date.now() - startedAt,
  });

  return {
    name: call.name,
    callId: call.call_id,
    arguments: parsedArguments,
    result,
  };
}

export function buildCoachInstructions(
  settings: CoachSettings,
): string {
  const languageInstruction =
    settings.language === "en"
      ? "Respond in English unless the user requests another language."
      : "Trả lời bằng tiếng Việt trừ khi khách hàng yêu cầu ngôn ngữ khác.";

  const toneInstruction = {
    direct:
      "Be direct, disciplined and action-oriented without being insulting.",
    supportive:
      "Be supportive, motivating, calm and practical.",
    analytical:
      "Be analytical, data-led and explain the reasoning concisely.",
  }[settings.preferred_tone];

  const detailInstruction = {
    concise: "Keep answers concise and focused.",
    balanced:
      "Use balanced detail: enough to act on without unnecessary length.",
    detailed:
      "Provide detailed explanations and structured action steps.",
  }[settings.detail_level];

  return `
You are Muscle Fitness AI Coach.

You assist only the currently authenticated client. You must never ask for, infer, or use another client's user ID.

CORE BEHAVIOUR
- Personalize answers using tool data.
- Never invent onboarding, workout, nutrition, recovery or progress data.
- Clearly state when data is missing or unavailable.
- Distinguish fitness education from medical advice.
- Suggestions are proposals, not automatic changes to an active plan.
- Do not modify an active workout or meal plan without explicit confirmation.
- Keep recommendations realistic, gradual and evidence-informed.
- Consider the client's age, goal, sex/gender data, training experience, physical limitations, schedule and available equipment.
- For clients under 18, do not encourage aggressive calorie restriction. Recommend involvement of a parent, guardian or qualified health professional for significant diet changes.

MEDICAL SAFETY
- Do not diagnose medical conditions.
- Do not prescribe medication.
- Do not interpret symptoms as a confirmed disease or injury.
- For chest pain, fainting, severe breathing difficulty, sudden weakness, severe allergic reaction, major injury or other emergency warning signs, tell the client to stop training and obtain urgent professional medical help.
- For persistent pain, injury, eating-disorder concerns, pregnancy-related questions or diagnosed medical conditions, direct the client to a qualified clinician.
- Always state that general fitness guidance is not a substitute for medical care when the question crosses into medical territory.

PROHIBITED FITNESS GUIDANCE
- Do not recommend, design or optimize PED, steroid, SARM, hormone, insulin, growth hormone or illicit drug protocols.
- Do not provide dosing, cycling, stacking or post-cycle therapy instructions.
- You may explain risks and recommend speaking with a qualified medical professional.

WRITE-ACTION SAFETY
- create_workout_reminder may only succeed after the latest user message includes the exact phrase: XÁC NHẬN TẠO NHẮC NHỞ.
- create_support_ticket may only succeed after the latest user message includes the exact phrase: XÁC NHẬN TẠO TICKET.
- Never claim an action succeeded unless the tool output confirms it.
- When confirmation is missing, display the proposed action clearly and ask for the exact confirmation phrase.
- Do not send, edit or delete unrelated client data.

TRAINING
- Avoid sudden large increases in volume, intensity or frequency.
- Account for recovery, sleep, pain, recent adherence and training history.
- Explain proposed workout adjustments before recommending implementation.

NUTRITION
- Use logged calories and macros when available.
- Avoid extreme deficits, purging, dehydration or unsafe rapid weight-loss advice.
- Treat allergies and excluded foods as hard constraints.
- Do not claim a meal has exact macros unless the database provides them or the values are explicitly presented as estimates.

${languageInstruction}
${toneInstruction}
${detailInstruction}
`.trim();
}

export function buildModelInput(args: {
  messages: Array<{
    id: string;
    role: string;
    content: string;
  }>;
  summary?: string | null;
  attachment?: CoachAttachment | null;
  currentMessageId: string;
}): any[] {
  const { messages, summary, attachment, currentMessageId } =
    args;

  const input: any[] = [];

  if (summary) {
    input.push({
      role: "developer",
      content: `Conversation memory summary:\n${summary}`,
    });
  }

  for (const message of messages) {
    if (
      message.role !== "user" &&
      message.role !== "assistant"
    ) {
      continue;
    }

    if (
      message.role === "user" &&
      message.id === currentMessageId &&
      attachment
    ) {
      const content: any[] = [
        {
          type: "input_text",
          text: message.content,
        },
      ];

      if (attachment.kind === "image") {
        content.push({
          type: "input_image",
          image_url: attachment.dataUrl,
          detail: "auto",
        });
      } else {
        const fileContent: Record<string, unknown> = {
          type: "input_file",
          filename: attachment.filename,
          file_data: attachment.dataUrl,
        };

        if (attachment.mimeType === "application/pdf") {
          fileContent.detail = "auto";
        }

        content.push(fileContent);
      }

      input.push({
        role: "user",
        content,
      });

      continue;
    }

    input.push({
      role: message.role,
      content: message.content,
    });
  }

  return input;
}

export function buildChatMessages(args: {
  instructions: string;
  messages: Array<{
    id: string;
    role: string;
    content: string;
  }>;
  summary?: string | null;
  attachment?: CoachAttachment | null;
  currentMessageId: string;
}): OpenAI.Chat.ChatCompletionMessageParam[] {
  const {
    instructions,
    messages,
    summary,
    attachment,
    currentMessageId,
  } = args;

  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] =
    [
      {
        role: "system",
        content: instructions,
      },
    ];

  if (summary) {
    chatMessages.push({
      role: "system",
      content: `Conversation memory summary:\n${summary}`,
    });
  }

  for (const message of messages) {
    if (
      message.role !== "user" &&
      message.role !== "assistant"
    ) {
      continue;
    }

    if (
      message.role === "user" &&
      message.id === currentMessageId &&
      attachment?.kind === "image"
    ) {
      chatMessages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: message.content,
          },
          {
            type: "image_url",
            image_url: {
              url: attachment.dataUrl,
            },
          },
        ],
      });
      continue;
    }

    if (
      message.role === "user" &&
      message.id === currentMessageId &&
      attachment?.kind === "file"
    ) {
      chatMessages.push({
        role: "user",
        content: `${message.content}\n\n[Attached file: ${attachment.filename} (${attachment.mimeType})]`,
      });
      continue;
    }

    chatMessages.push({
      role: message.role as "user" | "assistant",
      content: message.content,
    });
  }

  return chatMessages;
}

export function usageFromResponse(
  response:
    | {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
          prompt_tokens?: number;
          completion_tokens?: number;
        } | null;
      }
    | null
    | undefined,
): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const usage = response?.usage;
  const inputTokens =
    usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
  const outputTokens =
    usage?.output_tokens ?? usage?.completion_tokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      usage?.total_tokens ?? inputTokens + outputTokens,
  };
}

export async function maybeSummarizeThread(args: {
  db: DatabaseClient;
  userId: string;
  threadId: string;
}): Promise<void> {
  const { db, userId, threadId } = args;

  const countResult = await db
    .from("ai_messages")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("thread_id", threadId)
    .eq("user_id", userId);

  if (countResult.error) {
    return;
  }

  const messageCount = countResult.count ?? 0;

  if (messageCount < 12) {
    return;
  }

  const summaryResult = await db
    .from("ai_thread_summaries")
    .select("covered_message_count")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();

  const coveredMessageCount =
    summaryResult.data?.covered_message_count ?? 0;

  if (messageCount - coveredMessageCount < 12) {
    return;
  }

  const messagesResult = await db
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .in("role", ["user", "assistant"])
    .order("created_at", {
      ascending: false,
    })
    .limit(24);

  if (
    messagesResult.error ||
    !messagesResult.data?.length
  ) {
    return;
  }

  const messages = [...messagesResult.data].reverse();
  const latestMessage = messages[messages.length - 1];

  const transcript = messages
    .map(
      (message: {
        role: string;
        content: string;
      }) => `${message.role.toUpperCase()}: ${message.content}`,
    )
    .join("\n\n");

  const summaryModel = getAiSummaryModelName();
  const summaryPrompt = `
Summarize this fitness coaching conversation for future context.

Include only:
- the client's stated goals and preferences;
- important constraints;
- workout, nutrition and recovery decisions;
- confirmed actions;
- unresolved questions;
- safety-relevant information.

Do not add facts. Do not include hidden reasoning. Keep the summary under 500 words.
`.trim();

  // Inline completion to avoid circular import with transport.ts.
  const client = getOpenAI();
  let summary = "";

  if (usesResponsesApi()) {
    const response = await client.responses.create({
      model: summaryModel,
      store: false,
      instructions: summaryPrompt,
      input: transcript,
      max_output_tokens: 700,
    });

    summary = response.output_text.trim();
  } else {
    const response = await client.chat.completions.create({
      model: summaryModel,
      messages: [
        {
          role: "system",
          content: summaryPrompt,
        },
        {
          role: "user",
          content: transcript,
        },
      ],
      max_tokens: 700,
    });

    summary = response.choices[0]?.message?.content?.trim() ?? "";
  }

  if (!summary) {
    return;
  }

  await db.from("ai_thread_summaries").upsert(
    {
      thread_id: threadId,
      user_id: userId,
      summary,
      covered_through_message_id: latestMessage.id,
      covered_message_count: messageCount,
      model: summaryModel,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "thread_id",
    },
  );
}

export async function syncAiEntitlement(
  adminDb: DatabaseClient,
  userId: string,
  planCode: keyof typeof PLAN_AI_LIMITS,
  externalSubscriptionId?: string | null,
): Promise<void> {
  const dailyLimit =
    PLAN_AI_LIMITS[planCode] ?? PLAN_AI_LIMITS.free;

  const result = await adminDb
    .from("ai_entitlements")
    .upsert(
      {
        user_id: userId,
        plan_code: planCode,
        daily_message_limit: dailyLimit,
        active: true,
        source: "payment",
        external_subscription_id:
          externalSubscriptionId ?? null,
        starts_at: new Date().toISOString(),
        ends_at: null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      },
    );

  if (result.error) {
    throw new Error(result.error.message);
  }
}