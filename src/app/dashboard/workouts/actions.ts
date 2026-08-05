"use server";

import { headers } from "next/headers";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

/* =========================================================
   SHARED TYPES
========================================================= */

type AppSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type UnknownRecord = Record<string, unknown>;

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

const CACHE_TAG = {
  workouts: "workouts",
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

/* =========================================================
   VALUE HELPERS
========================================================= */

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

    if (typeof value === "boolean") {
      return value;
    }

    if (value === "true" || value === "on" || value === 1) {
      return true;
    }

    if (value === "false" || value === "off" || value === 0) {
      return false;
    }
  }

  return fallback;
}

function getArray(
  source: UnknownRecord,
  keys: readonly string[],
): unknown[] {
  for (const key of keys) {
    const value = source[key];

    if (Array.isArray(value)) {
      return value;
    }
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

function revalidateWorkouts(sessionId?: string): void {
  // Next.js 16 Server Action read-your-writes
  updateTag(CACHE_TAG.workouts);
  revalidatePath("/dashboard/workouts");

  if (sessionId) {
    revalidatePath(`/dashboard/workouts/session/${sessionId}`);
  }
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
   AUTHENTICATION AND PERMISSIONS
========================================================= */

async function requireUser(): Promise<{
  supabase: AppSupabaseClient;
  userId: string;
}> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", {
      cause: error,
    });
  }

  return {
    supabase,
    userId: user.id,
  };
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
    return {
      success: false,
      message: getValidationMessage(parsedPlan.error),
      fieldErrors: z.flattenError(parsedPlan.error).fieldErrors,
    };
  }

  try {
    const { supabase, userId } = await requireUser();

    const clientId = parsedPlan.data.clientId ?? userId;

    await assertCanManageClient(supabase, clientId);

    /*
     * .insert() không tự trả lại row.
     * Cần .select("id").single() để lấy plan ID.
     */
    const { data: createdPlan, error: planError } = await supabase
      .from("workout_plans")
      .insert({
        client_id: clientId,
        created_by: userId,
        name: parsedPlan.data.name,
        description: emptyToNull(parsedPlan.data.description),
        goal: emptyToNull(parsedPlan.data.goal),
        weeks: parsedPlan.data.weeks,
        days_per_week: parsedPlan.data.daysPerWeek,
        session_duration_minutes: parsedPlan.data.sessionDurationMinutes,
        status: "draft",
      })
      .select("id")
      .single();

    if (planError || !createdPlan) {
      return {
        success: false,
        message: getDatabaseMessage(
          "Không thể tạo workout plan",
          planError?.message ?? "Không nhận được workout plan ID.",
        ),
      };
    }

    const planId = createdPlan.id;

    /*
     * Nếu PlanBuilder gửi kèm ngày tập và bài tập,
     * tạo toàn bộ trong một lần.
     */
    for (
      let dayIndex = 0;
      dayIndex < parsedPlan.data.days.length;
      dayIndex += 1
    ) {
      const parsedDay = workoutDaySchema.safeParse(
        normalizeDayInput(parsedPlan.data.days[dayIndex], dayIndex + 1),
      );

      if (!parsedDay.success) {
        /*
         * Xóa plan nếu một ngày tập không hợp lệ.
         * ON DELETE CASCADE sẽ xóa dữ liệu con.
         */
        await supabase.from("workout_plans").delete().eq("id", planId);

        return {
          success: false,
          message: `Day ${dayIndex + 1}: ${getValidationMessage(
            parsedDay.error,
          )}`,
        };
      }

      const { data: createdDay, error: dayError } = await supabase
        .from("workout_days")
        .insert({
          workout_plan_id: planId,
          day_number: parsedDay.data.dayNumber,
          name: parsedDay.data.name,
          focus: emptyToNull(parsedDay.data.focus),
          notes: emptyToNull(parsedDay.data.notes),
          rest_day: parsedDay.data.restDay,
        })
        .select("id")
        .single();

      if (dayError || !createdDay) {
        await supabase.from("workout_plans").delete().eq("id", planId);

        return {
          success: false,
          message: getDatabaseMessage(
            `Không thể tạo Day ${dayIndex + 1}`,
            dayError?.message ?? "Không nhận được workout day ID.",
          ),
        };
      }

      for (
        let exerciseIndex = 0;
        exerciseIndex < parsedDay.data.exercises.length;
        exerciseIndex += 1
      ) {
        const parsedExercise = workoutExerciseSchema.safeParse(
          normalizeExerciseInput(
            parsedDay.data.exercises[exerciseIndex],
            exerciseIndex + 1,
          ),
        );

        if (!parsedExercise.success) {
          await supabase.from("workout_plans").delete().eq("id", planId);

          return {
            success: false,
            message: `Day ${dayIndex + 1}, exercise ${
              exerciseIndex + 1
            }: ${getValidationMessage(parsedExercise.error)}`,
          };
        }

        const { error: exerciseError } = await supabase
          .from("workout_exercises")
          .insert({
            workout_day_id: createdDay.id,
            exercise_id: parsedExercise.data.exerciseId,
            exercise_name: parsedExercise.data.exerciseName,
            exercise_order: parsedExercise.data.exerciseOrder,
            target_sets: parsedExercise.data.targetSets,
            rep_min: parsedExercise.data.repMin,
            rep_max: parsedExercise.data.repMax,
            rest_seconds: parsedExercise.data.restSeconds,
            tempo: emptyToNull(parsedExercise.data.tempo),
            rir: parsedExercise.data.rir ?? null,
            notes: emptyToNull(parsedExercise.data.notes),
          });

        if (exerciseError) {
          await supabase.from("workout_plans").delete().eq("id", planId);

          return {
            success: false,
            message: getDatabaseMessage(
              `Không thể tạo exercise ${exerciseIndex + 1}`,
              exerciseError.message,
            ),
          };
        }
      }
    }

    revalidateWorkouts();

    return {
      success: true,
      message: "Workout plan đã được tạo thành công.",
      planId,
    };
  } catch (error) {
    console.error("createWorkoutPlanAction failed:", error);

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Không thể tạo workout plan.",
    };
  }
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

  const { error } = await supabase.from("workout_days").insert({
    workout_plan_id: parsedPlanId.data,
    day_number: parsedDay.data.dayNumber,
    name: parsedDay.data.name,
    focus: emptyToNull(parsedDay.data.focus),
    notes: emptyToNull(parsedDay.data.notes),
    rest_day: parsedDay.data.restDay,
  });

  if (error) {
    throw new Error(
      getDatabaseMessage("Không thể tạo workout day", error.message),
      { cause: error },
    );
  }

  revalidateWorkouts();
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

  const { error } = await supabase.from("workout_exercises").insert({
    workout_day_id: parsedDayId.data,
    exercise_id: parsedExercise.data.exerciseId,
    exercise_name: parsedExercise.data.exerciseName,
    exercise_order: parsedExercise.data.exerciseOrder,
    target_sets: parsedExercise.data.targetSets,
    rep_min: parsedExercise.data.repMin,
    rep_max: parsedExercise.data.repMax,
    rest_seconds: parsedExercise.data.restSeconds,
    tempo: emptyToNull(parsedExercise.data.tempo),
    rir: parsedExercise.data.rir ?? null,
    notes: emptyToNull(parsedExercise.data.notes),
  });

  if (error) {
    throw new Error(
      getDatabaseMessage("Không thể thêm bài tập", error.message),
      { cause: error },
    );
  }

  revalidateWorkouts();
}

