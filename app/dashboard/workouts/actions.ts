"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

type AppSupabaseClient =
  Awaited<ReturnType<typeof createClient>>;

const uuidSchema = z
  .string()
  .uuid("ID không hợp lệ.");

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

  description: z
    .string()
    .trim()
    .max(2000)
    .transform((value) =>
      value.length > 0 ? value : null,
    ),

  goal: z
    .string()
    .trim()
    .max(500)
    .transform((value) =>
      value.length > 0 ? value : null,
    ),

  weeks: z.coerce
    .number()
    .int()
    .min(1)
    .max(52),

  days_per_week: z.coerce
    .number()
    .int()
    .min(1)
    .max(7),

  session_duration_minutes:
    z.coerce
      .number()
      .int()
      .min(15)
      .max(300),
});

const createDaySchema = z.object({
  workout_plan_id: uuidSchema,

  day_number: z.coerce
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

  focus: z
    .string()
    .trim()
    .max(300)
    .transform((value) =>
      value.length > 0 ? value : null,
    ),

  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((value) =>
      value.length > 0 ? value : null,
    ),

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

    exercise_order: z.coerce
      .number()
      .int()
      .min(1)
      .max(100),

    target_sets: z.coerce
      .number()
      .int()
      .min(1)
      .max(20),

    rep_min: z.coerce
      .number()
      .int()
      .min(1)
      .max(100),

    rep_max: z.coerce
      .number()
      .int()
      .min(1)
      .max(100),

    rest_seconds: z.coerce
      .number()
      .int()
      .min(0)
      .max(900),

    tempo: z
      .string()
      .trim()
      .max(30)
      .transform((value) =>
        value.length > 0
          ? value
          : null,
      ),

    rir: z
      .union([
        z.literal(""),
        z.coerce
          .number()
          .int()
          .min(0)
          .max(5),
      ])
      .transform((value) =>
        value === "" ? null : value,
      ),

    notes: z
      .string()
      .trim()
      .max(1000)
      .transform((value) =>
        value.length > 0
          ? value
          : null,
      ),
  })
  .superRefine(
    (value, context) => {
      if (
        value.rep_max <
        value.rep_min
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,

          path: ["rep_max"],

          message:
            "Rep tối đa không được nhỏ hơn rep tối thiểu.",
        });
      }
    },
  );

function getFormValue(
  formData: FormData,
  key: string,
): string {
  const value = formData.get(key);

  return typeof value === "string"
    ? value
    : "";
}

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

