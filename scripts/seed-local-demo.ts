/**
 * Idempotent LOCAL-ONLY demo seed for the Golden Journey.
 *
 *   npx tsx scripts/seed-local-demo.ts
 *
 * Refuses any non-loopback URL. Never reads NEXT_PUBLIC_SUPABASE_URL
 * (that file currently points at hosted). Password is never written to disk.
 *
 *   MF_DEMO_EMAIL          default demo.athlete@local.test
 *   MF_DEMO_PASSWORD       required if the user already exists
 *   MF_DEMO_SUPABASE_URL   default http://127.0.0.1:54321
 */

import { spawnSync } from "node:child_process"
import { createHmac, randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { calculateNutritionTargets } from "@/features/onboarding/calculations"
import { defaultOnboardingData, type OnboardingData } from "@/features/onboarding/schema"
import { assertLocalSupabaseUrl } from "@/lib/demo/local-guard"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import { computeRecoveryScore } from "@/lib/recovery/score"
import type { RecoveryCheckinInput } from "@/lib/recovery/types"

const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"

function localRoleKey(role: "anon" | "service_role"): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const head = encode({ alg: "HS256", typ: "JWT" })
  const body = encode({ iss: "supabase-demo", role, exp: 1983812996 })
  return `${head}.${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(`${head}.${body}`).digest("base64url")}`
}

const TIMEZONE = "Asia/Singapore"
const DEMO_NAME = "Jordan Lee"
const DEMO_EMAIL_DEFAULT = "golden-journey.demo@local.test"

const FOODS = {
  chicken: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: null, sodiumMg: null },
  rice: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: null, sodiumMg: null },
  oats: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6, sugar: null, sodiumMg: null },
  yogurt: { calories: 97, protein: 9, carbs: 3.6, fat: 5, fiber: 0, sugar: null, sodiumMg: null },
  banana: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6, sugar: null, sodiumMg: null },
  broccoli: { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, sugar: null, sodiumMg: null },
  eggs: { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, sugar: null, sodiumMg: null },
} as const

const UPPER_SLUGS = [
  "barbell-bench-press",
  "seated-cable-row",
  "overhead-press",
  "lat-pulldown",
  "barbell-curl",
] as const

const LOWER_SLUGS = [
  "back-squat",
  "romanian-deadlift",
  "leg-press",
  "seated-leg-curl",
  "standing-calf-raise",
] as const

function singaporeDate(offsetDays: number): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  const sg = new Date(utc + 8 * 60 * 60_000)
  sg.setUTCDate(sg.getUTCDate() + offsetDays)
  return sg.toISOString().slice(0, 10)
}

function singaporeIso(dateIso: string, hour = 18): string {
  return new Date(`${dateIso}T${String(hour).padStart(2, "0")}:00:00+08:00`).toISOString()
}

function applyLocalLoaderCompat(): void {
  const sql = `
    ALTER TABLE public.workout_session_exercises ADD COLUMN IF NOT EXISTS exercise_name text;
    ALTER TABLE public.workout_session_exercises ADD COLUMN IF NOT EXISTS rep_min smallint;
    ALTER TABLE public.workout_session_exercises ADD COLUMN IF NOT EXISTS rep_max smallint;
    NOTIFY pgrst, 'reload schema';
  `
  const result = spawnSync(
    "docker",
    ["exec", "supabase_db_muscle-fitness-nof1-local", "psql", "-U", "postgres", "-d", "postgres", "-c", sql],
    { encoding: "utf8" },
  )
  if (result.status !== 0) {
    console.warn("Local loader compat skipped:", result.stderr || result.stdout)
  }
}

