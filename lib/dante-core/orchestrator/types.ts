import type { AthleteState } from "@/lib/athlete-state/types";
import type { DailyDecision } from "@/lib/dante-core/daily-decision-engine";
import type { DanteProposedAction } from "@/lib/dante-core/actions/types";
import type { AutonomyDecision } from "@/lib/dante-core/autonomy/gate";
import type { ScoredScenario } from "@/lib/dante-core/sandbox";
import type { ConfidenceLevel, TraceableDecision } from "@/lib/dante-core/types";
import type { ClientPolicy } from "@/lib/dante-core/policy/types";

/**
 * Orchestrator stages (mission Part 8) — plain TypeScript functions,
 * not five LLM calls. Only the final narrative phrasing (handled
 * OUTSIDE the orchestrator, by lib/dante-core/explain.ts, unchanged)
 * ever touches an LLM; every stage below is deterministic.
 */

export type OrchestratorInput = {
  athleteState: AthleteState;
  policy: ClientPolicy;
  dailyDecision: TraceableDecision<DailyDecision>;
  proposedActions: DanteProposedAction[];
  /** From lib/dante-core/daily-intelligence.ts's cached snapshot — the previous run's summary, if any, so ANALYST can report what actually changed instead of re-describing the whole state every time. */
  previousSnapshot: {
    readinessScore: number | null;
    trainingFocus: string | null;
    recoveryStatus: string | null;
  } | null;
};

export type GatedAction = {
  action: DanteProposedAction;
  autonomyDecision: AutonomyDecision;
  /** Only populated for actions the sandbox actually evaluated alternatives for (currently: training volume/load decisions). Null otherwise — never a fabricated comparison. */
  scenariosConsidered: ScoredScenario[] | null;
  budgetAllowed: boolean;
  budgetReason: string | null;
};

export type OrchestratorResult = {
  /** ANALYST — answers "what changed?" Empty array is a valid, honest answer (nothing notable changed). */
  changes: string[];
  /** SPECIALIST + PLANNER + CHECKER + SAFETY combined output — the actions actually worth surfacing, each carrying its own autonomy decision. */
  gatedActions: GatedAction[];
  /** The single most relevant decision code from the underlying Daily Decision Engine, for a one-line "what should happen next" answer. */
  decisionCode: string;
  confidence: ConfidenceLevel | null;
  warnings: string[];
};