async function requireUser(): Promise<{
  supabase: AppSupabaseClient;
  userId: string;
}> {
  const supabase =
    await createClient();

  const {
    data: {
      user,
    },
    error,
  } =
    await supabase.auth.getUser();

  if (
    error ||
    !user
  ) {
    throw new Error(
      "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
    );
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
  const {
    data,
    error,
  } = await supabase.rpc(
    "can_manage_workout_client",
    {
      target_client_id:
        clientId,
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

  if (
    error ||
    !data
  ) {
    throw new Error(
      error?.message ??
        "Không tìm thấy workout plan.",
    );
  }

  return data.client_id;
}

async function getDayClientId(
  supabase: AppSupabaseClient,
  dayId: string,
): Promise<string> {
  const {
    data,
    error,
  } = await supabase
    .from("workout_days")
    .select("workout_plan_id")
    .eq("id", dayId)
    .single();

  if (
    error ||
    !data
  ) {
    throw new Error(
      error?.message ??
        "Không tìm thấy ngày tập.",
    );
  }

  return getPlanClientId(
    supabase,
    data.workout_plan_id,
  );
}

export async function createWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsed =
    createPlanSchema.safeParse({
      client_id:
        getFormValue(
          formData,
          "client_id",
        ),

      name:
        getFormValue(
          formData,
          "name",
        ),

      description:
        getFormValue(
          formData,
          "description",
        ),

      goal:
        getFormValue(
          formData,
          "goal",
        ),

      weeks:
        getFormValue(
          formData,
          "weeks",
        ),

      days_per_week:
        getFormValue(
          formData,
          "days_per_week",
        ),

      session_duration_minutes:
        getFormValue(
          formData,
          "session_duration_minutes",
        ),
    });

  if (!parsed.success) {
    throw new Error(
      getValidationMessage(
        parsed.error,
      ),
    );
  }

  const {
    supabase,
    userId,
  } = await requireUser();

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
  const parsed =
    createDaySchema.safeParse({
      workout_plan_id:
        getFormValue(
          formData,
          "workout_plan_id",
        ),

      day_number:
        getFormValue(
          formData,
          "day_number",
        ),

      name:
        getFormValue(
          formData,
          "name",
        ),

      focus:
        getFormValue(
          formData,
          "focus",
        ),

      notes:
        getFormValue(
          formData,
          "notes",
        ),

      rest_day:
        formData.get(
          "rest_day",
        ) === "on",
    });

  if (!parsed.success) {
    throw new Error(
      getValidationMessage(
        parsed.error,
      ),
    );
  }

  const {
    supabase,
  } = await requireUser();

  const clientId =
    await getPlanClientId(
      supabase,
      parsed.data
        .workout_plan_id,
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
        parsed.data
          .workout_plan_id,

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
        getFormValue(
          formData,
          "workout_day_id",
        ),

      exercise_name:
        getFormValue(
          formData,
          "exercise_name",
        ),

      exercise_order:
        getFormValue(
          formData,
          "exercise_order",
        ),

      target_sets:
        getFormValue(
          formData,
          "target_sets",
        ),

      rep_min:
        getFormValue(
          formData,
          "rep_min",
        ),

      rep_max:
        getFormValue(
          formData,
          "rep_max",
        ),

      rest_seconds:
        getFormValue(
          formData,
          "rest_seconds",
        ),

      tempo:
        getFormValue(
          formData,
          "tempo",
        ),

      rir:
        getFormValue(
          formData,
          "rir",
        ),

      notes:
        getFormValue(
          formData,
          "notes",
        ),
    });

  if (!parsed.success) {
    throw new Error(
      getValidationMessage(
        parsed.error,
      ),
    );
  }

  const {
    supabase,
  } = await requireUser();

  const clientId =
    await getDayClientId(
      supabase,
      parsed.data
        .workout_day_id,
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
        parsed.data
          .workout_day_id,

      exercise_id:
        null,

      exercise_name:
        parsed.data
          .exercise_name,

      exercise_order:
        parsed.data
          .exercise_order,

      target_sets:
        parsed.data
          .target_sets,

      rep_min:
        parsed.data.rep_min,

      rep_max:
        parsed.data.rep_max,

      rest_seconds:
        parsed.data
          .rest_seconds,

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
  const parsed =
    uuidSchema.safeParse(
      getFormValue(
        formData,
        "plan_id",
      ),
    );

  if (!parsed.success) {
    throw new Error(
      "Workout plan ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireUser();

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
    .eq(
      "client_id",
      clientId,
    )
    .eq(
      "status",
      "active",
    )
    .neq(
      "id",
      parsed.data,
    );

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
    .eq(
      "id",
      parsed.data,
    );

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
  const parsed =
    uuidSchema.safeParse(
      getFormValue(
        formData,
        "plan_id",
      ),
    );

  if (!parsed.success) {
    throw new Error(
      "Workout plan ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireUser();

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
    .eq(
      "id",
      parsed.data,
    );

  if (error) {
    throw new Error(
      `Không thể archive plan: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}

export async function deleteWorkoutPlanAction(
  formData: FormData,
): Promise<void> {
  const parsed =
    uuidSchema.safeParse(
      getFormValue(
        formData,
        "plan_id",
      ),
    );

  if (!parsed.success) {
    throw new Error(
      "Workout plan ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireUser();

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
    .eq(
      "id",
      parsed.data,
    );

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
  const parsed =
    uuidSchema.safeParse(
      getFormValue(
        formData,
        "day_id",
      ),
    );

  if (!parsed.success) {
    throw new Error(
      "Workout day ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireUser();

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
    .eq(
      "id",
      parsed.data,
    );

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
  const parsed =
    uuidSchema.safeParse(
      getFormValue(
        formData,
        "exercise_id",
      ),
    );

  if (!parsed.success) {
    throw new Error(
      "Workout exercise ID không hợp lệ.",
    );
  }

  const {
    supabase,
  } = await requireUser();

  const {
    data,
    error: findError,
  } = await supabase
    .from("workout_exercises")
    .select("workout_day_id")
    .eq(
      "id",
      parsed.data,
    )
    .single();

  if (
    findError ||
    !data
  ) {
    throw new Error(
      findError?.message ??
        "Không tìm thấy bài tập.",
    );
  }

  const clientId =
    await getDayClientId(
      supabase,
      data.workout_day_id,
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
    .eq(
      "id",
      parsed.data,
    );

  if (error) {
    throw new Error(
      `Không thể xóa bài tập: ${error.message}`,
    );
  }

  revalidatePath(
    "/dashboard/workouts",
  );
}