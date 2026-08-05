"use server";

/**
 * Cutting-edge Server Actions for Muscle Fitness workout plans + player.
 * Behavior and public API match the original source; internals use
 * Next.js 16 cache tags, Zod 4, typed Results, and batched writes.
 */

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

/* =========================================================
   SHARED TYPES
========================================================= */

type AppSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createClient>>
>;

type UnknownRecord = Record<string, unknown>;

type WorkoutPlanInsert =
  Database["public"]["Tables"]["workout_plans"]["Insert"];
type WorkoutDayInsert =
  Database["public"]["Tables"]["workout_days"]["Insert"];
type WorkoutExerciseInsert =
  Database["public"]["Tables"]["workout_exercises"]["Insert"];

export type CreateWorkoutPlanInput = {
  name: string;

  clientId?: string;
  client_id?: string;

  description?: string | null;
  goal?: string | null;

  weeks?: number | string;

  daysPerWeek?: number | string;
  days_per_week?: number | string;

  sessionDurationMinutes?: number | string;
  session_duration_minutes?: number | string;

  days?: unknown[];

  /*
   * Cho phép PlanBuilder gửi thêm các field như:
   * status, level, startDate, selectedDays...
   */
  [key: string]: unknown;
};

export type PlanActionResult = {
  success: boolean;
  message: string;
  planId?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export type WorkoutPlayerActionResult = {
  success: boolean;
  message: string;
  data?: unknown;
};

const WORKOUT_CACHE_TAGS = {
  plans: "workout-plans",
  sessions: "workout-sessions",
  progress: "workout-progress",
} as const;

const SESSION_API = {
  actions: "actions",
  progress: "progress",
} as const;

const PLAYER_ACTIONS = {
  finish: "finish_workout",
  replace: "replace_exercise",
  saveSet: "save_set",
  skip: "skip_exercise",
} as const;

/* =========================================================
   VALIDATION SCHEMAS
========================================================= */

const uuidSchema = z.string().uuid("ID không hợp lệ.");

const workoutPlanSchema = z.object({
  clientId: z.string().uuid().optional(),

  name: z
    .string()
    .trim()
    .min(2, "Tên workout plan phải có ít nhất 2 ký tự.")
    .max(120, "Tên workout plan không được vượt quá 120 ký tự."),

  description: z.string().trim().max(2000).nullable().optional(),

  goal: z.string().trim().max(500).nullable().optional(),

  weeks: z.coerce.number().int().min(1).max(52).default(4),

  daysPerWeek: z.coerce.number().int().min(1).max(7).default(3),

  sessionDurationMinutes: z.coerce
    .number()
    .int()
    .min(15)
    .max(300)
    .default(60),

  days: z.array(z.unknown()).default([]),
});

const workoutDaySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(7),

  name: z
    .string()
    .trim()
    .min(2, "Tên ngày tập phải có ít nhất 2 ký tự.")
    .max(120),

  focus: z.string().trim().max(300).nullable().optional(),

  notes: z.string().trim().max(2000).nullable().optional(),

  restDay: z.boolean().default(false),

  exercises: z.array(z.unknown()).default([]),
});

const workoutExerciseSchema = z
  .object({
    exerciseId: z.string().uuid().nullable().optional(),

    exerciseName: z
      .string()
      .trim()
      .min(2, "Tên bài tập phải có ít nhất 2 ký tự.")
      .max(160),

    exerciseOrder: z.coerce.number().int().min(1).max(100),

    targetSets: z.coerce.number().int().min(1).max(20),

    repMin: z.coerce.number().int().min(1).max(100),

    repMax: z.coerce.number().int().min(1).max(100),

    restSeconds: z.coerce.number().int().min(0).max(900),

    tempo: z.string().trim().max(30).nullable().optional(),

    rir: z.coerce.number().int().min(0).max(5).nullable().optional(),

    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.repMax < value.repMin) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repMax"],
        message: "Rep tối đa không được nhỏ hơn rep tối thiểu.",
      });
    }
  });

type ParsedWorkoutPlan = z.infer<typeof workoutPlanSchema>;
type ParsedWorkoutDay = z.infer<typeof workoutDaySchema>;
type ParsedWorkoutExercise = z.infer<typeof workoutExerciseSchema>;

