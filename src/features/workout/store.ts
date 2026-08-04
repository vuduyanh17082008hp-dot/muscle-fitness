import { promises as fs } from "fs";
import path from "path";
import { createDefaultPlan, seedExercises } from "./seed";
import type {
  Exercise,
  LoggedSet,
  WorkoutDatabase,
  WorkoutPlan,
  WorkoutSession,
  SessionExercise,
} from "./types";
import { bestSet, estimated1Rm } from "./progression";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "workout-db.json");

let writeQueue: Promise<void> = Promise.resolve();

function emptyDb(): WorkoutDatabase {
  return {
    exercises: structuredClone(seedExercises),
    plans: [createDefaultPlan()],
    sessions: [],
  };
}

async function ensureDb(): Promise<WorkoutDatabase> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as WorkoutDatabase;
    if (!parsed.exercises?.length) parsed.exercises = structuredClone(seedExercises);
    if (!parsed.plans) parsed.plans = [createDefaultPlan()];
    if (!parsed.sessions) parsed.sessions = [];
    return parsed;
  } catch {
    const db = emptyDb();
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
    return db;
  }
}

async function persist(db: WorkoutDatabase) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function withWrite<T>(fn: (db: WorkoutDatabase) => Promise<T> | T): Promise<T> {
  const run = writeQueue.then(async () => {
    const db = await ensureDb();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function getDb() {
  return ensureDb();
}

export async function listExercises() {
  const db = await ensureDb();
  return db.exercises;
}

export async function upsertExercise(exercise: Exercise) {
  return withWrite((db) => {
    const idx = db.exercises.findIndex((e) => e.id === exercise.id);
    if (idx >= 0) db.exercises[idx] = exercise;
    else db.exercises.push(exercise);
    return exercise;
  });
}

export async function listPlans() {
  const db = await ensureDb();
  return db.plans;
}

export async function getPlan(planId: string) {
  const db = await ensureDb();
  return db.plans.find((p) => p.id === planId) ?? null;
}

export async function savePlan(plan: WorkoutPlan) {
  return withWrite((db) => {
    plan.updatedAt = new Date().toISOString();
    const idx = db.plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) db.plans[idx] = plan;
    else {
      plan.createdAt = plan.createdAt || plan.updatedAt;
      db.plans.push(plan);
    }
    return plan;
  });
}

export async function createPlan(input: {
  name: string;
  description?: string;
}): Promise<WorkoutPlan> {
  const now = new Date().toISOString();
  const plan: WorkoutPlan = {
    id: id("plan"),
    name: input.name,
    description: input.description ?? "",
    days: [
      {
        id: id("day"),
        name: "Day 1",
        order: 0,
        exercises: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  return savePlan(plan);
}

export async function deletePlan(planId: string) {
  return withWrite((db) => {
    db.plans = db.plans.filter((p) => p.id !== planId);
    return { ok: true };
  });
}

function previousBestForExercise(
  db: WorkoutDatabase,
  exerciseId: string,
): SessionExercise["previousBest"] {
  let best: SessionExercise["previousBest"];
  for (const session of db.sessions) {
    if (session.status !== "completed") continue;
    for (const se of session.exercises) {
      if (se.exerciseId !== exerciseId) continue;
      const top = bestSet(se.sets);
      if (!top?.completedAt) continue;
      const e1 = estimated1Rm(top.weightKg, top.reps);
      if (!best || e1 > best.estimated1Rm) {
        best = {
          weightKg: top.weightKg,
          reps: top.reps,
          estimated1Rm: e1,
          completedAt: top.completedAt,
        };
      }
    }
  }
  return best;
}

export async function startSession(input: {
  planId: string;
  dayId: string;
}): Promise<WorkoutSession> {
  return withWrite((db) => {
    const plan = db.plans.find((p) => p.id === input.planId);
    if (!plan) throw new Error("Plan not found");
    const day = plan.days.find((d) => d.id === input.dayId);
    if (!day) throw new Error("Workout day not found");

    const exercises: SessionExercise[] = [...day.exercises]
      .sort((a, b) => a.order - b.order)
      .map((pe) => {
        const sets: LoggedSet[] = Array.from({ length: pe.sets }, (_, i) => ({
          id: id("set"),
          setNumber: i + 1,
          weightKg: 0,
          reps: 0,
          rir: pe.targetRir,
          completed: false,
        }));
        return {
          id: id("sex"),
          exerciseId: pe.exerciseId,
          order: pe.order,
          plannedSets: pe.sets,
          repMin: pe.repMin,
          repMax: pe.repMax,
          targetRir: pe.targetRir,
          targetRpe: pe.targetRpe,
          restSeconds: pe.restSeconds,
          tempo: pe.tempo,
          coachNotes: pe.coachNotes,
          skipped: false,
          sets,
          previousBest: previousBestForExercise(db, pe.exerciseId),
        };
      });

    const session: WorkoutSession = {
      id: id("session"),
      planId: plan.id,
      dayId: day.id,
      name: `${plan.name} — ${day.name}`,
      status: "in_progress",
      startedAt: new Date().toISOString(),
      exercises,
    };
    db.sessions.unshift(session);
    return session;
  });
}

export async function getSession(sessionId: string) {
  const db = await ensureDb();
  return db.sessions.find((s) => s.id === sessionId) ?? null;
}

export async function listSessions() {
  const db = await ensureDb();
  return [...db.sessions].sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export async function updateSession(session: WorkoutSession) {
  return withWrite((db) => {
    const idx = db.sessions.findIndex((s) => s.id === session.id);
    if (idx < 0) throw new Error("Session not found");
    db.sessions[idx] = session;
    return session;
  });
}

export async function logSet(input: {
  sessionId: string;
  sessionExerciseId: string;
  setId: string;
  weightKg: number;
  reps: number;
  rir?: number;
}) {
  return withWrite((db) => {
    const session = db.sessions.find((s) => s.id === input.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "in_progress") {
      throw new Error("Session is not in progress");
    }
    const se = session.exercises.find((e) => e.id === input.sessionExerciseId);
    if (!se) throw new Error("Exercise not found in session");
    const set = se.sets.find((s) => s.id === input.setId);
    if (!set) throw new Error("Set not found");

    set.weightKg = input.weightKg;
    set.reps = input.reps;
    set.rir = input.rir;
    set.completed = true;
    set.skipped = false;
    set.completedAt = new Date().toISOString();
    return session;
  });
}

export async function skipExercise(input: {
  sessionId: string;
  sessionExerciseId: string;
}) {
  return withWrite((db) => {
    const session = db.sessions.find((s) => s.id === input.sessionId);
    if (!session) throw new Error("Session not found");
    const se = session.exercises.find((e) => e.id === input.sessionExerciseId);
    if (!se) throw new Error("Exercise not found");
    se.skipped = true;
    se.sets = se.sets.map((s) => ({ ...s, skipped: true, completed: false }));
    return session;
  });
}

export async function replaceExercise(input: {
  sessionId: string;
  sessionExerciseId: string;
  newExerciseId: string;
}) {
  return withWrite((db) => {
    const session = db.sessions.find((s) => s.id === input.sessionId);
    if (!session) throw new Error("Session not found");
    const se = session.exercises.find((e) => e.id === input.sessionExerciseId);
    if (!se) throw new Error("Exercise not found");
    const exists = db.exercises.some((e) => e.id === input.newExerciseId);
    if (!exists) throw new Error("Replacement exercise not found");

    se.replacedFromExerciseId = se.replacedFromExerciseId ?? se.exerciseId;
    se.exerciseId = input.newExerciseId;
    se.previousBest = previousBestForExercise(db, input.newExerciseId);
    se.skipped = false;
    se.sets = se.sets.map((s) => ({
      ...s,
      weightKg: 0,
      reps: 0,
      completed: false,
      skipped: false,
      completedAt: undefined,
    }));
    return session;
  });
}

export async function completeSession(sessionId: string) {
  return withWrite((db) => {
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    session.status = "completed";
    session.completedAt = new Date().toISOString();
    return session;
  });
}