function throwQuery(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`)
}

async function insertRow(
  supabase: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
): Promise<string> {
  let payload: Record<string, unknown> = { ...row }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await supabase.from(table).insert(payload).select("id").single()
    if (!error && data && typeof (data as { id?: unknown }).id === "string") {
      return (data as { id: string }).id
    }

    const message = error?.message ?? "insert failed"
    const columnMatch =
      message.match(/Could not find the '([^']+)' column/i) ??
      message.match(/column "([^"]+)" of relation/i)

    if (columnMatch && columnMatch[1] in payload) {
      const next = { ...payload }
      delete next[columnMatch[1]]
      payload = next
      continue
    }

    throw new Error(`${table}: ${message}`)
  }

  throw new Error(`${table}: exhausted column retries`)
}

async function ensureUser(
  url: string,
  email: string,
  password: string,
): Promise<{ supabase: SupabaseClient; userId: string; created: boolean }> {
  const anonKey = process.env.NOF1_LOCAL_SUPABASE_ANON_KEY ?? localRoleKey("anon")
  const serviceKey = process.env.NOF1_LOCAL_SUPABASE_SERVICE_ROLE ?? localRoleKey("service_role")

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listed.error) throw new Error(`admin.listUsers: ${listed.error.message}`)

  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === email)
  let created = false
  let userId = existing?.id
  const passwordFromEnv = Boolean(process.env.MF_DEMO_PASSWORD)

  if (existing) {
    if (passwordFromEnv) {
      const updated = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      })
      if (updated.error) throw new Error(`admin.updateUser: ${updated.error.message}`)
    }
  } else {
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: DEMO_NAME, demo: true },
    })
    if (createdUser.error || !createdUser.data.user) {
      throw new Error(`admin.createUser: ${createdUser.error?.message ?? "no user"}`)
    }
    userId = createdUser.data.user.id
    created = true
  }

  if (!userId) throw new Error("Demo user id missing after admin upsert.")

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const signedIn = await supabase.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.user) {
    throw new Error(
      `signIn: ${signedIn.error?.message ?? "no session"}. Set MF_DEMO_PASSWORD to the local demo password from the previous seed stdout.`,
    )
  }

  return { supabase, userId: signedIn.data.user.id, created }
}

async function resetOwnedData(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error: foodError } = await supabase.from("food_logs").delete().eq("user_id", userId)
  throwQuery("reset food_logs", foodError)

  const { error: recoveryError } = await supabase.from("recovery_checkins").delete().eq("user_id", userId)
  throwQuery("reset recovery_checkins", recoveryError)

  const { error: sessionError } = await supabase.from("workout_sessions").delete().eq("user_id", userId)
  throwQuery("reset workout_sessions", sessionError)

  const { error: planError } = await supabase.from("workout_plans").delete().eq("client_id", userId)
  throwQuery("reset workout_plans", planError)
}

async function seedProfile(supabase: SupabaseClient, userId: string, onboarding: OnboardingData): Promise<void> {
  const targets = calculateNutritionTargets(onboarding)

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      full_name: onboarding.personal.fullName,
      date_of_birth: onboarding.personal.dateOfBirth,
      gender: onboarding.personal.gender,
      timezone: onboarding.personal.timezone,
      onboarding_completed: true,
    },
    { onConflict: "user_id" },
  )
  throwQuery("profiles", profileError)

  const { error: fitnessError } = await supabase.from("fitness_profiles").upsert(
    {
      user_id: userId,
      height_cm: onboarding.personal.heightCm,
      weight_kg: onboarding.personal.weightKg,
          goal: "build_muscle",
      experience: onboarding.training.experience,
      training_days: onboarding.training.trainingDays,
      session_duration_minutes: onboarding.training.sessionDurationMinutes,
      training_location: onboarding.training.trainingLocation,
      available_equipment: onboarding.training.availableEquipment,
      priority_muscles: onboarding.training.priorityMuscles,
      physical_limitations: null,
      calories_target: targets.calories,
      protein_target_g: targets.protein,
      carbs_target_g: targets.carbohydrates,
      fat_target_g: targets.fat,
    },
    { onConflict: "user_id" },
  )
  throwQuery("fitness_profiles", fitnessError)

  const preferencePayload = {
    meals_per_day: 4,
    preferred_foods: ["high-protein"],
    food_preferences: ["high-protein"],
    excluded_foods: [] as string[],
    allergies: [] as string[],
    weekly_food_budget: 120,
    cooking_ability: "beginner",
    meal_prep_frequency: "twice_weekly",
    sleep_hours: 7,
    daily_steps: 8000,
    preferred_training_time: "flexible",
    training_mode_override: "strength",
    training_mode: "strength",
    activity_level_override: "very",
    activity_level: "very",
    nutrition_goal_override: "lean-bulk",
    nutrition_goal: "lean-bulk",
  }

  const { data: existingPrefs } = await supabase
    .from("user_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  const preferencesResult = existingPrefs
    ? await supabase.from("user_preferences").update(preferencePayload).eq("user_id", userId)
    : await supabase.from("user_preferences").insert({ user_id: userId, ...preferencePayload })

  throwQuery("user_preferences", preferencesResult.error)
}

type LibraryRow = { id: string; slug: string; name: string }

async function loadLibrary(supabase: SupabaseClient, slugs: string[]): Promise<Map<string, LibraryRow>> {
  const { data, error } = await supabase
    .from("exercise_library")
    .select("id, slug, name")
    .in("slug", slugs)

  throwQuery("exercise_library", error)

  const map = new Map<string, LibraryRow>()
  for (const row of (data as LibraryRow[] | null) ?? []) {
    map.set(row.slug, row)
  }
  return map
}

async function seedPlan(
  supabase: SupabaseClient,
  userId: string,
  library: Map<string, LibraryRow>,
): Promise<{ planId: string; upperDayId: string; lowerDayId: string }> {
  const planId = await insertRow(supabase, "workout_plans", {
    client_id: userId,
    created_by: userId,
    name: "Upper / Lower Strength",
    description: "Four-day strength split for a returning lifter.",
    goal: "muscle_gain",
    status: "active",
    weeks: 8,
    days_per_week: 4,
    session_duration_minutes: 70,
  })

  const upperDayId = await insertRow(supabase, "workout_days", {
    workout_plan_id: planId,
    day_order: 1,
    scheduled_weekday: 1,
    name: "Upper Strength",
    notes: "Chest, back, shoulders",
  })

  const lowerDayId = await insertRow(supabase, "workout_days", {
    workout_plan_id: planId,
    day_order: 2,
    scheduled_weekday: 2,
    name: "Lower Strength",
    notes: "Squat and hinge",
  })

  async function seedDayExercises(dayId: string, slugs: readonly string[]): Promise<void> {
    for (let index = 0; index < slugs.length; index += 1) {
      const slug = slugs[index]
      const exercise = library.get(slug)
      if (!exercise) {
        throw new Error(`exercise_library missing slug ${slug}`)
      }
      await insertRow(supabase, "workout_exercises", {
        workout_day_id: dayId,
        exercise_id: exercise.id,
        exercise_order: index + 1,
        target_sets: 3,
        rep_min: 6,
        rep_max: 10,
        rest_seconds: 120,
      })
    }
  }

  await seedDayExercises(upperDayId, UPPER_SLUGS)
  await seedDayExercises(lowerDayId, LOWER_SLUGS)

  return { planId, upperDayId, lowerDayId }
}

async function seedSession(
  supabase: SupabaseClient,
  input: {
    userId: string
    planId: string
    dayId: string
    name: string
    dateIso: string
    completed: boolean
    library: Map<string, LibraryRow>
    slugs: readonly string[]
    rpe: number
  },
): Promise<void> {
  const scheduledFor = singaporeIso(input.dateIso, 18)
  const completedAt = input.completed ? singaporeIso(input.dateIso, 19) : null
  const startedAt = input.completed ? singaporeIso(input.dateIso, 18) : null

  const sessionId = await insertRow(supabase, "workout_sessions", {
    user_id: input.userId,
    workout_plan_id: input.planId,
    workout_day_id: input.dayId,
    name: input.name,
    title: input.name,
    scheduled_for: scheduledFor,
    scheduled_date: input.dateIso,
    session_state: input.completed ? "completed" : "not_started",
    status: input.completed ? "completed" : "scheduled",
    started_at: startedAt,
    completed_at: completedAt,
    duration_minutes: input.completed ? 68 : 70,
    session_rpe: input.completed ? input.rpe : null,
    total_volume_kg: 0,
    total_sets: input.completed ? input.slugs.length * 3 : 0,
  })

  let volume = 0

  for (let index = 0; index < input.slugs.length; index += 1) {
    const slug = input.slugs[index]
    const exercise = input.library.get(slug)
    if (!exercise) {
      throw new Error(`exercise_library missing slug ${slug}`)
    }
    const baseWeight = 40 + index * 8 + (input.completed ? 2 : 0)

    const sessionExerciseId = await insertRow(supabase, "workout_session_exercises", {
      workout_session_id: sessionId,
      exercise_id: exercise.id,
      display_name: exercise.name,
      exercise_name: exercise.name,
      exercise_order: index + 1,
      target_sets: 3,
      target_rep_min: 6,
      target_rep_max: 10,
      rep_min: 6,
      rep_max: 10,
      rest_seconds: 120,
      is_skipped: false,
    })

    if (!input.completed) continue

    for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
      const weight = baseWeight + (3 - setNumber) * 2.5
      const reps = 8 - setNumber + 1
      volume += weight * reps

      await insertRow(supabase, "exercise_sets", {
        session_exercise_id: sessionExerciseId,
        set_number: setNumber,
        set_type: "working",
        weight_kg: weight,
        reps,
        rir: 2,
        completed: true,
        completed_at: completedAt,
      })
    }
  }

  if (input.completed && volume > 0) {
    await supabase.from("workout_sessions").update({ total_volume_kg: Math.round(volume) }).eq("id", sessionId)
  }
}

async function seedRecovery(supabase: SupabaseClient, userId: string): Promise<void> {
  const history: Array<{ score: number | null }> = []

  for (let offset = -11; offset <= 0; offset += 1) {
    const lateFatigue = offset >= -1
    const input: RecoveryCheckinInput = {
      sleepHours: lateFatigue ? 6.2 : 7.6,
      sleepQuality: lateFatigue ? 6 : 8,
      stress: lateFatigue ? 5 : 3,
      fatigue: lateFatigue ? 6 : 3,
      soreness: lateFatigue ? 6 : 3,
      mood: lateFatigue ? 6 : 8,
      readiness: lateFatigue ? 5 : 8,
      restingHr: lateFatigue ? 62 : 56,
      steps: lateFatigue ? 7200 : 9000,
      painIllness: "no",
      notes: lateFatigue ? "Legs still heavy after yesterday’s lower session." : null,
    }

    const result = computeRecoveryScore(input, history)
    history.push({ score: result.score })

    const { error } = await supabase.from("recovery_checkins").upsert(
      {
        user_id: userId,
        checkin_date: singaporeDate(offset),
        sleep_hours: input.sleepHours,
        sleep_quality: input.sleepQuality,
        stress: input.stress,
        fatigue: input.fatigue,
        soreness: input.soreness,
        mood: input.mood,
        readiness: input.readiness,
        resting_hr: input.restingHr,
        steps: input.steps,
        pain_illness: input.painIllness,
        notes: input.notes,
        recovery_score: result.score,
        score_breakdown: result.drivers,
      },
      { onConflict: "user_id,checkin_date" },
    )
    throwQuery(`recovery_checkins ${offset}`, error)
  }
}

async function seedNutrition(supabase: SupabaseClient, userId: string): Promise<void> {
  async function logFood(
    dateIso: string,
    mealType: string,
    foodName: string,
    per100g: (typeof FOODS)[keyof typeof FOODS],
    grams: number,
  ): Promise<void> {
    const scaled = scaleMacrosToGrams(per100g, grams)
    const { error } = await supabase.from("food_logs").insert({
      user_id: userId,
      log_date: dateIso,
      meal_type: mealType,
      food_name: foodName,
      source: "user_provided",
      quantity_grams: grams,
      calories: scaled.calories,
      protein_g: scaled.protein,
      carbs_g: scaled.carbs,
      fat_g: scaled.fat,
      fiber_g: scaled.fiber,
      is_estimated: false,
    })
    throwQuery(`food_logs ${foodName}`, error)
  }

  for (let offset = -6; offset <= 0; offset += 1) {
    const dateIso = singaporeDate(offset)
    await logFood(dateIso, "breakfast", "Rolled oats", FOODS.oats, 80)
    await logFood(dateIso, "breakfast", "Greek yogurt", FOODS.yogurt, 170)
    await logFood(dateIso, "breakfast", "Banana", FOODS.banana, 120)

    if (offset === 0) {
      await logFood(dateIso, "lunch", "Chicken breast", FOODS.chicken, 180)
      await logFood(dateIso, "lunch", "Cooked rice", FOODS.rice, 200)
      continue
    }

    await logFood(dateIso, "lunch", "Chicken breast", FOODS.chicken, 200)
    await logFood(dateIso, "lunch", "Cooked rice", FOODS.rice, 250)
    await logFood(dateIso, "lunch", "Broccoli", FOODS.broccoli, 150)
    await logFood(dateIso, "dinner", "Eggs", FOODS.eggs, 120)
    await logFood(dateIso, "dinner", "Chicken breast", FOODS.chicken, 150)
    await logFood(dateIso, "snack", "Greek yogurt", FOODS.yogurt, 150)
  }
}

async function verify(supabase: SupabaseClient, userId: string): Promise<Record<string, number | boolean | null>> {
  const [profile, fitness, sessions, recovery, foods, plan] = await Promise.all([
    supabase.from("profiles").select("onboarding_completed, full_name, timezone").eq("user_id", userId).maybeSingle(),
    supabase.from("fitness_profiles").select("goal, experience, training_days, weight_kg, protein_target_g").eq("user_id", userId).maybeSingle(),
    supabase.from("workout_sessions").select("id, session_state, completed_at", { count: "exact" }).eq("user_id", userId),
    supabase.from("recovery_checkins").select("checkin_date, recovery_score", { count: "exact" }).eq("user_id", userId).order("checkin_date", { ascending: false }),
    supabase.from("food_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("workout_plans").select("id, status, name").eq("client_id", userId).eq("status", "active").maybeSingle(),
  ])

  const completed = (sessions.data ?? []).filter((row) => row.session_state === "completed").length
  const todayIso = singaporeDate(0)
  const todayRecovery = (recovery.data ?? []).find((row) => row.checkin_date === todayIso)

  return {
    onboardingCompleted: profile.data?.onboarding_completed === true,
    hasName: Boolean(profile.data?.full_name),
    hasFitnessGoal: Boolean(fitness.data?.goal),
    activePlan: Boolean(plan.data?.id),
    sessions: sessions.count ?? 0,
    completedSessions: completed,
    recoveryDays: recovery.count ?? 0,
    todayRecoveryScore: todayRecovery?.recovery_score ?? null,
    foodLogs: foods.count ?? 0,
  }
}

async function main(): Promise<void> {
  const url = process.env.MF_DEMO_SUPABASE_URL ?? "http://127.0.0.1:54321"
  assertLocalSupabaseUrl(url)

  const email = (process.env.MF_DEMO_EMAIL ?? DEMO_EMAIL_DEFAULT).trim().toLowerCase()
  const generated = !process.env.MF_DEMO_PASSWORD
  const password = process.env.MF_DEMO_PASSWORD ?? `Mf-${randomBytes(9).toString("base64url")}9!`

  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: process.env.NOF1_LOCAL_SUPABASE_ANON_KEY ?? localRoleKey("anon") },
  })
  if (!health.ok) {
    throw new Error(`Local Supabase auth is not reachable at ${url}`)
  }

  applyLocalLoaderCompat()

  const { supabase, userId, created } = await ensureUser(url, email, password)

  const onboarding: OnboardingData = {
    ...defaultOnboardingData,
    personal: {
      fullName: DEMO_NAME,
      dateOfBirth: "1996-04-12",
      gender: "male",
      heightCm: 176,
      weightKg: 78,
      timezone: TIMEZONE,
    },
    goal: { goal: "muscle_gain" },
    training: {
      ...defaultOnboardingData.training,
      trainingStyle: "strength",
      experience: "intermediate",
      trainingDays: 4,
      sessionDurationMinutes: 70,
      trainingLocation: "gym",
      availableEquipment: ["barbell", "dumbbell", "cable", "machine"],
      priorityMuscles: ["chest", "back", "quadriceps"],
      physicalLimitations: "",
    },
  }

  await resetOwnedData(supabase, userId)
  await seedProfile(supabase, userId, onboarding)

  const library = await loadLibrary(supabase, [...UPPER_SLUGS, ...LOWER_SLUGS])
  if (library.size === 0) {
    console.warn("exercise_library returned no rows — training sessions will use names only.")
  }

  const plan = await seedPlan(supabase, userId, library)

  const completedOffsets = [-10, -9, -7, -6, -3, -2, -1]
  for (const offset of completedOffsets) {
    const isLower = offset === -9 || offset === -6 || offset === -2 || offset === -1
    await seedSession(supabase, {
      userId,
      planId: plan.planId,
      dayId: isLower ? plan.lowerDayId : plan.upperDayId,
      name: isLower ? "Lower Strength" : "Upper Strength",
      dateIso: singaporeDate(offset),
      completed: true,
      library,
      slugs: isLower ? LOWER_SLUGS : UPPER_SLUGS,
      rpe: offset >= -1 ? 8 : 7,
    })
  }

  await seedSession(supabase, {
    userId,
    planId: plan.planId,
    dayId: plan.upperDayId,
    name: "Upper Strength",
    dateIso: singaporeDate(0),
    completed: false,
    library,
    slugs: UPPER_SLUGS,
    rpe: 7,
  })

  await seedRecovery(supabase, userId)
  await seedNutrition(supabase, userId)

  const summary = await verify(supabase, userId)

  console.log("LOCAL demo seed complete.")
  console.log(`  email: ${email}`)
  console.log(`  user_id: ${userId}`)
  console.log(`  created_now: ${created}`)
  if (generated) {
    console.log("  password: (generated this run — store in a password manager, never in git)")
    console.log(`  ${password}`)
  } else {
    console.log("  password: not printed (MF_DEMO_PASSWORD was provided)")
  }
  console.log("  summary:", JSON.stringify(summary, null, 2))
  console.log("Hosted Supabase was not contacted.")
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