/* =========================================================
   RESULT + VALUE HELPERS
========================================================= */

function planOk(
  message: string,
  planId: string,
): PlanActionResult {
  return { success: true, message, planId };
}

function planFail(
  message: string,
  fieldErrors?: PlanActionResult["fieldErrors"],
): PlanActionResult {
  return { success: false, message, fieldErrors };
}

function playerOk(
  message: string,
  data?: unknown,
): WorkoutPlayerActionResult {
  return { success: true, message, data };
}

function playerFail(
  message: string,
  data?: unknown,
): WorkoutPlayerActionResult {
  return { success: false, message, data };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
  source: UnknownRecord,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getNullableString(
  source: UnknownRecord,
  keys: readonly string[],
): string | null {
  return getString(source, keys) ?? null;
}

function getNumberLike(
  source: UnknownRecord,
  keys: readonly string[],
  fallback: number,
): number | string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" || typeof value === "string") {
      return value;
    }
  }
  return fallback;
}

function getBoolean(
  source: UnknownRecord,
  keys: readonly string[],
  fallback = false,
): boolean {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") return value;
    if (value === "true" || value === "on" || value === 1) return true;
    if (value === "false" || value === "off" || value === 0) return false;
  }

  return fallback;
}

function getArray(
  source: UnknownRecord,
  keys: readonly string[],
): unknown[] {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function getFormString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function emptyToNull(value: string | null | undefined): string | null {
  const cleanedValue = value?.trim();
  return cleanedValue ? cleanedValue : null;
}

function getValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
}

function getDatabaseMessage(context: string, message: string): string {
  if (message.includes("workout_days_plan_day_unique")) {
    return "Ngày tập này đã tồn tại trong workout plan.";
  }

  if (message.includes("workout_exercises_day_order_unique")) {
    return "Thứ tự bài tập này đã tồn tại trong ngày tập.";
  }

  if (message.toLowerCase().includes("duplicate key")) {
    return "Dữ liệu này đã tồn tại.";
  }

  return `${context}: ${message}`;
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/* =========================================================
   NORMALIZE PLAN BUILDER INPUT
========================================================= */

function normalizePlanInput(input: CreateWorkoutPlanInput) {
  const source: UnknownRecord = input;

  return {
    clientId: getString(source, [
      "clientId",
      "client_id",
      "userId",
      "user_id",
    ]),

    name:
      getString(source, ["name", "planName", "plan_name", "title"]) ?? "",

    description: getNullableString(source, ["description", "notes"]),

    goal: getNullableString(source, [
      "goal",
      "primaryGoal",
      "primary_goal",
    ]),

    weeks: getNumberLike(
      source,
      ["weeks", "durationWeeks", "duration_weeks"],
      4,
    ),

    daysPerWeek: getNumberLike(
      source,
      [
        "daysPerWeek",
        "days_per_week",
        "trainingDays",
        "training_days",
      ],
      3,
    ),

    sessionDurationMinutes: getNumberLike(
      source,
      [
        "sessionDurationMinutes",
        "session_duration_minutes",
        "sessionDuration",
        "session_duration",
      ],
      60,
    ),

    days: getArray(source, [
      "days",
      "workoutDays",
      "workout_days",
      "sessions",
    ]),
  };
}

function normalizeDayInput(input: unknown, fallbackNumber: number) {
  const source = isRecord(input) ? input : {};

  return {
    dayNumber: getNumberLike(
      source,
      ["dayNumber", "day_number", "order", "day"],
      fallbackNumber,
    ),

    name:
      getString(source, ["name", "dayName", "day_name", "title"]) ??
      `Day ${fallbackNumber}`,

    focus: getNullableString(source, [
      "focus",
      "muscleGroup",
      "muscle_group",
    ]),

    notes: getNullableString(source, ["notes", "description"]),

    restDay: getBoolean(source, [
      "restDay",
      "rest_day",
      "isRestDay",
      "is_rest_day",
    ]),

    exercises: getArray(source, [
      "exercises",
      "workoutExercises",
      "workout_exercises",
      "items",
    ]),
  };
}

function normalizeExerciseInput(input: unknown, fallbackOrder: number) {
  const source = isRecord(input) ? input : {};
  const rawRir = source.rir;

  return {
    exerciseId:
      getString(source, [
        "exerciseId",
        "exercise_id",
        "libraryExerciseId",
        "library_exercise_id",
      ]) ?? null,

    exerciseName:
      getString(source, [
        "exerciseName",
        "exercise_name",
        "name",
        "title",
      ]) ?? `Exercise ${fallbackOrder}`,

    exerciseOrder: getNumberLike(
      source,
      ["exerciseOrder", "exercise_order", "order"],
      fallbackOrder,
    ),

    targetSets: getNumberLike(
      source,
      ["targetSets", "target_sets", "sets"],
      3,
    ),

    repMin: getNumberLike(
      source,
      ["repMin", "rep_min", "minimumReps", "minimum_reps"],
      8,
    ),

    repMax: getNumberLike(
      source,
      ["repMax", "rep_max", "maximumReps", "maximum_reps", "reps"],
      12,
    ),

    restSeconds: getNumberLike(
      source,
      ["restSeconds", "rest_seconds", "rest"],
      90,
    ),

    tempo: getNullableString(source, ["tempo"]),

    rir:
      rawRir === "" || rawRir === undefined || rawRir === null
        ? null
        : rawRir,

    notes: getNullableString(source, ["notes", "description"]),
  };
}

/* =========================================================
   AUTHENTICATION, CACHE, PERMISSIONS
========================================================= */

async function requireUser(): Promise<{
  supabase: AppSupabaseClient;
  userId: string;
}> {
  const supabase = await createClient();

  if (!supabase) {
    throw new Error(
      "Supabase chưa được cấu hình. Hãy thêm NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", {
      cause: error,
    });
  }

  return { supabase, userId: user.id };
}

async function assertCanManageClient(
  supabase: AppSupabaseClient,
  clientId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("can_manage_workout_client", {
    target_client_id: clientId,
  });

  if (error) {
    throw new Error(
      `Không thể kiểm tra quyền workout: ${error.message}`,
      { cause: error },
    );
  }

  if (!data) {
    throw new Error(
      "Bạn không có quyền quản lý workout của người dùng này.",
    );
  }
}

async function getPlanClientId(
  supabase: AppSupabaseClient,
  planId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("workout_plans")
    .select("client_id")
    .eq("id", planId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Không tìm thấy workout plan.", {
      cause: error,
    });
  }

  return data.client_id;
}

