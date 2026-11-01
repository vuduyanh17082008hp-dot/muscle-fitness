/**
 * Dante's "Today" context and quick actions for the full Dante page.
 *
 * Real loader results -> these deterministic rules -> Dante UI. Nothing here calls an
 * LLM or invents a value: every line reads only the signals it is given, and a read
 * that failed is reported as unavailable — never as "nothing logged" or "recovered".
 * Quick actions only compose a real user request for the normal chat pipeline.
 */

export type TrainingHold = "recovery" | "unverified" | null;

/** current = verified for today · missing = not logged today · unavailable = the read failed · outdated = from an earlier day. */
export type ContextStatus = "current" | "missing" | "unavailable" | "outdated";

export type DanteContextItem = {
  id: "training" | "recovery" | "nutrition";
  label: string;
  summary: string;
  detail: string | null;
  status: ContextStatus;
  /** ISO time the underlying data was last written, when known. */
  asOf: string | null;
  href: string;
  linkLabel: string;
};

export type DanteTodayContext = {
  localDate: string | null;
  hold: TrainingHold;
  holdNote: string | null;
  items: DanteContextItem[];
  loadedAt: string;
};

export type DanteQuickAction = { id: string; label: string; prompt: string };

export type TodayContextInput = {
  now: Date;
  localDate: string | null;
  hold: TrainingHold;
  training: { status: "ok"; session: { id: string; name: string | null; state: string | null } | null } | { status: "unavailable" };
  /** null = the recovery read failed. */
  recovery: {
    checkinsUnavailable: boolean;
    status: "CURRENT" | "STALE" | "MISSING";
    score: number | null;
    recordedDate: string | null;
    todayUpdatedAt: string | null;
  } | null;
  nutrition: {
    /** null = no targets resolved for this athlete. */
    targets: { calories: number; protein: number } | null;
    /** null or unavailable = the food-log read failed. */
    log: { unavailable: boolean; entries: number; calories: number; protein: number; lastLoggedAt: string | null } | null;
  };
};

const HOLD_NOTE: Record<"recovery" | "unverified", string> = {
  recovery: "Training is on hold — today's check-in flagged pain or illness.",
  unverified: "Training isn't cleared — today's pain/illness check-in couldn't be confirmed.",
};

const sessionName = (name: string | null) => name?.trim() || "Today's workout";

function trainingItem(input: TodayContextInput): DanteContextItem {
  const base = { id: "training" as const, label: "Training", asOf: null, href: "/dashboard/workouts", linkLabel: "Open training" };
  if (input.training.status === "unavailable") {
    return { ...base, summary: "Couldn't load today's workout", detail: null, status: "unavailable" };
  }
  const session = input.training.session;
  if (!session) {
    return { ...base, summary: "Nothing scheduled today", detail: null, status: "current" };
  }
  const name = sessionName(session.name);
  const state =
    session.state === "completed"
      ? "done"
      : session.state === "in_progress" || session.state === "paused"
        ? "in progress"
        : session.state === "cancelled"
          ? "cancelled"
          : "scheduled";
  return {
    ...base,
    summary: `${name} · ${state}`,
    detail: input.hold && state === "scheduled" ? "Not cleared to start while the hold is in place." : null,
    status: "current",
    href: `/dashboard/workouts/session/${session.id}`,
    linkLabel: "View workout",
  };
}

function recoveryItem(input: TodayContextInput): DanteContextItem {
  const base = { id: "recovery" as const, label: "Recovery", href: "/dashboard/recovery", linkLabel: "Open recovery" };
  const r = input.recovery;
  if (!r || r.checkinsUnavailable) {
    return { ...base, summary: "Couldn't load check-ins", detail: "Not treated as clear to train.", status: "unavailable", asOf: null };
  }
  if (r.status === "CURRENT") {
    return {
      ...base,
      summary: r.score !== null ? `Checked in · ${r.score}/100` : "Checked in · not enough to score",
      detail: null,
      status: "current",
      asOf: r.todayUpdatedAt,
    };
  }
  if (r.status === "STALE" && r.recordedDate) {
    return {
      ...base,
      summary: "No check-in today",
      detail: `Last check-in ${r.recordedDate}${r.score !== null ? ` (${r.score}/100)` : ""} — not today's readiness.`,
      status: "outdated",
      asOf: null,
    };
  }
  return { ...base, summary: "No check-in today", detail: "Not logged — Dante won't assume you're recovered.", status: "missing", asOf: null };
}

