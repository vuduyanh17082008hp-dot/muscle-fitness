"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/database.types";
import { createClient } from "@/lib/supabase/server";

type AppSupabaseClient =
  SupabaseClient<Database>;

const uuidSchema = z
  .string()
  .uuid("ID không hợp lệ.");

const optionalText = (
  maximumLength: number,
) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) =>
      value.length > 0 ? value : null,
    );

const optionalInteger = (
  minimum: number,
  maximum: number,
) =>
  z.preprocess(
    (value) => {
      if (
        value === "" ||
        value === null ||
        value === undefined
      ) {
        return null;
      }

      return value;
    },
    z
      .coerce
      .number()
      .int()
      .min(minimum)
      .max(maximum)
      .nullable(),
  );

const createPlanSchema = z.object({
  client_id: uuidSchema,

  name: z
    .string()
    .trim()
    .min(
      2,
      "Tên plan phải có ít nhất 2 ký tự.",
    )
    .max(120),

  description: optionalText(2000),

  goal: optionalText(500),

  weeks: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(52),

  days_per_week: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(7),

  session_duration_minutes: z
    .coerce
    .number()
    .int()
    .min(15)
    .max(300),
});

const createDaySchema = z.object({
  workout_plan_id: uuidSchema,

  day_number: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(7),

  name: z
    .string()
    .trim()
    .min(
      2,
      "Tên ngày tập phải có ít nhất 2 ký tự.",
    )
    .max(120),

  focus: optionalText(300),

  notes: optionalText(2000),

  rest_day: z.boolean(),
});

const createExerciseSchema = z
  .object({
    workout_day_id: uuidSchema,

    exercise_name: z
      .string()
      .trim()
      .min(
        2,
        "Tên bài tập phải có ít nhất 2 ký tự.",
      )
      .max(160),

    exercise_order: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(100),

    target_sets: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(20),

    rep_min: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(100),

    rep_max: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(100),

    rest_seconds: z
      .coerce
      .number()
      .int()
      .min(0)
      .max(900),

    tempo: optionalText(30),

    rir: optionalInteger(0, 5),

    notes: optionalText(1000),
  })
  .superRefine((value, context) => {
    if (value.rep_max < value.rep_min) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rep_max"],
        message:
          "Rep tối đa không được nhỏ hơn rep tối thiểu.",
      });
    }
  });

function getValidationMessage(
  error: z.ZodError,
): string {
  return (
    error.issues[0]?.message ??
    "Dữ liệu không hợp lệ."
  );
}

function getDatabaseMessage(
  context: string,
  message: string,
): string {
  if (
    message.includes(
      "workout_days_plan_day_unique",
    )
  ) {
    return "Ngày tập này đã tồn tại trong plan.";
  }

  if (
    message.includes(
      "workout_exercises_day_order_unique",
    )
  ) {
    return "Thứ tự bài tập này đã tồn tại trong ngày tập.";
  }

  return `${context}: ${message}`;
}

async function requireAuthenticatedUser(): Promise<{
  supabase: AppSupabaseClient;
  userId: string;
}> {
  const supabase = await createClient();

  const {
    data,
    error,
  } = await supabase.auth.getClaims();

  const userId = data?.claims?.sub;

  if (error || !userId) {
    throw new Error(
      "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
    );
  }

  return {
    supabase,
    userId,
  };
}