async function getDayClientId(
  supabase: AppSupabaseClient,
  dayId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("workout_days")
    .select("workout_plan_id")
    .eq("id", dayId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Không tìm thấy workout day.", {
      cause: error,
    });
  }

  return getPlanClientId(supabase, data.workout_plan_id);
}

function invalidateWorkoutViews(sessionId?: string): void {
  // Next.js 16 read-your-writes for Server Actions
  updateTag(WORKOUT_CACHE_TAGS.plans);
  updateTag(WORKOUT_CACHE_TAGS.sessions);
  updateTag(WORKOUT_CACHE_TAGS.progress);

  revalidatePath("/dashboard/workouts");
  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/history");
  revalidatePath("/dashboard/progress");

  if (sessionId) {
    revalidatePath(`/dashboard/workouts/session/${sessionId}`);
    revalidatePath(`/dashboard/workout/${sessionId}`);
  }
}

async function deletePlanCascade(
  supabase: AppSupabaseClient,
  planId: string,
): Promise<void> {
  // ON DELETE CASCADE removes days + exercises.
  await supabase.from("workout_plans").delete().eq("id", planId);
}

/* =========================================================
   PLAN BUILDER ACTION
   Dùng trong features/workouts/plan-builder.tsx

   Nhận OBJECT, không nhận FormData.
========================================================= */