/* =========================================================
   ACTIVATE PLAN
========================================================= */

export async function activateWorkoutPlanAction(
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

  const { error } = await supabase
    .from("workout_plans")
    .update({ status: "active" })
    .eq("id", parsedPlanId.data);

  if (error) {
    throw new Error(
      `Không thể kích hoạt workout plan: ${error.message}`,
      { cause: error },
    );
  }

  revalidateWorkouts();
}

/* =========================================================
   ARCHIVE PLAN
========================================================= */

export async function archiveWorkoutPlanAction(
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
    .update({ status: "archived" })
    .eq("id", parsedPlanId.data);

  if (error) {
    throw new Error(
      `Không thể archive workout plan: ${error.message}`,
      { cause: error },
    );
  }

  revalidateWorkouts();
}

/* =========================================================
   DELETE PLAN
========================================================= */

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

  revalidateWorkouts();
}

/* =========================================================
   DELETE WORKOUT DAY
========================================================= */

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

  revalidateWorkouts();
}

/* =========================================================
   DELETE WORKOUT EXERCISE
========================================================= */

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

  revalidateWorkouts();
}

/* =========================================================
   WORKOUT PLAYER HELPERS
========================================================= */

function mergeActionArguments(args: unknown[]): UnknownRecord {
  if (args.length === 1 && isRecord(args[0])) {
    return {
      ...args[0],
      args,
    };
  }

  const payload: UnknownRecord = {
    args,
  };

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

  if (directSessionId) {
    return directSessionId;
  }

  const actionArguments = Array.isArray(payload.args) ? payload.args : [];

  /*
   * Tìm sessionId trong object trước.
   */
  for (const argument of actionArguments) {
    if (!isRecord(argument)) {
      continue;
    }

    const nestedSessionId = getString(argument, [
      "sessionId",
      "session_id",
      "workoutSessionId",
      "workout_session_id",
    ]);

    if (nestedSessionId) {
      return nestedSessionId;
    }
  }

  /*
   * Sau đó mới tìm UUID được truyền trực tiếp.
   */
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

  if (configuredUrl) {
    return configuredUrl;
  }

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
  endpoint: "actions" | "progress",
  actionName: string,
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
          ...(cookie
            ? {
                Cookie: cookie,
              }
            : {}),
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
      return {
        success: false,
        message,
        data: responseBody,
      };
    }

    revalidateWorkouts(sessionId);

    return {
      success: true,
      message,
      data: responseBody,
    };
  } catch (error) {
    console.error(`Workout action ${actionName} failed:`, error);

    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Không thể kết nối tới Workout API.",
    };
  }
}