async function assertCanManageClient(
  supabase: AppSupabaseClient,
  clientId: string,
): Promise<void> {
  const {
    data,
    error,
  } = await supabase.rpc(
    "can_manage_workout_client",
    {
      target_client_id: clientId,
    },
  );

  if (error) {
    throw new Error(
      `Không thể kiểm tra quyền truy cập: ${error.message}`,
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
  const {
    data,
    error,
  } = await supabase
    .from("workout_plans")
    .select("client_id")
    .eq("id", planId)
    .single();

  if (error || !data) {
    throw new Error(
      `Không tìm thấy workout plan: ${
        error?.message ??
        "Plan không tồn tại."
      }`,
    );
  }

  return data.client_id;
}

async function getDayClientId(
  supabase: AppSupabaseClient,
  dayId: string,
): Promise<string> {
  const {
    data: day,
    error: dayError,
  } = await supabase
    .from("workout_days")
    .select("workout_plan_id")
    .eq("id", dayId)
    .single();

  if (dayError || !day) {
    throw new Error(
      `Không tìm thấy ngày tập: ${
        dayError?.message ??
        "Ngày tập không tồn tại."
      }`,
    );
  }

  return getPlanClientId(
    supabase,
    day.workout_plan_id,
  );
}

export async function createWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsed = createPlanSchema.safeParse({
    client_id:
      formData.get("client_id"),

    name:
      formData.get("name"),

    description:
      formData.get("description") ?? "",

    goal:
      formData.get("goal") ?? "",

    weeks:
      formData.get("weeks"),

    days_per_week:
      formData.get("days_per_week"),

    session_duration_minutes:
      formData.get(
        "session_duration_minutes",
      ),
  });

  if (!parsed.success) {
    throw new Error(
      getValidationMessage(parsed.error),
    );
  }

  const {
    supabase,
    userId,
  } = await requireAuthenticatedUser();

  await assertCanManageClient(
    supabase,
    parsed.data.client_id,
  );

  const {
    error,
  } = await supabase
    .from("workout_plans")
    .insert({
      client_id:
        parsed.data.client_id,

      created_by:
        userId,

      name:
        parsed.data.name,

      description:
        parsed.data.description,

      goal:
        parsed.data.goal,

      weeks:
        parsed.data.weeks,

      days_per_week:
        parsed.data.days_per_week,

      session_duration_minutes:
        parsed.data
          .session_duration_minutes,

      status:
        "draft",
    });

  if (error) {
    throw new Error(
      getDatabaseMessage(
        "Không thể tạo workout plan",
        error.message,
      ),
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function createWorkoutDayAction(
  formData: FormData,
): Promise<void> {
  const parsed = createDaySchema.safeParse({
    workout_plan_id:
      formData.get("workout_plan_id"),

    day_number:
      formData.get("day_number"),

    name:
      formData.get("name"),

    focus:
      formData.get("focus") ?? "",

    notes:
      formData.get("notes") ?? "",

    rest_day:
      formData.get("rest_day") ===
      "on",
  });

  if (!parsed.success) {
    throw new Error(
      getValidationMessage(parsed.error),
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const clientId =
    await getPlanClientId(
      supabase,
      parsed.data.workout_plan_id,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error,
  } = await supabase
    .from("workout_days")
    .insert({
      workout_plan_id:
        parsed.data.workout_plan_id,

      day_number:
        parsed.data.day_number,

      name:
        parsed.data.name,

      focus:
        parsed.data.focus,

      notes:
        parsed.data.notes,

      rest_day:
        parsed.data.rest_day,
    });

  if (error) {
    throw new Error(
      getDatabaseMessage(
        "Không thể tạo ngày tập",
        error.message,
      ),
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function createWorkoutExerciseAction(
  formData: FormData,
): Promise<void> {
  const parsed =
    createExerciseSchema.safeParse({
      workout_day_id:
        formData.get("workout_day_id"),

      exercise_name:
        formData.get("exercise_name"),

      exercise_order:
        formData.get("exercise_order"),

      target_sets:
        formData.get("target_sets"),

      rep_min:
        formData.get("rep_min"),

      rep_max:
        formData.get("rep_max"),

      rest_seconds:
        formData.get("rest_seconds"),

      tempo:
        formData.get("tempo") ?? "",

      rir:
        formData.get("rir"),

      notes:
        formData.get("notes") ?? "",
    });

  if (!parsed.success) {
    throw new Error(
      getValidationMessage(parsed.error),
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const clientId =
    await getDayClientId(
      supabase,
      parsed.data.workout_day_id,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error,
  } = await supabase
    .from("workout_exercises")
    .insert({
      workout_day_id:
        parsed.data.workout_day_id,

      exercise_id:
        null,

      exercise_name:
        parsed.data.exercise_name,

      exercise_order:
        parsed.data.exercise_order,

      target_sets:
        parsed.data.target_sets,

      rep_min:
        parsed.data.rep_min,

      rep_max:
        parsed.data.rep_max,

      rest_seconds:
        parsed.data.rest_seconds,

      tempo:
        parsed.data.tempo,

      rir:
        parsed.data.rir,

      notes:
        parsed.data.notes,
    });

  if (error) {
    throw new Error(
      getDatabaseMessage(
        "Không thể thêm bài tập",
        error.message,
      ),
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function activateWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsed = uuidSchema.safeParse(
    formData.get("plan_id"),
  );

  if (!parsed.success) {
    throw new Error(
      "Workout plan ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const clientId =
    await getPlanClientId(
      supabase,
      parsed.data,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error: archiveError,
  } = await supabase
    .from("workout_plans")
    .update({
      status: "archived",
    })
    .eq("client_id", clientId)
    .eq("status", "active")
    .neq("id", parsed.data);

  if (archiveError) {
    throw new Error(
      `Không thể archive plan cũ: ${archiveError.message}`,
    );
  }

  const {
    error,
  } = await supabase
    .from("workout_plans")
    .update({
      status: "active",
    })
    .eq("id", parsed.data);

  if (error) {
    throw new Error(
      `Không thể kích hoạt plan: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function archiveWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsed = uuidSchema.safeParse(
    formData.get("plan_id"),
  );

  if (!parsed.success) {
    throw new Error(
      "Workout plan ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const clientId =
    await getPlanClientId(
      supabase,
      parsed.data,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error,
  } = await supabase
    .from("workout_plans")
    .update({
      status: "archived",
    })
    .eq("id", parsed.data);

  if (error) {
    throw new Error(
      `Không thể archive workout plan: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function deleteWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsed = uuidSchema.safeParse(
    formData.get("plan_id"),
  );

  if (!parsed.success) {
    throw new Error(
      "Workout plan ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const clientId =
    await getPlanClientId(
      supabase,
      parsed.data,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error,
  } = await supabase
    .from("workout_plans")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    throw new Error(
      `Không thể xóa workout plan: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function deleteWorkoutDayAction(
  formData: FormData,
): Promise<void> {
  const parsed = uuidSchema.safeParse(
    formData.get("day_id"),
  );

  if (!parsed.success) {
    throw new Error(
      "Workout day ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const clientId =
    await getDayClientId(
      supabase,
      parsed.data,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error,
  } = await supabase
    .from("workout_days")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    throw new Error(
      `Không thể xóa ngày tập: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function deleteWorkoutExerciseAction(
  formData: FormData,
): Promise<void> {
  const parsed = uuidSchema.safeParse(
    formData.get("exercise_id"),
  );

  if (!parsed.success) {
    throw new Error(
      "Workout exercise ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireAuthenticatedUser();

  const {
    data: exercise,
    error: exerciseError,
  } = await supabase
    .from("workout_exercises")
    .select("workout_day_id")
    .eq("id", parsed.data)
    .single();

  if (
    exerciseError ||
    !exercise
  ) {
    throw new Error(
      `Không tìm thấy bài tập: ${
        exerciseError?.message ??
        "Bài tập không tồn tại."
      }`,
    );
  }

  const clientId =
    await getDayClientId(
      supabase,
      exercise.workout_day_id,
    );

  await assertCanManageClient(
    supabase,
    clientId,
  );

  const {
    error,
  } = await supabase
    .from("workout_exercises")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    throw new Error(
      `Không thể xóa bài tập: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}