export async function createWorkoutPlanAction(
  input: CreateWorkoutPlanInput,
): Promise<PlanActionResult> {
  const parsedPlan = workoutPlanSchema.safeParse(normalizePlanInput(input));

  if (!parsedPlan.success) {
    return planFail(
      getValidationMessage(parsedPlan.error),
      z.flattenError(parsedPlan.error).fieldErrors,
    );
  }

  try {
    const { supabase, userId } = await requireUser();
    const clientId = parsedPlan.data.clientId ?? userId;

    await assertCanManageClient(supabase, clientId);

    const planRow = {
      client_id: clientId,
      created_by: userId,
      name: parsedPlan.data.name,
      description: emptyToNull(parsedPlan.data.description),
      goal: emptyToNull(parsedPlan.data.goal),
      weeks: parsedPlan.data.weeks,
      days_per_week: parsedPlan.data.daysPerWeek,
      session_duration_minutes: parsedPlan.data.sessionDurationMinutes,
      status: "draft",
    } satisfies WorkoutPlanInsert;

    /*
     * .insert() không tự trả lại row.
     * Cần .select("id").single() để lấy plan ID.
     */
    const { data: createdPlan, error: planError } = await supabase
      .from("workout_plans")
      .insert(planRow)
      .select("id")
      .single();

    if (planError || !createdPlan) {
      return planFail(
        getDatabaseMessage(
          "Không thể tạo workout plan",
          planError?.message ?? "Không nhận được workout plan ID.",
        ),
      );
    }

    const planId = createdPlan.id;
    const nestResult = await insertPlanDaysAndExercises(
      supabase,
      planId,
      parsedPlan.data,
    );

    if (!nestResult.success) {
      await deletePlanCascade(supabase, planId);
      return nestResult;
    }

    invalidateWorkoutViews();

    return planOk("Workout plan đã được tạo thành công.", planId);
  } catch (error) {
    console.error("createWorkoutPlanAction failed:", error);
    return planFail(toErrorMessage(error, "Không thể tạo workout plan."));
  }
}

async function insertPlanDaysAndExercises(
  supabase: AppSupabaseClient,
  planId: string,
  plan: ParsedWorkoutPlan,
): Promise<PlanActionResult> {
  for (let dayIndex = 0; dayIndex < plan.days.length; dayIndex += 1) {
    const parsedDay = workoutDaySchema.safeParse(
      normalizeDayInput(plan.days[dayIndex], dayIndex + 1),
    );

    if (!parsedDay.success) {
      return planFail(
        `Day ${dayIndex + 1}: ${getValidationMessage(parsedDay.error)}`,
      );
    }

    const dayResult = await insertWorkoutDayWithExercises(
      supabase,
      planId,
      parsedDay.data,
      dayIndex + 1,
    );

    if (!dayResult.success) return dayResult;
  }

  return { success: true, message: "ok" };
}

async function insertWorkoutDayWithExercises(
  supabase: AppSupabaseClient,
  planId: string,
  day: ParsedWorkoutDay,
  dayLabel: number,
): Promise<PlanActionResult> {
  const dayRow = {
    workout_plan_id: planId,
    day_number: day.dayNumber,
    name: day.name,
    focus: emptyToNull(day.focus),
    notes: emptyToNull(day.notes),
    rest_day: day.restDay,
  } satisfies WorkoutDayInsert;

  const { data: createdDay, error: dayError } = await supabase
    .from("workout_days")
    .insert(dayRow)
    .select("id")
    .single();

  if (dayError || !createdDay) {
    return planFail(
      getDatabaseMessage(
        `Không thể tạo Day ${dayLabel}`,
        dayError?.message ?? "Không nhận được workout day ID.",
      ),
    );
  }

  if (day.exercises.length === 0) {
    return { success: true, message: "ok" };
  }

  const exerciseRows: WorkoutExerciseInsert[] = [];

  for (
    let exerciseIndex = 0;
    exerciseIndex < day.exercises.length;
    exerciseIndex += 1
  ) {
    const parsedExercise = workoutExerciseSchema.safeParse(
      normalizeExerciseInput(day.exercises[exerciseIndex], exerciseIndex + 1),
    );

    if (!parsedExercise.success) {
      return planFail(
        `Day ${dayLabel}, exercise ${exerciseIndex + 1}: ${getValidationMessage(
          parsedExercise.error,
        )}`,
      );
    }

    exerciseRows.push(toExerciseInsert(createdDay.id, parsedExercise.data));
  }

  const { error: exerciseError } = await supabase
    .from("workout_exercises")
    .insert(exerciseRows);

  if (exerciseError) {
    return planFail(
      getDatabaseMessage(
        `Không thể tạo exercise`,
        exerciseError.message,
      ),
    );
  }

  return { success: true, message: "ok" };
}