/* =========================================================
   EXPORTS REQUIRED BY workout-player.tsx
========================================================= */

export async function finishWorkoutAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  const payload = mergeActionArguments(args);
  const sessionId = findSessionId(payload);

  if (!sessionId) {
    return {
      success: false,
      message: "Không tìm thấy workout session ID.",
    };
  }

  return callWorkoutSessionApi(
    sessionId,
    "actions",
    "finish_workout",
    payload,
  );
}

export async function replaceSessionExerciseAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  const payload = mergeActionArguments(args);
  const sessionId = findSessionId(payload);

  if (!sessionId) {
    return {
      success: false,
      message: "Không tìm thấy workout session ID.",
    };
  }

  return callWorkoutSessionApi(
    sessionId,
    "actions",
    "replace_exercise",
    payload,
  );
}

export async function saveWorkoutSetAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  const payload = mergeActionArguments(args);
  const sessionId = findSessionId(payload);

  if (!sessionId) {
    return {
      success: false,
      message: "Không tìm thấy workout session ID.",
    };
  }

  return callWorkoutSessionApi(sessionId, "progress", "save_set", payload);
}

export async function skipSessionExerciseAction(
  ...args: unknown[]
): Promise<WorkoutPlayerActionResult> {
  const payload = mergeActionArguments(args);
  const sessionId = findSessionId(payload);

  if (!sessionId) {
    return {
      success: false,
      message: "Không tìm thấy workout session ID.",
    };
  }

  return callWorkoutSessionApi(
    sessionId,
    "actions",
    "skip_exercise",
    payload,
  );
}
