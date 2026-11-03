/**
 * Hackathon demo data — LOCAL ONLY.
 *
 *   DEMO_PASSWORD='<choose one>' npx tsx scripts/demo/seed-demo.ts
 *
 * Creates (or fully resets) one fictional athlete, "Maya Chen", on the local Supabase stack configured in .env.local:
 * a 3-day plan, four completed sessions over the last ~10 days, six days of check-ins (no pain) with scores from the
 * app's own computeRecoveryScore, yesterday's meals and one breakfast today. Today has no check-in and no session, so
 * the live demo performs both. Nothing here is real personal or health data.
 *
 * Safety: refuses to run unless NEXT_PUBLIC_SUPABASE_URL is a localhost URL; only ever touches the demo email's account.
 * Env: DEMO_PASSWORD (required, >= 12 chars), DEMO_EMAIL (default demo.athlete@muscle-fitness.local),
 *      DEMO_TIMEZONE (default Asia/Singapore).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

import { computeRecoveryScore } from "../../lib/recovery/score";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env.local — rely on the process environment
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const email = (process.env.DEMO_EMAIL ?? "demo.athlete@muscle-fitness.local").toLowerCase();
const password = process.env.DEMO_PASSWORD ?? "";
const timeZone = process.env.DEMO_TIMEZONE ?? "Asia/Singapore";

const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
  console.error(`Refusing to seed: NEXT_PUBLIC_SUPABASE_URL must be a localhost stack (got "${host || "unset"}").`);
  process.exit(1);
}
if (!serviceKey) {
  console.error("Refusing to seed: SUPABASE_SERVICE_ROLE_KEY is not set.");
  process.exit(1);
}
if (password.length < 12) {
  console.error("Refusing to seed: set DEMO_PASSWORD (at least 12 characters).");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

type Result = { data: unknown; error: unknown };

/** Throws on a Supabase error; for writes whose data is null on success. */
async function run(label: string, promise: PromiseLike<Result>): Promise<void> {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${(error as { message?: string }).message ?? String(error)}`);
}

/** Throws on a Supabase error or a missing row; for reads and insert…select. */
async function must<R extends Result>(label: string, promise: PromiseLike<R>): Promise<NonNullable<R["data"]>> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${(error as { message?: string }).message ?? String(error)}`);
  if (data === null || data === undefined) throw new Error(`${label}: no data returned`);
  return data as NonNullable<R["data"]>;
}

/** YYYY-MM-DD in the athlete's timezone, `offset` days from today. */
function localDate(offset: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86_400_000));
  return parts;
}

/** An instant at hh:mm local time on that local date (approximate offset is fine for demo timestamps). */
function localInstant(date: string, hh: number, mm = 0): string {
  const probe = new Date(`${date}T12:00:00Z`);
  const tzHour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).format(probe));
  const offsetHours = tzHour - 12;
  return new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hh - offsetHours, mm)).toISOString();
}

const PLAN_DAYS: Array<{ name: string; focus: string; exercises: Array<[string, number, number, number, number]> }> = [
  // [exercise name, sets, repMin, repMax, restSeconds]
  { name: "Full Body A", focus: "Push + legs", exercises: [["Barbell Bench Press", 3, 6, 10, 150], ["Barbell Back Squat", 3, 6, 10, 150], ["Romanian Deadlift", 3, 8, 12, 120], ["Cable Lateral Raise", 3, 12, 15, 90], ["Cable Triceps Pushdown", 3, 10, 12, 90]] },
  { name: "Full Body B", focus: "Pull + legs", exercises: [["Chest-Supported Row", 3, 8, 12, 120], ["Barbell Back Squat", 3, 6, 10, 150], ["Reverse Pec Deck", 3, 12, 15, 90], ["Barbell Curl", 3, 10, 12, 90], ["Cable Crunch", 3, 12, 15, 60]] },
  { name: "Full Body C", focus: "Strength", exercises: [["Barbell Bench Press", 3, 5, 8, 150], ["Romanian Deadlift", 3, 6, 10, 150], ["Barbell Back Squat", 3, 5, 8, 150], ["Dumbbell Lateral Raise", 3, 12, 15, 90], ["Incline Dumbbell Curl", 3, 10, 12, 90]] },
];