function toExerciseInsert(
  workoutDayId: string,
  exercise: ParsedWorkoutExercise,
): WorkoutExerciseInsert {
  return {
    workout_day_id: workoutDayId,
    exercise_id: exercise.exerciseId,
    exercise_name: exercise.exerciseName,
    exercise_order: exercise.exerciseOrder,
    target_sets: exercise.targetSets,
    rep_min: exercise.repMin,
    rep_max: exercise.repMax,
    rest_seconds: exercise.restSeconds,
    tempo: emptyToNull(exercise.tempo),
    rir: exercise.rir ?? null,
    notes: emptyToNull(exercise.notes),
  };
}

/* =========================================================
   FORM WRAPPER
   Dùng trong app/dashboard/workouts/page.tsx

   Nhận FormData và trả Promise<void>.
========================================================= */

export async function createWorkoutPlanFormAction(
  formData: FormData,
): Promise<void> {
  const result = await createWorkoutPlanAction({
    clientId: getFormString(formData, "client_id"),
    name: getFormString(formData, "name"),
    description: getFormString(formData, "description"),
    goal: getFormString(formData, "goal"),
    weeks: getFormString(formData, "weeks"),
    daysPerWeek: getFormString(formData, "days_per_week"),
    sessionDurationMinutes: getFormString(
      formData,
      "session_duration_minutes",
    ),
    days: [],
  });

  if (!result.success) {
    throw new Error(result.message);
  }
}

/* =========================================================
   CREATE WORKOUT DAY
========================================================= */

export async function createWorkoutDayAction(
  formData: FormData,
): Promise<void> {
  const planId = getFormString(formData, "workout_plan_id");
  const parsedPlanId = uuidSchema.safeParse(planId);

  if (!parsedPlanId.success) {
    throw new Error("Workout plan ID không hợp lệ.");
  }

  const parsedDay = workoutDaySchema.safeParse({
    dayNumber: getFormString(formData, "day_number"),
    name: getFormString(formData, "name"),
    focus: getFormString(formData, "focus"),
    notes: getFormString(formData, "notes"),
    restDay: formData.get("rest_day") === "on",
    exercises: [],
  });

  if (!parsedDay.success) {
    throw new Error(getValidationMessage(parsedDay.error));
  }

  const { supabase } = await requireUser();
  const clientId = await getPlanClientId(supabase, parsedPlanId.data);
  await assertCanManageClient(supabase, clientId);

  const dayRow = {
    workout_plan_id: parsedPlanId.data,
    day_number: parsedDay.data.dayNumber,
    name: parsedDay.data.name,
    focus: emptyToNull(parsedDay.data.focus),
    notes: emptyToNull(parsedDay.data.notes),
    rest_day: parsedDay.data.restDay,
  } satisfies WorkoutDayInsert;

  const { error } = await supabase.from("workout_days").insert(dayRow);

  if (error) {
    throw new Error(
      getDatabaseMessage("Không thể tạo workout day", error.message),
      { cause: error },
    );
  }

  invalidateWorkoutViews();
}

/* =========================================================
   CREATE WORKOUT EXERCISE
========================================================= */

export async function createWorkoutExerciseAction(
  formData: FormData,
): Promise<void> {
  const workoutDayId = getFormString(formData, "workout_day_id");
  const parsedDayId = uuidSchema.safeParse(workoutDayId);

  if (!parsedDayId.success) {
    throw new Error("Workout day ID không hợp lệ.");
  }

  const rawRir = getFormString(formData, "rir");

  const parsedExercise = workoutExerciseSchema.safeParse({
    exerciseId: null,
    exerciseName: getFormString(formData, "exercise_name"),
    exerciseOrder: getFormString(formData, "exercise_order"),
    targetSets: getFormString(formData, "target_sets"),
    repMin: getFormString(formData, "rep_min"),
    repMax: getFormString(formData, "rep_max"),
    restSeconds: getFormString(formData, "rest_seconds"),
    tempo: getFormString(formData, "tempo"),
    rir: rawRir === "" ? null : rawRir,
    notes: getFormString(formData, "notes"),
  });

  if (!parsedExercise.success) {
    throw new Error(getValidationMessage(parsedExercise.error));
  }

  const { supabase } = await requireUser();
  const clientId = await getDayClientId(supabase, parsedDayId.data);
  await assertCanManageClient(supabase, clientId);

  const { error } = await supabase
    .from("workout_exercises")
    .insert(toExerciseInsert(parsedDayId.data, parsedExercise.data));

  if (error) {
    throw new Error(
      getDatabaseMessage("Không thể thêm bài tập", error.message),
      { cause: error },
    );
  }

  invalidateWorkoutViews();
}

