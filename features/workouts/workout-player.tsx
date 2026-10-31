"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  History,
  LoaderCircle,
  Pause,
  Play,
  RefreshCcw,
  SkipForward,
  TimerReset,
} from "lucide-react";

import {
  finishWorkoutAction,
  replaceSessionExerciseAction,
  saveWorkoutSetAction,
  skipSessionExerciseAction,
} from "@/app/dashboard/workouts/actions";
import { restRemaining } from "@/lib/training/rest-timer";
import { formatSessionClock } from "@/lib/training/session-time";

import {
  requiresExplicitLoad,
  setSaveMessage,
  suggestSetValues,
  type SetSuggestion,
} from "./calculations";

import type {
  WorkoutPlayerExercise,
  WorkoutPlayerSet,
  WorkoutReplacementOption,
} from "./types";

type SetField = "weightKg" | "reps" | "rir" | "rpe";

/* =========================================================
   TYPES
========================================================= */

type Props = {
  sessionId:
    string;

  sessionName:
    string;

  startedAt:
    string | null;

  /** The athlete's profile time zone — the completed page formats in it too. */
  timeZone:
    string;

  allowSubstitution:
    boolean;

  initialExercises:
    WorkoutPlayerExercise[];

  replacementOptions:
    WorkoutReplacementOption[];
};

/* =========================================================
   HELPERS
========================================================= */

function formatTimer(
  seconds:
    number,
) {
  const minutes =
    Math.floor(
      seconds /
        60,
    );

  const remainingSeconds =
    seconds %
    60;

  return `${String(
    minutes,
  ).padStart(
    2,
    "0",
  )}:${String(
    remainingSeconds,
  ).padStart(
    2,
    "0",
  )}`;
}

function nullableNumber(
  value:
    string,
):
  | number
  | null {
  if (
    value.trim() ===
    ""
  ) {
    return null;
  }

  const number =
    Number(
      value,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

/* =========================================================
   PENDING SETS (offline-safe logging)

   A completed set is written to localStorage BEFORE the server call
   and removed only after the server confirms it. A network failure
   keeps the typed values on screen and in storage; they are re-sent
   on reconnect and on the next load. The receiver is an update by
   set id, so a repeated delivery has one logical effect (at-least-
   once delivery, effectively-once result). Success feedback is shown
   only for a server-confirmed write, and only for the newest one.
   ponytail: last write wins against the server row; per-set version
   checks if multi-device editing of one session ever matters.
========================================================= */

type PendingSet = Pick<WorkoutPlayerSet, "weightKg" | "reps" | "rir" | "rpe" | "completed"> & { exerciseId: string }

const pendingKey = (sessionId: string) => `mf:pending-sets:${sessionId}`

function readPendingSets(sessionId: string): Record<string, PendingSet> {
  try {
    const raw = window.localStorage.getItem(pendingKey(sessionId))
    return raw ? (JSON.parse(raw) as Record<string, PendingSet>) : {}
  } catch {
    return {}
  }
}

function writePendingSets(sessionId: string, pending: Record<string, PendingSet>) {
  try {
    if (Object.keys(pending).length === 0) window.localStorage.removeItem(pendingKey(sessionId))
    else window.localStorage.setItem(pendingKey(sessionId), JSON.stringify(pending))
  } catch {
    // Storage unavailable (private mode): the values still stay on screen for this visit.
  }
}

/* =========================================================
   DRAFT CARRY (exercise replacement)

   Replacing an exercise refreshes the page, and the player is keyed
   on its exercise list, so it remounts with server values only. The
   values the athlete typed but hadn't logged yet (other exercises'
   sets, edited logged sets, session RPE and notes) ride along in
   sessionStorage for that one remount and are restored by set id.
   Never sent anywhere; ignored after two minutes.
========================================================= */

type DraftCarry = {
  savedAt: number
  sets: Record<string, Pick<WorkoutPlayerSet, "weightKg" | "reps" | "rir" | "rpe">>
  touched: string[]
  dirty: string[]
  sessionRpe: number | null
  sessionNotes: string
}

const draftKey = (sessionId: string) => `mf:workout-draft:${sessionId}`
const DRAFT_CARRY_MAX_AGE_MS = 2 * 60 * 1000

function writeDraftCarry(sessionId: string, carry: Omit<DraftCarry, "savedAt">) {
  try {
    window.sessionStorage.setItem(draftKey(sessionId), JSON.stringify({ ...carry, savedAt: Date.now() }))
  } catch {
    // Storage unavailable: the replacement still works, only unlogged typing is lost (as before).
  }
}

function takeDraftCarry(sessionId: string): DraftCarry | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(sessionId))
    if (!raw) return null
    window.sessionStorage.removeItem(draftKey(sessionId))
    const carry = JSON.parse(raw) as DraftCarry
    return Date.now() - carry.savedAt <= DRAFT_CARRY_MAX_AGE_MS ? carry : null
  } catch {
    return null
  }
}