function nutritionItem(input: TodayContextInput): DanteContextItem {
  const base = { id: "nutrition" as const, label: "Nutrition", href: "/dashboard/nutrition", linkLabel: "Open nutrition" };
  const { targets, log } = input.nutrition;
  const targetLine = targets ? `Targets: ${targets.calories.toLocaleString("en-US")} kcal · ${targets.protein} g protein.` : "No daily targets set.";
  if (!log || log.unavailable) {
    return { ...base, summary: "Couldn't load today's food log", detail: null, status: "unavailable", asOf: null };
  }
  if (log.entries === 0) {
    return { ...base, summary: "Nothing logged today", detail: targetLine, status: "missing", asOf: null };
  }
  const remaining = targets ? Math.max(0, Math.round(targets.protein - log.protein)) : null;
  return {
    ...base,
    summary: `${log.calories.toLocaleString("en-US")} kcal · ${log.protein} g protein logged`,
    detail: remaining !== null ? `${targetLine} ${remaining} g protein left.` : targetLine,
    status: "current",
    asOf: log.lastLoggedAt,
  };
}

export function buildDanteTodayContext(input: TodayContextInput): DanteTodayContext {
  return {
    localDate: input.localDate,
    hold: input.hold,
    holdNote: input.hold ? HOLD_NOTE[input.hold] : null,
    items: [trainingItem(input), recoveryItem(input), nutritionItem(input)],
    loadedAt: input.now.toISOString(),
  };
}

/** Only real, sendable requests; relevance follows the same signals as the context above. */
export function buildDanteQuickActions(input: TodayContextInput): DanteQuickAction[] {
  const actions: DanteQuickAction[] = [
    {
      id: "summary",
      label: "Summarize today",
      prompt: "Summarize my day so far from what I've logged — training, nutrition and recovery — and say what's missing.",
    },
  ];

  // Training — a hold replaces every start/plan/push request with a recovery question.
  if (input.hold === "recovery") {
    actions.push({
      id: "hold",
      label: "Handle today's hold",
      prompt: "My check-in today flagged pain or illness. What is a sensible way to handle today instead of my planned training?",
    });
  } else if (input.hold === "unverified") {
    actions.push({
      id: "hold",
      label: "Before I train",
      prompt: "Today's pain/illness check-in couldn't be confirmed. What should I check before I train?",
    });
  } else if (input.training.status === "ok") {
    const session = input.training.session;
    const name = session ? sessionName(session.name) : null;
    if (session?.state === "completed") {
      actions.push({ id: "review", label: "Review workout", prompt: `Review my ${name} session from today based on what I logged.` });
    } else if (session?.state === "in_progress" || session?.state === "paused") {
      actions.push({ id: "mid-workout", label: "Help mid-workout", prompt: `I'm in the middle of ${name}. What should I keep in mind for the rest of it?` });
    } else if (session && session.state !== "cancelled") {
      actions.push({ id: "prep", label: "Prep today's workout", prompt: `What should I focus on for my ${name} session today?` });
    } else if (!session) {
      actions.push({ id: "plan", label: "What should I train?", prompt: "What should I train today based on my plan and recovery?" });
    }
  }

  // Nutrition — a remaining-protein figure only when both the target and today's log are real.
  const { targets, log } = input.nutrition;
  const logOk = log !== null && !log.unavailable;
  const remaining = targets && logOk ? Math.max(0, Math.round(targets.protein - log.protein)) : null;
  actions.push({
    id: "eat",
    label: "What should I eat?",
    prompt:
      remaining !== null && remaining > 0
        ? `I have ${remaining} g of protein left today out of a ${targets!.protein} g target. What should I eat?`
        : "What should I eat next, based on what I've logged today?",
  });

  // Recovery — skipped under a hold (the hold action already asks it) and when the read failed.
  const r = input.recovery;
  if (!input.hold && r && !r.checkinsUnavailable) {
    if (r.status === "CURRENT" && r.score !== null) {
      actions.push({ id: "recovery", label: "Recovery advice", prompt: `My check-in score today is ${r.score}/100. What does that mean for today?` });
    } else if (r.status !== "CURRENT") {
      actions.push({ id: "checkin", label: "Check-in help", prompt: "I haven't checked in today. What should I log before training?" });
    }
  }

  return actions;
}