/* =========================================================
   ACTIVATE / ARCHIVE / DELETE
========================================================= */

async function mutatePlanStatus(
  formData: FormData,
  status: "active" | "archived",
  failurePrefix: string,
): Promise<void> {
  const parsedPlanId = uuidSchema.safeParse(
    getFormString(formData, "plan_id"),
  );

  if (!parsedPlanId.success) {
    throw new Error("Workout plan ID không hợp lệ.");
  }

  const { supabase } = await requireUser();
  const clientId = await getPlanClientId(supabase, parsedPlanId.data);
  await assertCanManageClient(supabase, clientId);

  if (status === "active") {
    const { error: archiveError } = await supabase
      .from("workout_plans")
      .update({ status: "archived" })
      .eq("client_id", clientId)
      .eq("status", "active")
      .neq("id", parsedPlanId.data);

    if (archiveError) {
      throw new Error(
        `Không thể archive plan cũ: ${archiveError.message}`,
        { cause: archiveError },
      );
    }
  }

  const { error } = await supabase
    .from("workout_plans")
    .update({ status })
    .eq("id", parsedPlanId.data);

  if (error) {
    throw new Error(`${failurePrefix}: ${error.message}`, { cause: error });
  }

  invalidateWorkoutViews();
}

export async function activateWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  await mutatePlanStatus(
    formData,
    "active",
    "Không thể kích hoạt workout plan",
  );
}

export async function archiveWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  await mutatePlanStatus(
    formData,
    "archived",
    "Không thể archive workout plan",
  );
}

export async function deleteWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsedPlanId = uuidSchema.safeParse(
    getFormString(formData, "plan_id"),
  );

  if (!parsedPlanId.success) {
    throw new Error("Workout plan ID không hợp lệ.");
  }

  const { supabase } = await requireUser();
  const clientId = await getPlanClientId(supabase, parsedPlanId.data);
  await assertCanManageClient(supabase, clientId);

  const { error } = await supabase
    .from("workout_plans")
    .delete()
    .eq("id", parsedPlanId.data);

  if (error) {
    throw new Error(`Không thể xóa workout plan: ${error.message}`, {
      cause: error,
    });
  }

  invalidateWorkoutViews();
}

export async function deleteWorkoutDayAction(
  formData: FormData,
): Promise<void> {
  const parsedDayId = uuidSchema.safeParse(getFormString(formData, "day_id"));

  if (!parsedDayId.success) {
    throw new Error("Workout day ID không hợp lệ.");
  }

  const { supabase } = await requireUser();
  const clientId = await getDayClientId(supabase, parsedDayId.data);
  await assertCanManageClient(supabase, clientId);

  const { error } = await supabase
    .from("workout_days")
    .delete()
    .eq("id", parsedDayId.data);

  if (error) {
    throw new Error(`Không thể xóa workout day: ${error.message}`, {
      cause: error,
    });
  }

  invalidateWorkoutViews();
}

export async function deleteWorkoutExerciseAction(
  formData: FormData,
): Promise<void> {
  const parsedExerciseId = uuidSchema.safeParse(
    getFormString(formData, "exercise_id"),
  );

  if (!parsedExerciseId.success) {
    throw new Error("Workout exercise ID không hợp lệ.");
  }

  const { supabase } = await requireUser();

  const { data: exercise, error: findError } = await supabase
    .from("workout_exercises")
    .select("workout_day_id")
    .eq("id", parsedExerciseId.data)
    .single();

  if (findError || !exercise) {
    throw new Error(findError?.message ?? "Không tìm thấy bài tập.", {
      cause: findError,
    });
  }

  const clientId = await getDayClientId(supabase, exercise.workout_day_id);
  await assertCanManageClient(supabase, clientId);

  const { error } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", parsedExerciseId.data);

  if (error) {
    throw new Error(`Không thể xóa bài tập: ${error.message}`, {
      cause: error,
    });
  }

  invalidateWorkoutViews();
}