const OFFLINE_SET_MESSAGE =
  "You're offline — this set isn't saved yet. It's kept on this device and will be sent when you're back online."
const OFFLINE_ACTION_MESSAGE = "You're offline — that didn't go through, and nothing was changed. Try again when you're back online."

/* =========================================================
   WORKOUT PLAYER
========================================================= */

export function WorkoutPlayer({
  sessionId,
  sessionName,
  startedAt,
  timeZone,
  allowSubstitution,
  initialExercises,
  replacementOptions,
}: Props) {
  const router =
    useRouter();

  const [
    isPending,
    startTransition,
  ] =
    useTransition();

  const [
    exercises,
    setExercises,
  ] =
    useState<
      WorkoutPlayerExercise[]
    >(
      initialExercises,
    );

  const [
    restSeconds,
    setRestSeconds,
  ] =
    useState(0);

  const [
    timerRunning,
    setTimerRunning,
  ] =
    useState(false);

  // When the running rest ends (epoch ms); null while paused or idle.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);

  const [
    sessionRpe,
    setSessionRpe,
  ] =
    useState<
      number | null
    >(null);

  const [
    sessionNotes,
    setSessionNotes,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(null);

  const [
    isError,
    setIsError,
  ] =
    useState(false);

  const [
    pendingSetIds,
    setPendingSetIds,
  ] =
    useState<string[]>([]);

  // Exercise focus: one expanded exercise; the rest collapse to a summary. All typed values live in `exercises`,
  // so switching never loses them. Opens on the first exercise that still has an unlogged set.
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(
    () =>
      (initialExercises.find((exercise) => !exercise.isSkipped && exercise.sets.some((set) => !set.completed)) ??
        initialExercises[0])?.id ?? null,
  );
  // `${setId}:${field}` the athlete has typed in. A touched field never shows a carry-forward hint again, even when
  // cleared, so a suggestion can't replace an intentional change.
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<string>>(() => new Set());
  // Logged sets edited since their last save: their action becomes "Save" instead of "Undo".
  const [dirtySetIds, setDirtySetIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingSetId, setSavingSetId] = useState<string | null>(null);
  const finishDialogRef = useRef<HTMLDialogElement>(null);
  // Only the newest set write may report success, so a slow earlier save can't overwrite newer feedback.
  const latestSaveRef = useRef(0);

  /** Sends every stored pending set once, in order; stops at the first network failure (still offline). */
  const syncPendingSets = useCallback(async () => {
    const pending = readPendingSets(sessionId);
    const ids = Object.keys(pending);
    if (ids.length === 0) return;
    let synced = 0;
    for (const setId of ids) {
      const entry = pending[setId]!;
      let result: Awaited<ReturnType<typeof saveWorkoutSetAction>>;
      try {
        result = await saveWorkoutSetAction({ sessionId, setId, weightKg: entry.weightKg, reps: entry.reps, rir: entry.rir, rpe: entry.rpe, completed: entry.completed, notes: "" });
      } catch {
        setIsError(true);
        setMessage(OFFLINE_SET_MESSAGE);
        return;
      }
      delete pending[setId];
      writePendingSets(sessionId, pending);
      setPendingSetIds(Object.keys(pending));
      if (!result.success) {
        // The server refused it (e.g. the session was finished elsewhere): say so, never claim it synced.
        setIsError(true);
        setMessage(result.message);
        return;
      }
      synced += 1;
    }
    if (synced > 0) {
      setIsError(false);
      setMessage(synced === 1 ? "Back online — your saved set was synced." : `Back online — ${synced} sets were synced.`);
    }
  }, [sessionId]);

  // Restore unsynced sets typed earlier on this device (refresh, closed tab), try to send them, and retry on reconnect.
  useEffect(() => {
    // Typing carried over an exercise replacement first; pending (logged-but-unsynced) sets below win over it.
    const carry = takeDraftCarry(sessionId);
    if (carry) {
      // One-time restore from sessionStorage after hydration, like the pending sets below.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExercises((current) =>
        current.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => (carry.sets[set.id] ? { ...set, ...carry.sets[set.id] } : set)),
        })),
      );
      setTouchedFields(new Set(carry.touched));
      setDirtySetIds(new Set(carry.dirty));
      setSessionRpe(carry.sessionRpe);
      setSessionNotes(carry.sessionNotes);
    }
    const pending = readPendingSets(sessionId);
    const ids = Object.keys(pending);
    if (ids.length > 0) {
      // One-time sync from an external store (localStorage) after hydration; a lazy initial state would mismatch SSR.
      setExercises((current) =>
        current.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => {
            const entry = pending[set.id];
            return entry ? { ...set, weightKg: entry.weightKg, reps: entry.reps, rir: entry.rir, rpe: entry.rpe, completed: entry.completed } : set;
          }),
        })),
      );
      setPendingSetIds(ids);
      void syncPendingSets();
    }
    const onOnline = () => void syncPendingSets();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sessionId, syncPendingSets]);

  /* =======================================================
     DERIVED TIMER STATE

     No setTimerRunning(false) inside effect.
  ======================================================= */

  const timerActive =
    timerRunning &&
    restSeconds >
      0;

  /* =======================================================
     REST TIMER
  ======================================================= */

  useEffect(() => {
    if (
      !timerActive
    ) {
      return;
    }

    if (restEndsAt === null) {
      return;
    }

    // Timestamp-based: each tick (and the return from a backgrounded tab, where
    // intervals are throttled) recomputes from the end time, so it never drifts.
    const tick = () => setRestSeconds(restRemaining(restEndsAt, Date.now()));
    tick();
    const timer = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [
    timerActive,
    restEndsAt,
  ]);

  /* =======================================================
     PROGRESS
  ======================================================= */

  const progress =
    useMemo(
      () => {
        const activeSets =
          exercises
            .filter(
              (
                exercise,
              ) =>
                !exercise.isSkipped,
            )
            .flatMap(
              (
                exercise,
              ) =>
                exercise.sets,
            );

        const completedSets =
          activeSets.filter(
            (
              set,
            ) =>
              set.completed,
          ).length;

        return {
          total:
            activeSets.length,

          completed:
            completedSets,

          percent:
            activeSets.length ===
            0
              ? 0
              : Math.round(
                  (completedSets /
                    activeSets.length) *
                    100,
                ),
        };
      },
      [
        exercises,
      ],
    );

  /* =======================================================
     LOCAL SET UPDATE
  ======================================================= */

  function updateSetLocally(
    exerciseId:
      string,

    setId:
      string,

    updater:
      (
        set:
          WorkoutPlayerSet,
      ) =>
        WorkoutPlayerSet,
  ) {
    setExercises(
      (
        current,
      ) =>
        current.map(
          (
            exercise,
          ) =>
            exercise.id !==
            exerciseId
              ? exercise
              : {
                  ...exercise,

                  sets:
                    exercise.sets.map(
                      (
                        set,
                      ) =>
                        set.id ===
                        setId
                          ? updater(
                              set,
                            )
                          : set,
                    ),
                },
        ),
    );
  }

  /* =======================================================
     SAVE SET
  ======================================================= */

  function saveSet(
    exercise:
      WorkoutPlayerExercise,

    set:
      WorkoutPlayerSet,

    completed:
      boolean,

    // Carry-forward values the athlete accepted by logging (only fills fields left empty).
    values: Partial<Pick<WorkoutPlayerSet, "weightKg" | "reps">> = {},
  ) {
    const nextSet = {
      ...set,

      ...values,

      completed,
    };

    // Rest starts on logging a set, not on saving an edit to an already-logged one.
    const startsRest =
      completed && !set.completed;

    if (
      completed &&
      (nextSet.reps ===
        null ||
        nextSet.reps <
          0)
    ) {
      setIsError(
        true,
      );

      setMessage(
        "Enter repetitions before completing the set.",
      );

      return;
    }

    // A blank weight on a loaded lift would be stored as zero volume; ask instead of guessing.
    if (completed && nextSet.weightKg === null && requiresExplicitLoad(exercise.equipment)) {
      setIsError(true);
      setMessage(`Enter the weight in kg for ${exercise.name} before logging the set.`);
      return;
    }

    updateSetLocally(
      exercise.id,
      set.id,
      () =>
        nextSet,
    );

    setMessage(
      null,
    );

    setSavingSetId(
      set.id,
    );

    // Durable before the network: a dropped connection can no longer lose what was typed.
    const pending = readPendingSets(sessionId);
    pending[nextSet.id] = { exerciseId: exercise.id, weightKg: nextSet.weightKg, reps: nextSet.reps, rir: nextSet.rir, rpe: nextSet.rpe, completed: nextSet.completed };
    writePendingSets(sessionId, pending);

    const saveToken = ++latestSaveRef.current;

    startTransition(
      async () => {
        let result: Awaited<ReturnType<typeof saveWorkoutSetAction>>;
        try {
          result =
            await saveWorkoutSetAction(
              {
                sessionId,

                setId:
                  nextSet.id,

                weightKg:
                  nextSet.weightKg,

                reps:
                  nextSet.reps,

                rir:
                  nextSet.rir,

                rpe:
                  nextSet.rpe,

                completed:
                  nextSet.completed,

                notes:
                  "",
              },
            );
        } catch {
          // Network failure: keep the values on screen and in the pending store; they sync on reconnect.
          setSavingSetId(null);
          setPendingSetIds(Object.keys(readPendingSets(sessionId)));
          setIsError(true);
          setMessage(OFFLINE_SET_MESSAGE);
          return;
        }

        const stillPending = readPendingSets(sessionId);
        delete stillPending[nextSet.id];
        writePendingSets(sessionId, stillPending);
        setPendingSetIds(Object.keys(stillPending));
        setSavingSetId(null);

        if (
          !result.success
        ) {
          updateSetLocally(
            exercise.id,
            set.id,
            () =>
              set,
          );

          setIsError(
            true,
          );

          setMessage(
            result.message,
          );

          return;
        }

        setDirtySetIds((current) => {
          const next = new Set(current);
          next.delete(nextSet.id);
          return next;
        });

        if (
          startsRest
        ) {
          setRestSeconds(
            exercise.restSeconds,
          );

          setRestEndsAt(Date.now() + exercise.restSeconds * 1000);

          setTimerRunning(
            true,
          );
        }

        if (saveToken !== latestSaveRef.current) return;

        setIsError(
          false,
        );

        setMessage(
          setSaveMessage(set.completed, nextSet.completed),
        );
      },
    );
  }

  /* =======================================================
     SKIP
  ======================================================= */

  function skipExercise(
    exercise:
      WorkoutPlayerExercise,
  ) {
    const nextSkipped =
      !exercise.isSkipped;

    setExercises(
      (
        current,
      ) =>
        current.map(
          (
            item,
          ) =>
            item.id ===
            exercise.id
              ? {
                  ...item,

                  isSkipped:
                    nextSkipped,
                }
              : item,
        ),
    );

    startTransition(
      async () => {
        const result =
          await skipSessionExerciseAction(
            {
              sessionId,

              sessionExerciseId:
                exercise.id,

              isSkipped:
                nextSkipped,
            },
          ).catch(() => ({ success: false as const, message: OFFLINE_ACTION_MESSAGE }));

        if (
          !result.success
        ) {
          setExercises(
            (
              current,
            ) =>
              current.map(
                (
                  item,
                ) =>
                  item.id ===
                  exercise.id
                    ? {
                        ...item,

                        isSkipped:
                          exercise.isSkipped,
                      }
                    : item,
              ),
          );

          setIsError(
            true,
          );

          setMessage(
            result.message,
          );

          return;
        }

        setIsError(
          false,
        );

        setMessage(
          nextSkipped
            ? "Exercise skipped."
            : "Exercise restored.",
        );
      },
    );
  }

  /* =======================================================
     REPLACE
  ======================================================= */

  function replaceExercise(
    exercise:
      WorkoutPlayerExercise,

    replacementExerciseId:
      string,
  ) {
    if (
      !replacementExerciseId ||
      replacementExerciseId ===
        exercise.exerciseId
    ) {
      return;
    }

    startTransition(
      async () => {
        const result =
          await replaceSessionExerciseAction(
            {
              sessionId,

              sessionExerciseId:
                exercise.id,

              replacementExerciseId,
            },
          ).catch(() => ({ success: false as const, message: OFFLINE_ACTION_MESSAGE }));

        if (
          !result.success
        ) {
          setIsError(
            true,
          );

          setMessage(
            result.message,
          );

          return;
        }

        setIsError(
          false,
        );

        setMessage(
          result.message ??
            "Exercise replaced.",
        );

        // The refresh remounts the player: keep what was typed in the other exercises (the replaced one starts fresh).
        const editedSetIds = new Set([...touchedFields].map((key) => key.split(":")[0]));
        writeDraftCarry(sessionId, {
          sets: Object.fromEntries(
            exercises
              .filter((other) => other.id !== exercise.id)
              .flatMap((other) => other.sets)
              .filter((set) => editedSetIds.has(set.id))
              .map((set) => [set.id, { weightKg: set.weightKg, reps: set.reps, rir: set.rir, rpe: set.rpe }]),
          ),
          touched: [...touchedFields].filter((key) => !exercise.sets.some((set) => key.startsWith(`${set.id}:`))),
          dirty: [...dirtySetIds].filter((id) => !exercise.sets.some((set) => set.id === id)),
          sessionRpe,
          sessionNotes,
        });

        router.refresh();
      },
    );
  }

  /* =======================================================
     FINISH
  ======================================================= */

  function finishWorkout() {
    startTransition(
      async () => {
        const result =
          await finishWorkoutAction(
            {
              sessionId,

              sessionRpe,

              notes:
                sessionNotes,
            },
          ).catch(() => ({ success: false as const, message: OFFLINE_ACTION_MESSAGE }));

        if (
          !result.success
        ) {
          setIsError(
            true,
          );

          setMessage(
            result.message,
          );

          return;
        }

        router.push(
          "/dashboard/workouts/history",
        );

        router.refresh();
      },
    );
  }

  /* =======================================================
     EDIT / FOCUS / FINISH CONFIRMATION
  ======================================================= */

  function editSet(
    exercise: WorkoutPlayerExercise,
    set: WorkoutPlayerSet,
    field: SetField,
    value: number | null,
  ) {
    setTouchedFields((current) => new Set(current).add(`${set.id}:${field}`));
    if (set.completed) setDirtySetIds((current) => new Set(current).add(set.id));
    updateSetLocally(exercise.id, set.id, (current) => ({ ...current, [field]: value }));
  }

  function openExercise(exerciseId: string | null) {
    setOpenExerciseId(exerciseId);
    if (!exerciseId) return;
    // After the collapse/expand re-layout; scroll-mt keeps the card below the sticky header and timer.
    window.requestAnimationFrame(() =>
      document.getElementById(`exercise-${exerciseId}`)?.scrollIntoView({ block: "start" }),
    );
  }

  /** Fewer logged than planned sets → ask first. Unlogged sets are never marked complete either way. */
  function requestFinish() {
    if (progress.completed < progress.total) finishDialogRef.current?.showModal();
    else finishWorkout();
  }

  const restStatus =
    timerActive
      ? "Resting"
      : timerRunning
        ? "Rest done — next set"
        : restSeconds > 0
          ? "Paused"
          : "Log a set to start";

  // Success notes clear themselves so the sticky area shrinks back; errors stay until the next action.
  useEffect(() => {
    if (!message || isError) return;
    const timeout = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [message, isError]);

  /* =======================================================
     UI
  ======================================================= */

  return (
    <div className="mx-auto max-w-3xl space-y-2 pb-40 sm:space-y-4 lg:pb-28">
      {/* ===================================================
          HEADER
      =================================================== */}

      <header className="rounded-2xl border-2 border-mf-glass-text bg-mf-surface px-4 py-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-2 text-xs font-bold uppercase tracking-[0.12em] text-amber-400">
          <Dumbbell aria-hidden="true" className="size-4" />
          <span><span className="max-sm:hidden">Workout </span>in progress</span>
          <span className="whitespace-nowrap font-semibold normal-case tracking-normal text-mf-text-muted">
            · Started{" "}
            {formatSessionClock(startedAt, timeZone) ?? "now"}
          </span>
        </div>

        <h1 className="mt-0.5 font-heading text-2xl font-black tracking-tight text-white sm:mt-1 sm:text-4xl">
          {sessionName}
        </h1>

        <div className="mt-2 flex items-center gap-3 sm:mt-3">
          <div
            role="progressbar"
            aria-label="Sets logged"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
            className="h-3 flex-1 overflow-hidden rounded-full border border-mf-glass-text bg-mf-glass-bg"
          >
            <div
              className="h-full bg-mf-glass-brand transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <span className="text-sm font-black tabular-nums text-white">
            {`${progress.completed}/${progress.total}`}
          </span>
        </div>
      </header>

      {/* ===================================================
          REST TIMER + FEEDBACK — sticky below the mobile shell
          header (sticky top-0, h-16, z-30) so it never slides
          under it; top-4 on desktop where that header is hidden.
      =================================================== */}

      <div className="sticky top-[4.5rem] z-20 space-y-2 lg:top-4">
        <section
          aria-label="Rest timer"
          className="flex items-center gap-2 rounded-2xl border-2 border-mf-glass-text bg-mf-surface-elevated/95 px-3 py-1.5 shadow-[var(--shadow-card)] backdrop-blur-xl"
        >
          <Clock3 aria-hidden="true" className={`size-5 shrink-0 max-sm:hidden ${timerActive ? "text-amber-400" : "text-mf-text-muted"}`} />

          {/* One line: label, time and status side by side, so the timer costs one row of height on a phone. */}
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-mf-text-muted">Rest</span>
              <span className="font-heading text-2xl font-black leading-none tabular-nums text-white sm:text-3xl">
                {formatTimer(restSeconds)}
              </span>
              {/* Idle hint ("Log a set to start") wraps to two lines on a 320px phone: kept for screen readers only there. */}
              <span aria-live="polite" className={`text-xs font-semibold text-mf-text-muted ${restSeconds === 0 && !timerActive ? "max-sm:sr-only" : ""}`}>
                {restStatus}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (restSeconds <= 0) return;
              if (timerActive) {
                // Pause keeps what is left; resume restarts the clock from it.
                setRestEndsAt(null);
                setTimerRunning(false);
              } else {
                setRestEndsAt(Date.now() + restSeconds * 1000);
                setTimerRunning(true);
              }
            }}
            disabled={restSeconds <= 0}
            aria-label={timerActive ? "Pause rest timer" : "Start rest timer"}
            className="grid size-11 shrink-0 place-items-center rounded-md border border-mf-glass-border-strong text-zinc-200 transition hover:bg-white/5 disabled:opacity-30"
          >
            {timerActive ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>

          <button
            type="button"
            onClick={() => {
              setRestSeconds((current) => current + 30);
              if (timerActive && restEndsAt !== null) setRestEndsAt(restEndsAt + 30_000);
            }}
            aria-label="Add 30 seconds of rest"
            className="grid h-11 shrink-0 place-items-center rounded-md border border-mf-glass-border-strong px-2 text-sm font-bold tabular-nums text-zinc-200 transition hover:bg-white/5"
          >
            +30s
          </button>

          <button
            type="button"
            onClick={() => {
              setRestSeconds(0);
              setRestEndsAt(null);
              setTimerRunning(false);
            }}
            aria-label="Reset rest timer"
            className="grid size-11 shrink-0 place-items-center rounded-md border border-mf-glass-border-strong text-zinc-200 transition hover:bg-white/5"
          >
            <TimerReset className="size-5" />
          </button>
        </section>

        {pendingSetIds.length > 0 ? (
          <p className="rounded-xl border border-amber-400/20 bg-amber-950/90 px-3 py-2 text-sm font-semibold text-amber-200">
            {pendingSetIds.length === 1 ? "1 set" : `${pendingSetIds.length} sets`} not synced yet — kept on this device.
          </p>
        ) : null}

        {message ? (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 backdrop-blur-xl ${
              isError
                ? "border-red-400/25 bg-red-950/90 text-red-200"
                : "border-emerald-400/25 bg-emerald-950/90 text-emerald-200"
            }`}
          >
            {isError ? <AlertCircle className="size-4 shrink-0" /> : <CheckCircle2 className="size-4 shrink-0" />}
            <p className="text-sm font-semibold">{message}</p>
          </div>
        ) : null}
      </div>

      {/* ===================================================
          EXERCISES — one expanded, the rest summarised
      =================================================== */}

      {exercises.map((exercise, exerciseIndex) => {
        const isOpen = exercise.id === openExerciseId;
        const loggedSets = exercise.sets.filter((set) => set.completed).length;
        const allLogged = exercise.sets.length > 0 && loggedSets === exercise.sets.length;
        const showRpe = exercise.targetRpe !== null || exercise.sets.some((set) => set.rpe !== null);
        // kg gets the most room ("102.5" at 16px must fit at 320px); RIR/RPE are one or two characters.
        const columns = showRpe
          ? "grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_3.25rem]"
          : "grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_3.25rem]";
        const nextExercise = [...exercises.slice(exerciseIndex + 1), ...exercises.slice(0, exerciseIndex)].find(
          (item) => !item.isSkipped && item.sets.some((set) => !set.completed),
        );
        const panelId = `exercise-panel-${exercise.id}`;

        return (
          <section
            key={exercise.id}
            id={`exercise-${exercise.id}`}
            className={`scroll-mt-40 overflow-hidden rounded-2xl bg-mf-surface ${
              isOpen ? "border-2 border-mf-glass-text" : "border border-mf-glass-border"
            } ${exercise.isSkipped ? "opacity-70" : ""}`}
          >
            <h2>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => openExercise(isOpen ? null : exercise.id)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-black ${
                    allLogged
                      ? "bg-emerald-400/15 text-emerald-300"
                      : isOpen
                        ? "bg-mf-glass-text text-mf-glass-bg"
                        : "bg-white/5 text-mf-text-muted"
                  }`}
                >
                  {allLogged ? <Check className="size-4" /> : exerciseIndex + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-heading text-lg font-black uppercase leading-tight text-white sm:text-xl">{exercise.name}</span>
                  <span className="block text-xs text-mf-text-muted">
                    {exercise.isSkipped
                      ? "Skipped"
                      : `${loggedSets}/${exercise.sets.length} sets · ${exercise.repMin}–${exercise.repMax} reps · RIR ${exercise.targetRir ?? 2} · Rest ${exercise.restSeconds}s`}
                  </span>
                </span>

                <ChevronDown
                  aria-hidden="true"
                  className={`size-5 shrink-0 text-mf-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
            </h2>

            {isOpen ? (
              <div id={panelId} className="border-t border-white/10 px-2 pb-3 pt-2 sm:px-4">
                {!exercise.isSkipped ? (
                  <>
                    <div
                      aria-hidden="true"
                      className={`grid ${columns} gap-1.5 px-1 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-mf-text-muted`}
                    >
                      <span className="text-center">Set</span>
                      <span className="text-center">kg</span>
                      <span className="text-center">Reps</span>
                      <span className="text-center">RIR</span>
                      {showRpe ? <span className="text-center">RPE</span> : null}
                      <span />
                    </div>

                    <ol className="space-y-1.5">
                      {exercise.sets.map((set, setIndex) => {
                        const suggestion = set.completed ? null : suggestSetValues(exercise, setIndex);
                        const hint = (field: "weightKg" | "reps") =>
                          set[field] === null && !touchedFields.has(`${set.id}:${field}`)
                            ? (suggestion?.[field] ?? null)
                            : null;
                        const weightHint = hint("weightKg");
                        const repsHint = hint("reps");
                        const hintId = weightHint !== null || repsHint !== null ? `hint-${set.id}` : undefined;
                        const isDirty = dirtySetIds.has(set.id);
                        const isSaving = savingSetId === set.id;
                        const label = `set ${set.setNumber} of ${exercise.name}`;
                        const field = (name: SetField, text: string, step: number, placeholder: number | null) => (
                          <SetInput
                            label={`Set ${set.setNumber} ${text}`}
                            value={set[name]}
                            step={step}
                            inputMode={name === "reps" ? "numeric" : "decimal"}
                            placeholder={placeholder}
                            describedBy={hintId}
                            onChange={(value) => editSet(exercise, set, name, value)}
                          />
                        );

                        return (
                          <li key={set.id}>
                            <div
                              className={`grid ${columns} items-center gap-1.5 rounded-md border p-1 ${
                                set.completed
                                  ? "border-mf-glass-text bg-mf-glass-bg"
                                  : "border-mf-glass-border bg-mf-glass-surface"
                              }`}
                            >
                              {set.completed ? (
                                <span
                                  title="Logged"
                                  className="mx-auto grid size-6 place-items-center rounded-sm bg-mf-glass-text text-mf-glass-bg"
                                >
                                  <Check aria-hidden="true" className="size-4" />
                                  <span className="sr-only">Set {set.setNumber} logged</span>
                                </span>
                              ) : (
                                <span className="text-center font-heading text-lg font-black tabular-nums text-white">{set.setNumber}</span>
                              )}
                              {field("weightKg", "weight (kg)", 0.5, weightHint)}
                              {field("reps", "reps", 1, repsHint)}
                              {field("rir", "RIR", 0.5, null)}
                              {showRpe ? field("rpe", "RPE", 0.5, null) : null}

                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  set.completed && !isDirty
                                    ? saveSet(exercise, set, false)
                                    : saveSet(exercise, set, true, {
                                        weightKg: set.weightKg ?? weightHint,
                                        reps: set.reps ?? repsHint,
                                      })
                                }
                                aria-label={`${set.completed ? (isDirty ? "Save changes to" : "Undo") : "Log"} ${label}`}
                                className={`flex h-12 min-w-0 flex-col items-center justify-center rounded-md text-xs font-black uppercase tracking-wide transition disabled:opacity-50 ${
                                  set.completed && !isDirty
                                    ? "border border-mf-glass-border-strong bg-mf-glass-surface text-mf-glass-text-secondary"
                                    : set.completed
                                      ? "border-2 border-amber-400 text-amber-300"
                                      : "border-2 border-mf-glass-text bg-mf-glass-brand text-mf-glass-brand-ink hover:bg-mf-glass-brand-hover"
                                }`}
                              >
                                {isSaving ? (
                                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                                ) : set.completed && !isDirty ? (
                                  <>
                                    <Check aria-hidden="true" className="size-4" />
                                    Undo
                                  </>
                                ) : set.completed ? (
                                  "Save"
                                ) : (
                                  "Log"
                                )}
                              </button>
                            </div>

                            {hintId && suggestion ? (
                              <p id={hintId} className="px-2 pt-0.5 text-xs text-mf-text-muted">
                                {suggestionLabel(suggestion)} — not logged yet
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ol>

                    {/* Below the rows so the first input stays near the top; the hints above already carry these numbers. */}
                    {exercise.previous ? (
                      <p className="flex items-start gap-2 px-2 pt-2 text-xs text-mf-text-muted">
                        <History aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                        <span suppressHydrationWarning>
                          Last time
                          {exercise.previous.performed_at
                            ? ` (${new Date(exercise.previous.performed_at).toLocaleDateString()})`
                            : ""}
                          :{" "}
                          {exercise.previous.sets
                            .map((set) =>
                              `${set.weightKg === null ? "" : `${set.weightKg} kg × `}${set.reps ?? "–"}${set.rir !== null ? ` @ ${set.rir} RIR` : ""}`,
                            )
                            .join(" · ")}
                        </span>
                      </p>
                    ) : null}

                    {exercise.notes ? (
                      <p className="px-2 pt-2 text-sm leading-6 text-mf-text-muted">{exercise.notes}</p>
                    ) : null}

                    {allLogged && nextExercise ? (
                      <button
                        type="button"
                        onClick={() => openExercise(nextExercise.id)}
                        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-400/40 px-4 text-sm font-bold text-amber-300 transition hover:bg-amber-400/10"
                      >
                        Next: {nextExercise.name}
                      </button>
                    ) : null}
                  </>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
                  <button
                    type="button"
                    onClick={() => skipExercise(exercise)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-zinc-300 transition hover:bg-white/5"
                  >
                    {exercise.isSkipped ? <RefreshCcw aria-hidden="true" className="size-4" /> : <SkipForward aria-hidden="true" className="size-4" />}
                    {exercise.isSkipped ? "Restore" : "Skip"}
                  </button>

                  {allowSubstitution ? (
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Replace {exercise.name}</span>
                      <select
                        defaultValue=""
                        disabled={isPending}
                        onChange={(event) => {
                          replaceExercise(exercise, event.target.value);
                          event.target.value = "";
                        }}
                        className="h-11 w-full min-w-0 rounded-xl border border-white/10 bg-black/40 px-3 text-base! text-zinc-300 outline-none focus:border-amber-400/70"
                      >
                        <option value="">Replace exercise…</option>
                        {replacementOptions
                          .filter(
                            (option) =>
                              option.id !== exercise.exerciseId && option.primaryMuscle === exercise.primaryMuscle,
                          )
                          .map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name} — {option.equipment}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}

      {/* ===================================================
          SESSION REVIEW
      =================================================== */}

      <section className="rounded-2xl border border-white/10 bg-mf-surface p-4 sm:p-5">
        <h2 className="text-base font-black text-white">Session review</h2>

        <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr]">
          <label className="space-y-1">
            <span className="text-sm font-semibold text-mf-text-muted">Session RPE</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              max={10}
              step={0.5}
              value={sessionRpe ?? ""}
              onChange={(event) => setSessionRpe(nullableNumber(event.target.value))}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/40 px-3 text-base! text-white outline-none focus:border-amber-400/70"
              placeholder="1–10"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-semibold text-mf-text-muted">Session notes</span>
            <textarea
              value={sessionNotes}
              onChange={(event) => setSessionNotes(event.target.value)}
              className="min-h-24 w-full rounded-xl border border-white/10 bg-black/40 p-3 text-base! text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/70"
              placeholder="Energy, technique, pain, performance or adjustments..."
            />
          </label>
        </div>
      </section>

      {/* ===================================================
          COMPLETE BAR
      =================================================== */}

      {/* Above the mobile bottom nav; on desktop flush to the bottom, right of the sidebar (w-72) and clear of the floating-controls gutter (pr-24 = FAB column + 16px gap).
          Always shown: hiding it while an input had focus made it reappear under the finger on the blur that a Log tap
          causes. Set inputs carry scroll-mb-40 instead, so focus-scrolling stops above it. */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-white/10 bg-mf-bg/95 px-3 py-2 backdrop-blur-xl sm:py-3 lg:bottom-0 lg:left-72 lg:pr-24">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <p className="shrink-0 text-sm text-mf-text-muted">
            <span className="font-black tabular-nums text-white">{`${progress.completed}/${progress.total}`}</span> sets
          </p>

          <button
            type="button"
            disabled={isPending || progress.completed === 0}
            onClick={requestFinish}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md border-2 border-mf-glass-text bg-mf-action px-4 font-heading text-lg font-bold uppercase tracking-[0.06em] text-mf-action-ink transition hover:bg-mf-action-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <LoaderCircle className="size-5 animate-spin" /> : <CheckCircle2 className="size-5" />}
            {isPending ? "Saving workout..." : "Complete workout"}
          </button>
        </div>
      </div>

      <dialog
        ref={finishDialogRef}
        aria-labelledby="finish-dialog-title"
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border-2 border-mf-glass-text bg-mf-surface-elevated p-5 text-white backdrop:bg-black/70"
      >
        <h2 id="finish-dialog-title" className="font-heading text-2xl font-black uppercase leading-tight">
          You logged {progress.completed} of {progress.total} sets. Finish this workout?
        </h2>
        <p className="mt-2 text-sm text-mf-text-muted">Sets you didn&apos;t log stay unlogged.</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            autoFocus
            onClick={() => finishDialogRef.current?.close()}
            className="min-h-12 flex-1 rounded-md border-2 border-mf-glass-text bg-mf-glass-brand px-4 font-black text-mf-glass-brand-ink transition hover:bg-mf-glass-brand-hover"
          >
            Continue Workout
          </button>
          <button
            type="button"
            onClick={() => {
              finishDialogRef.current?.close();
              finishWorkout();
            }}
            className="min-h-12 flex-1 rounded-md border border-mf-glass-border-strong px-4 font-bold text-zinc-200 transition hover:bg-white/5"
          >
            Finish Anyway
          </button>
        </div>
      </dialog>
    </div>
  );
}

function suggestionLabel(suggestion: SetSuggestion) {
  switch (suggestion.source.kind) {
    case "set":
      return `Suggested from set ${suggestion.source.setNumber}`;
    case "history":
      return "Suggested from last session";
    case "target":
      return "Planned reps";
  }
}

/* =========================================================
   SET INPUT
========================================================= */

type SetInputProps = {
  label: string;
  value: number | null;
  step: number;
  inputMode: "numeric" | "decimal";
  /** Carry-forward hint, shown as a placeholder — never a value until the set is logged. */
  placeholder: number | null;
  describedBy?: string;
  onChange: (value: number | null) => void;
};

function SetInput({ label, value, step, inputMode, placeholder, describedBy, onChange }: SetInputProps) {
  return (
    <input
      type="number"
      data-set-input=""
      inputMode={inputMode}
      enterKeyHint="next"
      aria-label={label}
      aria-describedby={describedBy}
      min={0}
      step={step}
      value={value ?? ""}
      placeholder={placeholder === null ? "–" : String(placeholder)}
      onChange={(event) => onChange(nullableNumber(event.target.value))}
      className="h-12 w-full min-w-0 scroll-mb-40 scroll-mt-40 rounded-md border border-white/10 bg-black/40 px-1 text-center text-base! font-semibold tabular-nums text-white outline-none [appearance:textfield] placeholder:font-normal placeholder:italic placeholder:text-mf-text-muted/70 focus:border-amber-400/70 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}