// Working weights (kg) the fictional athlete uses; later sessions add a little load.
const LOAD: Record<string, number> = {
  "Barbell Bench Press": 45, "Barbell Back Squat": 60, "Romanian Deadlift": 55, "Cable Lateral Raise": 7.5, "Cable Triceps Pushdown": 20,
  "Chest-Supported Row": 30, "Reverse Pec Deck": 25, "Barbell Curl": 20, "Cable Crunch": 25, "Dumbbell Lateral Raise": 6, "Incline Dumbbell Curl": 8,
};

async function reset(): Promise<void> {
  const existing = await must("list users", admin.auth.admin.listUsers({ page: 1, perPage: 1000 }));
  const user = existing.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) return;
  // workout_plans.created_by is ON DELETE RESTRICT: remove sessions, then plans, then the account (everything else cascades).
  await run("delete sessions", admin.from("workout_sessions").delete().eq("user_id", user.id));
  await run("delete plans (client)", admin.from("workout_plans").delete().eq("client_id", user.id));
  await run("delete plans (author)", admin.from("workout_plans").delete().eq("created_by", user.id));
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`delete demo user: ${error.message}`);
}

async function seed(): Promise<{ userId: string; sessions: number; checkins: number; foods: number }> {
  const created = await must("create user", admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Maya Chen" } }));
  const userId = created.user!.id;
  const now = new Date().toISOString();

  await run("profile", admin.from("profiles").update({ full_name: "Maya Chen", timezone: timeZone, gender: "female", date_of_birth: "1998-04-12", onboarding_completed: true, onboarding_completed_at: now }).eq("user_id", userId));
  await run("fitness profile", admin.from("fitness_profiles").upsert({ user_id: userId, height_cm: 166, weight_kg: 61, current_weight_kg: 61, goal: "muscle_gain", experience: "intermediate", training_days: 3, session_duration_minutes: 60, training_location: "gym", step_target: 9000, water_target_ml: 2500 }, { onConflict: "user_id" }));
  await run("preferences", admin.from("user_preferences").upsert({ user_id: userId, meals_per_day: 3, weekly_food_budget: 120, budget_currency: "SGD", cooking_ability: "intermediate", meal_prep_frequency: "twice_weekly", sleep_hours: 7.5, daily_steps: 9000, training_mode: "general" }, { onConflict: "user_id" }));

  const library = await must("exercise library", admin.from("exercise_library").select("id, name").in("name", [...new Set(PLAN_DAYS.flatMap((d) => d.exercises.map((e) => e[0])))]));
  const exerciseId = new Map(library.map((row: { id: string; name: string }) => [row.name, row.id]));
  for (const day of PLAN_DAYS) for (const [name] of day.exercises) if (!exerciseId.has(name)) throw new Error(`exercise_library has no "${name}"`);

  const plan = await must("plan", admin.from("workout_plans").insert({ client_id: userId, created_by: userId, name: "Strength Foundations", description: "Three full-body sessions a week.", goal: "muscle_gain", status: "active", allow_client_substitution: true, weeks: 8, days_per_week: 3, session_duration_minutes: 60, start_date: localDate(-14) }).select("id").single());
  const days: Array<{ id: string; name: string; exercises: Array<{ id: string; name: string; sets: number; repMin: number; repMax: number; rest: number }> }> = [];
  for (const [index, day] of PLAN_DAYS.entries()) {
    const row = await must("day", admin.from("workout_days").insert({ workout_plan_id: plan.id, name: day.name, focus: day.focus, day_order: index + 1, rest_day: false }).select("id").single());
    const exercises = [];
    for (const [order, [name, sets, repMin, repMax, rest]] of day.exercises.entries()) {
      const ex = await must("plan exercise", admin.from("workout_exercises").insert({ workout_day_id: row.id, exercise_id: exerciseId.get(name), exercise_name: name, exercise_order: order + 1, target_sets: sets, rep_min: repMin, rep_max: repMax, target_rir: 2, rest_seconds: rest }).select("id").single());
      exercises.push({ id: ex.id, name, sets, repMin, repMax, rest });
    }
    days.push({ id: row.id, name: day.name, exercises });
  }

  // Four completed sessions: A, B, C, A — so today's next plan day is B.
  const history: Array<[number, number]> = [[-9, 0], [-7, 1], [-4, 2], [-2, 0]];
  for (const [sessionIndex, [offset, dayIndex]] of history.entries()) {
    const day = days[dayIndex];
    const date = localDate(offset);
    const started = localInstant(date, 18, 5);
    const completed = localInstant(date, 19, 0);
    const session = await must("session", admin.from("workout_sessions").insert({ user_id: userId, workout_plan_id: plan.id, workout_day_id: day.id, scheduled_date: date, scheduled_for: started, started_at: started, completed_at: completed, title: day.name, name: day.name, status: "completed", session_state: "completed", duration_minutes: 55, session_rpe: 7 }).select("id").single());
    let volume = 0, sets = 0;
    for (const [order, ex] of day.exercises.entries()) {
      const sessionExercise = await must("session exercise", admin.from("workout_session_exercises").insert({ workout_session_id: session.id, workout_exercise_id: ex.id, exercise_id: exerciseId.get(ex.name), exercise_order: order + 1, display_name: ex.name, target_sets: ex.sets, target_rep_min: ex.repMin, target_rep_max: ex.repMax, target_rir: 2, rest_seconds: ex.rest, is_skipped: false }).select("id").single());
      const weight = LOAD[ex.name] + sessionIndex * (LOAD[ex.name] >= 20 ? 2.5 : 0.5);
      const rows = Array.from({ length: ex.sets }, (_, i) => {
        const reps = Math.max(ex.repMin, ex.repMax - 1 - i);
        volume += weight * reps;
        sets += 1;
        return { session_exercise_id: sessionExercise.id, set_number: i + 1, set_type: "working", target_reps: ex.repMax, weight_kg: weight, reps, rir: 2, completed: true, completed_at: completed };
      });
      await run("sets", admin.from("exercise_sets").insert(rows));
    }
    await run("session totals", admin.from("workout_sessions").update({ total_volume_kg: volume, total_sets: sets }).eq("id", session.id));
  }

  // Six days of check-ins (no pain/illness), scored by the app's own engine.
  const checkinDays: Array<[number, number, number, number, number, number, number, number]> = [
    // [offset, sleepHours, sleepQuality, stress, fatigue, soreness, mood, readiness]
    [-6, 7.5, 7, 4, 4, 3, 7, 7], [-5, 6.5, 6, 5, 5, 5, 6, 6], [-4, 7, 7, 4, 5, 4, 7, 7], [-3, 8, 8, 3, 3, 4, 8, 8], [-2, 7, 7, 4, 4, 3, 7, 7], [-1, 6.5, 6, 5, 6, 6, 6, 6],
  ];
  for (const [offset, sleepHours, sleepQuality, stress, fatigue, soreness, mood, readiness] of checkinDays) {
    const score = computeRecoveryScore({ sleepHours, sleepQuality, stress, fatigue, soreness, mood, readiness, restingHr: null, steps: null, painIllness: "no", notes: null });
    await run("checkin", admin.from("recovery_checkins").insert({ user_id: userId, checkin_date: localDate(offset), sleep_hours: sleepHours, sleep_quality: sleepQuality, stress, fatigue, soreness, mood, readiness, pain_illness: "no", recovery_score: score.score }));
  }

  // Meals entered manually (labelled "Entered manually" in the app — never presented as verified data).
  const food = (offset: number, meal: string, name: string, grams: number, kcal: number, p: number, c: number, f: number) => ({
    user_id: userId, log_date: localDate(offset), meal_type: meal, food_name: name, source: "user_provided", quantity_grams: grams,
    calories: kcal, protein_g: p, carbs_g: c, fat_g: f, is_estimated: false, idempotency_key: crypto.randomUUID(),
  });
  const foods = [
    food(-1, "breakfast", "Overnight oats with berries", 280, 390, 16, 58, 10),
    food(-1, "lunch", "Chicken rice (less rice)", 350, 520, 38, 55, 14),
    food(-1, "snack", "Greek yogurt", 170, 150, 17, 9, 4),
    food(-1, "dinner", "Salmon, broccoli and potatoes", 420, 610, 42, 45, 26),
    food(0, "breakfast", "Overnight oats with berries", 280, 390, 16, 58, 10),
  ];
  await run("food", admin.from("food_logs").insert(foods));

  return { userId, sessions: history.length, checkins: checkinDays.length, foods: foods.length };
}

reset()
  .then(seed)
  .then((summary) => {
    console.log(`Demo athlete ready on ${host}: ${email} (timezone ${timeZone}).`);
    console.log(`Seeded ${summary.sessions} completed sessions, ${summary.checkins} check-ins, ${summary.foods} meals. Password: the DEMO_PASSWORD you set.`);
  })
  .catch((error: unknown) => {
    console.error(`Demo seed failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