/* =========================================================
   WORKOUT PLAYER HELPERS
========================================================= */

function mergeActionArguments(args: unknown[]): UnknownRecord {
  if (args.length === 1 && isRecord(args[0])) {
    return { ...args[0], args };
  }

  const payload: UnknownRecord = { args };

  args.forEach((value, index) => {
    payload[`arg${index}`] = value;
  });

  return payload;
}

function findSessionId(payload: UnknownRecord): string | null {
  const directSessionId = getString(payload, [
    "sessionId",
    "session_id",
    "workoutSessionId",
    "workout_session_id",
  ]);

  if (directSessionId) return directSessionId;

  const actionArguments = Array.isArray(payload.args) ? payload.args : [];

  for (const argument of actionArguments) {
    if (!isRecord(argument)) continue;

    const nestedSessionId = getString(argument, [
      "sessionId",
      "session_id",
      "workoutSessionId",
      "workout_session_id",
    ]);

    if (nestedSessionId) return nestedSessionId;
  }

  for (const argument of actionArguments) {
    if (
      typeof argument === "string" &&
      uuidSchema.safeParse(argument).success
    ) {
      return argument;
    }
  }

  return null;
}

async function getApplicationOrigin(): Promise<string> {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

  if (configuredUrl) return configuredUrl;

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!host) {
    throw new Error(
      "Không xác định được application URL. Hãy thêm NEXT_PUBLIC_SITE_URL vào .env.local.",
    );
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

async function callWorkoutSessionApi(
  sessionId: string,
  endpoint: (typeof SESSION_API)[keyof typeof SESSION_API],
  actionName: (typeof PLAYER_ACTIONS)[keyof typeof PLAYER_ACTIONS],
  payload: UnknownRecord,
): Promise<WorkoutPlayerActionResult> {
  try {
    const requestHeaders = await headers();
    const origin = await getApplicationOrigin();
    const cookie = requestHeaders.get("cookie");

    const response = await fetch(
      `${origin}/api/sessions/${encodeURIComponent(sessionId)}/${endpoint}`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify({
          ...payload,
          action: actionName,
          type: actionName,
          sessionId,
          session_id: sessionId,
        }),
      },
    );

    const responseBody: unknown = await response.json().catch(() => null);
    const responseRecord = isRecord(responseBody) ? responseBody : {};

    const message =
      getString(responseRecord, ["message", "error", "detail"]) ??
      (response.ok
        ? "Workout đã được cập nhật."
        : "Không thể cập nhật workout.");

    if (!response.ok) {
      return playerFail(message, responseBody);
    }

    invalidateWorkoutViews(sessionId);
    return playerOk(message, responseBody);
  } catch (error) {
    console.error(`Workout action ${actionName} failed:`, error);
    return playerFail(
      toErrorMessage(error, "Không thể kết nối tới Workout API."),
    );
  }
}

async function runPlayerAction(
  actionName: (typeof PLAYER_ACTIONS)[keyof typeof PLAYER_ACTIONS],
  endpoint: (typeof SESSION_API)[keyof typeof SESSION_API],
  args: unknown[],
): Promise<WorkoutPlayerActionResult> {
  const payload = mergeActionArguments(args);
  const sessionId = findSessionId(payload);

  if (!sessionId) {
    return playerFail("Không tìm thấy workout session ID.");
  }

  return callWorkoutSessionApi(sessionId, endpoint, actionName, payload);
}

/* =========================================================
   EXPORTS REQUIRED BY workout-player.tsx
========================================================= */

export async function finishWorkoutAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  return runPlayerAction(
    PLAYER_ACTIONS.finish,
    SESSION_API.actions,
    args,
  );
}

export async function replaceSessionExerciseAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  return runPlayerAction(
    PLAYER_ACTIONS.replace,
    SESSION_API.actions,
    args,
  );
}

export async function saveWorkoutSetAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  return runPlayerAction(
    PLAYER_ACTIONS.saveSet,
    SESSION_API.progress,
    args,
  );
}

export async function skipSessionExerciseAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  return runPlayerAction(
    PLAYER_ACTIONS.skip,
    SESSION_API.actions,
    args,
  );
}
