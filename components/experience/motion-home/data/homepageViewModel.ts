/**
 * Presentation-safe view model for the homepage (`/`). This is the ONLY shape
 * the scene components read from — no scene ever calls Supabase, a
 * service module, or Dante directly. Pure types + fallbacks here (no
 * server-only imports) so this file is safe to import from client
 * components too.
 */

export type ExperienceMode = "anonymous" | "authenticated";

export type TrainingViewModel = {
  hasLiveSession: boolean;
  sessionName: string;
  focus: string;
  progressionNote: string;
};

export type RecoveryViewModel = {
  hasLiveScore: boolean;
  /** 0-100, already clamped. */
  readiness: number;
  status: string;
  sleepHours: number | null;
};

export type AdaptViewModel = {
  selectedPath: string;
  rejectedPaths: string[];
  note: string;
};

export type DanteViewModel = {
  available: boolean;
  statusLabel: string;
};

/** Today's tracked-nutrition preview — same source of truth as /dashboard/nutrition's food log, never a separate/invented target. */
export type NutritionViewModel = {
  hasLiveTarget: boolean;
  proteinTargetG: number | null;
  proteinConsumedG: number;
  remainingLabel: string;
};

/** One representative muscle from Training Intelligence — never a diagnosis, always "modeled/estimated" per lib/athlete-state's own framing. */
export type MuscleViewModel = {
  hasLiveData: boolean;
  focusMuscle: string;
  weeklyEffectiveSets: number;
  changeLabel: string;
};

export type HomepageRoutes = {
  login: string;
  signup: string;
  dashboard: string;
  progress: string;
  training: string;
  recovery: string;
  chatbot: string;
  nutrition: string;
  muscleIntelligence: string;
  aiFair: string;
  responsibleAi: string;
};

export type MotionHomepageViewModel = {
  mode: ExperienceMode;
  training: TrainingViewModel;
  recovery: RecoveryViewModel;
  nutrition: NutritionViewModel;
  muscle: MuscleViewModel;
  adapt: AdaptViewModel;
  dante: DanteViewModel;
  routes: HomepageRoutes;
};

export const HOMEPAGE_ROUTES: HomepageRoutes = {
  login: "/login",
  signup: "/signup",
  dashboard: "/dashboard",
  progress: "/dashboard",
  training: "/training",
  recovery: "/dashboard/recovery",
  chatbot: "/chatbot",
  nutrition: "/meal-plan",
  muscleIntelligence: "/dashboard/training-intelligence",
  aiFair: "/ai-fair",
  responsibleAi: "/responsible-ai",
};

/** Illustrative preview shown to anonymous visitors and as the safe
 * fallback when a personalized fetch is unavailable or fails. Never
 * presented as a specific user's live data — labeled in the UI. */
export const FALLBACK_VIEW_MODEL: MotionHomepageViewModel = {
  mode: "anonymous",
  training: {
    hasLiveSession: false,
    sessionName: "Push Day",
    focus: "Bench Press · 4×6 @ RIR 2",
    progressionNote: "Illustrative progression preview",
  },
  recovery: {
    hasLiveScore: false,
    readiness: 72,
    status: "Ready",
    sleepHours: 7.5,
  },
  nutrition: {
    hasLiveTarget: false,
    proteinTargetG: 160,
    proteinConsumedG: 96,
    remainingLabel: "64g protein remaining",
  },
  muscle: {
    hasLiveData: false,
    focusMuscle: "Chest",
    weeklyEffectiveSets: 14,
    changeLabel: "+2 sets vs last week",
  },
  adapt: {
    selectedPath: "Build",
    rejectedPaths: ["Deload", "Maintain"],
    note: "Illustrative adaptive path",
  },
  dante: {
    available: true,
    statusLabel: "Dante Core · Online",
  },
  routes: HOMEPAGE_ROUTES,
};
