/**
 * Phase 2 — Conversation coherence types.
 * Persona/session layers only. Phase 1 remains the truth authority.
 */

import type { ObligationLedger } from "@/lib/dante-core/coherence/ledger";
import type {
  HandledObligation,
  ObligationDisposition,
  ObligationIntent,
  TurnObligation,
} from "@/lib/dante-core/runtime-convergence/multi-intent";

export type SessionLifecycle = "NEW" | "CONTINUING" | "RESUME_AFTER_GAP";
export type EntryClass = "SAFETY_PRIORITY" | "STANDARD" | "FAST";
export type SafetyPhase = "NONE" | "ENTER" | "PERSIST" | "ESCALATE" | "DOWNGRADE" | "EXIT";
export type SlotStatus = "ACTIVE" | "SUPERSEDED";
/** Legacy address vocabulary. "bro" is detection-only: it is never projected from state (see AddressStyle). */
export type AddressForm = "ong" | "ban" | "bro" | "tao_may" | "anh_em" | "neutral" | "unresolved";
export type SessionLanguage = "en" | "vi" | "unresolved";
export type DeltaClass = "turn_delta" | "post_turn_delta" | "session_delta";
export type Verbosity = "brief" | "default" | "detailed";
/**
 * How the user's message relates to an already-active persisted safety state ("still there", "getting worse").
 * A cue only — it is consulted against the persisted phase and can never create safety on its own.
 */
export type SafetyFollowUp = "unchanged" | "worse" | "improving" | "resolved";

/* ------------------------------------------------------------------ */
/* Phase 2.5a — minimal adaptive expression profile                    */
/* ------------------------------------------------------------------ */

export type AddressStyle = "NEUTRAL" | "MAY_TAO" | "BAN_TOI" | "ONG_TOI" | "ANH_EM";
export type Familiarity = "NEUTRAL" | "CASUAL" | "FAMILIAR";
export type Humor = "OFF" | "LIGHT";
export type ExpressionVerbosity = "BRIEF" | "DEFAULT" | "DETAILED";
export type ExpressionDimension = "addressStyle" | "familiarity" | "humor" | "verbosity";
export type ExpressionValueMap = {
  addressStyle: AddressStyle;
  familiarity: Familiarity;
  humor: Humor;
  verbosity: ExpressionVerbosity;
};
export type PreferenceSource = "EXPLICIT" | "REPEATED" | "INFERRED";
export type PreferenceScope = "TURN" | "SESSION" | "DURABLE";
export type PreferenceStatus = "ACTIVE" | "SUPERSEDED";

export type CategoricalPreference<T extends string> = {
  value: T;
  source: PreferenceSource;
  scope: PreferenceScope;
  status: PreferenceStatus;
  createdAt: number;
  updatedAt: number;
};

export type UserExpressionProfile = {
  addressStyle?: CategoricalPreference<AddressStyle>;
  familiarity?: CategoricalPreference<Familiarity>;
  humor?: CategoricalPreference<Humor>;
  verbosity?: CategoricalPreference<ExpressionVerbosity>;
};

/** One dimension/value pair — the discriminated union keeps `value` typed by its dimension. */
export type ExpressionChange = {
  [D in ExpressionDimension]: { dimension: D; value: ExpressionValueMap[D] };
}[ExpressionDimension];

export type SupersededPreference = CategoricalPreference<string> & { dimension: ExpressionDimension };

/** One implicit canonical observation. Counted per (dimension, value), never by raw text. */
export type ExpressionObservation = {
  eventId: string;
  dimension: ExpressionDimension;
  value: string;
  /** The USER turn index (state.turnCount) the observation was made on. */
  turn: number;
};

export type ExpressionState = {
  profile: UserExpressionProfile;
  superseded: SupersededPreference[];
  observations: ExpressionObservation[];
  appliedEventIds: string[];
};

export type ContextMode = "SAFETY_SERIOUS" | "SAFETY_INFO" | "NORMAL";

export type ExpressionPlan = {
  addressStyle: AddressStyle;
  familiarity: Familiarity;
  humor: Humor;
  verbosity: ExpressionVerbosity;
  contextMode: ContextMode;
  allowedAddressBehavior: {
    style: AddressStyle;
    /** Second-person tokens Dante may use as a DIRECT vocative for this style (Vietnamese only; English has none). */
    allowedVocatives: readonly string[];
  };
  /** Laughter/emoji markers may appear only in a NORMAL context with humor LIGHT. */
  allowHumorMarkers: boolean;
};

/* ------------------------------------------------------------------ */
/* Phase 2.5a (5R2) — P-10 AUTHORITY BEFORE SURFACE                     */
/* ------------------------------------------------------------------ */

/** Where a block's words came from. Fixed at composition; the guard re-derives it, it never trusts a caller's label. */
export type BlockSource = "SEMANTIC_STATE" | "DETERMINISTIC_DECISION" | "PROVIDER_OUTPUT";
/** What the block may be surfaced AS. Provider prose is UNVERIFIED until the authority guard proves otherwise. */
export type BlockAuthority = "AUTHORITATIVE" | "VERIFIED_DERIVED" | "UNVERIFIED";
export type VerificationStatus = "NOT_REQUIRED" | "PASSED" | "FAILED" | "UNAVAILABLE";
export type DegradeReason =
  | "MISSING_AUTHORITY"
  | "CONTRADICTS_STATE"
  | "FAILED_VERIFICATION"
  | "SAFETY_CONFLICT"
  | "PROVENANCE_CONFLICT";
/** How the block is rendered. Independent of `disposition`: an ANSWERED obligation can still render DEGRADED. */
export type RenderStatus = "NORMAL" | "DEGRADED";

/**
 * One renderable unit of the reply BEFORE persona realization. It reuses the ledger's own identity/disposition (a
 * handled obligation) — there is no second obligation model. `obligationId` is the handled obligation's id, or a
 * stable `composed:*` / `draft` handle for a composed line that is not an obligation.
 *
 * A block is a structured wrapper AND a claim about authority: text alone is never authority. Only a block whose
 * `authority` is AUTHORITATIVE or VERIFIED_DERIVED and whose `renderStatus` is NORMAL may surface its `text`; a
 * DEGRADED block carries only a neutral acknowledgement (the withheld claim is not retained).
 */
export type ResponseBlock = {
  obligationId: string;
  disposition: ObligationDisposition | "COMPOSED";
  /** Content to surface. Persona spans are removed positionally at render time, never reworded. */
  text: string;
  /** Stable order in which the blocks are joined. */
  order: number;
  source: BlockSource;
  authority: BlockAuthority;
  verification: VerificationStatus;
  renderStatus: RenderStatus;
  /** What backs the authority: an obligation id, a state slot, `verifier:pass`, `authority:LATERALITY`… */
  semanticRefs?: string[];
  degradeReason?: DegradeReason;
  /** P-16P: copied from the obligation that owns this block. Realization consumes it; never recomputed from text. */
  decisionState?: import("@/lib/dante-core/coherence/decision-first").DecisionState;
};

export type FeedbackKind =
  | "FACT_CORRECTION"
  | "EXPRESSION_FEEDBACK"
  | "TURN_OVERRIDE"
  | "PREFERENCE_CHANGE"
  | "NORMAL_REQUEST";

export type ExpressionEvent = ExpressionChange & { scope: PreferenceScope; explicit: boolean };

export type ExpressionAnalysis = {
  kind: FeedbackKind;
  events: ExpressionEvent[];
  /** Clauses that try to constrain Dante's behaviour but map to none of the four expression dimensions. */
  coreConflictCandidates: string[];
};

export type CoreConflictLabel = "SYCOPHANCY" | "SAFETY_OVERRIDE" | "DECEPTION" | "EPISTEMIC_WEAKENING";
export type CoreConflictDecision =
  | { status: "NONE" }
  | { status: "UNCERTAIN"; reason: string }
  | { status: "REJECTED"; label: CoreConflictLabel; confidence: number };

/** Bump when the persisted VersionedState shape changes incompatibly. */
export const COHERENCE_STATE_SCHEMA_VERSION = 1;

type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
export type OpenLoopStatus = "ACTIVE" | "AGING" | "DORMANT" | "RESOLVED";

export type ResponseStrategy =
  | "ANSWER"
  | "CLARIFY"
  | "GUIDE"
  | "LISTEN"
  | "REFUSE"
  | "SAFETY_HANDLE"
  | "ACKNOWLEDGE_CORRECTION"
  | "BOUNDARY_RESPECT"
  | "REDIRECT";

export type CoherenceDisposition = ObligationDisposition;

export type VersionedSlot<T> = {
  id: string;
  value: T;
  version: number;
  turnRef: string;
  provenance: string;
  status: SlotStatus;
  supersededBy?: string;
};

export type CorrectionRecord = {
  topic: string;
  statement: string;
};

export type BoundaryRecord = {
  kind: "no_jargon" | "no_memory_dump" | "no_lecturing" | "hide_statistics" | "simple_language" | "custom";
  statement: string;
};

export type CommitmentRecord = {
  kind: "micro" | "task" | "clarification";
  text: string;
};

export type OpenLoop = {
  id: string;
  topic: string;
  status: OpenLoopStatus;
  createdTurn: number;
  lastTouchedTurn: number;
  ttlTurns: number;
};

/** Reducer-internal writable shape. Nothing outside reducer.ts may hold or produce one. */
export type MutableVersionedState = {
  version: number;
  sessionId: string;
  turnCount: number;
  lastTurnRef: string | null;
  lastActivityAt: string | null;
  lifecycle: SessionLifecycle;
  language: VersionedSlot<SessionLanguage>;
  /** Read-only projection of expression.profile.addressStyle, written by the reducer in the same op. */
  address: VersionedSlot<AddressForm>;
  /** Read-only projection of expression.profile.verbosity, written by the reducer in the same op. */
  verbosity: VersionedSlot<Verbosity>;
  /** Phase 2.5a: the user's expression profile — the authority for address/familiarity/humor/verbosity. */
  expression: ExpressionState;
  corrections: VersionedSlot<CorrectionRecord>[];
  boundaries: VersionedSlot<BoundaryRecord>[];
  commitments: VersionedSlot<CommitmentRecord>[];
  openLoops: OpenLoop[];
  topicStack: string[];
  safety: {
    phase: SafetyPhase;
    category: string | null;
    turnRef: string | null;
    lastEmittedTurn: number | null;
    consecutiveSafetyTurns: number;
  };
  adviceSignatures: string[];
  responseSignatures: string[];
  lastAdviceSignature: string | null;
  lastResponseSignature: string | null;
  lastUserQuestionSignature: string | null;
  lastAnswerUnclear: boolean;
  safetyWarningSignature: string | null;
  safetyWarningCount: number;
  appliedDeltaIds: string[];
};

/**
 * Authoritative state as seen by every stage except the reducer. Deeply readonly at the type level and
 * frozen at runtime, so a stage cannot write it — only `applyDelta` / `createInitialState` /
 * `restoreVersionedState` in reducer.ts produce new instances.
 */
export type VersionedState = DeepReadonly<MutableVersionedState>;

export type DeltaOp =
  | { op: "set_language"; value: SessionLanguage; provenance: string }
  | { op: "set_address"; value: AddressForm; provenance: string }
  | { op: "set_verbosity"; value: Verbosity; provenance: string }
  | { op: "set_lifecycle"; value: SessionLifecycle }
  | { op: "resume_after_gap" }
  | { op: "upsert_correction"; topic: string; statement: string; provenance: string }
  | { op: "upsert_boundary"; kind: BoundaryRecord["kind"]; statement: string; provenance: string }
  | { op: "add_commitment"; kind: CommitmentRecord["kind"]; text: string; provenance: string }
  | { op: "open_loop"; topic: string; ttlTurns?: number }
  | { op: "touch_loop"; topic: string }
  | { op: "resolve_loop"; topic: string }
  | { op: "age_loops" }
  | { op: "push_topic"; topic: string }
  | { op: "set_safety_phase"; phase: SafetyPhase; category: string | null }
  | { op: "record_advice"; signature: string }
  | { op: "record_response"; signature: string }
  | { op: "mark_unclear"; value: boolean }
  | { op: "record_user_question"; signature: string }
  | { op: "record_safety_warning"; signature: string }
  /** Implicit canonical observation (counts toward promotion). eventId = turn-scoped identity, for idempotent replay. */
  | { op: "expression_observe"; eventId: string; atMs: number; change: ExpressionChange }
  /** Explicit expression preference. Durable scope supersedes a conflicting durable value immediately (P-4). */
  | { op: "expression_set"; eventId: string; atMs: number; scope: "SESSION" | "DURABLE"; change: ExpressionChange }
  /** Idle > 30 min: the implicit observation window restarts. */
  | { op: "expression_reset_window" };

export type StateDelta = {
  deltaId: string;
  class: DeltaClass;
  turnRef: string;
  sourceVersion: number;
  at?: string;
  ops: DeltaOp[];
};

export type ChatHistoryTurn = {
  role: "user" | "assistant";
  text: string;
  at?: string | null;
};

export type CorrectionCandidate = {
  topic: string;
  statement: string;
  conflictsWith?: string;
  /**
   * Set only on a value the SAME message asserted and then explicitly corrected. It is emitted first, followed by
   * the corrected value, so the reducer records it and supersedes it — history kept, authority to the correction.
   */
  role?: "earlier_assertion";
};

export type BoundaryCandidate = {
  kind: BoundaryRecord["kind"];
  statement: string;
};

export type CommitmentCandidate = {
  kind: CommitmentRecord["kind"];
  text: string;
};

export type SafetyCandidate = {
  present: boolean;
  current: boolean;
  historicalOnly: boolean;
  category: string | null;
};

export type TurnAnalysis = {
  obligations: TurnObligation[];
  intents: ObligationIntent[];
  corrections: CorrectionCandidate[];
  boundaries: BoundaryCandidate[];
  commitments: CommitmentCandidate[];
  safetyCandidates: SafetyCandidate;
  /** Cue about an already-active safety state ("still there", "worse", "better"). Only consulted against persisted phase. */
  safetyFollowUp: SafetyFollowUp | null;
  verbosityCandidate: Verbosity | null;
  /** Phase 2.5a feedback interpretation: canonical expression events + core-conflict candidates. */
  expression: ExpressionAnalysis;
  languageSignal: SessionLanguage;
  addressSignal: AddressForm;
  /** The address form came from an explicit instruction, not just usage — it may replace an established one. */
  addressExplicit: boolean;
  /** Raw → normalized → segments → obligations (provenance of every obligation is a raw-text span). */
  ledger: ObligationLedger;
  ledgerCoverage: { ok: boolean; uncovered: number[]; requestSegments: number; coveredSegments: number };
  explicitLanguageSwitch: boolean;
  mixedCodeSwitch: boolean;
  profanityWithoutSafety: boolean;
  unclearPriorAsk: boolean;
  competingCorrections: boolean;
  proposedOps: DeltaOp[];
};

export type GateResult = {
  passed: boolean;
  code: string | null;
  message: string | null;
};

export type PostTurnEvent = {
  eventId: string;
  turnId: string;
  stateVersion: number;
  timestamp: string;
  type:
    | "RESPONSE_EMITTED"
    | "ADVICE_GIVEN"
    | "OPEN_LOOP_CREATED"
    | "OPEN_LOOP_RESOLVED"
    | "SAFETY_MESSAGE_EMITTED"
    | "BOUNDARY_ACKNOWLEDGED"
    | "COMMITMENT_CREATED";
  obligationIds?: string[];
  responseSignature?: string;
  adviceSignature?: string;
  strategyIds?: ResponseStrategy[];
  metadata?: Record<string, string>;
};

export type CoherenceTurnResult = {
  snapshotVersion: number;
  state: VersionedState;
  entryClass: EntryClass;
  lifecycle: SessionLifecycle;
  analysis: TurnAnalysis;
  strategies: ResponseStrategy[];
  handledObligations: Array<HandledObligation & { coherenceDisposition?: CoherenceDisposition }>;
  /** The guarded blocks the reply was rendered from (authority decided, provider claims already degraded). */
  responseBlocks: ResponseBlock[];
  response: string;
  language: "en" | "vi";
  address: AddressForm;
  gateA: GateResult;
  gateB: GateResult;
  gateC: GateResult;
  finalGate: GateResult;
  repairAttempts: number;
  degraded: boolean;
  postTurnEvents: PostTurnEvent[];
  postTurnFailed: boolean;
  extraLlmCalls: 0;
  expressionPlan: ExpressionPlan;
  /** Persona Gate: repair attempts spent (hard cap 2), whether the deterministic neutral renderer replaced the draft. */
  persona: { repairAttempts: number; fallback: boolean; violations: string[]; warnings: string[] };
  audit: {
    silentDrop: string[];
    dispositions: Record<string, CoherenceDisposition>;
    safetyPhase: SafetyPhase;
    adviceAction: "repeat" | "clarify" | "rephrase" | "change_angle" | "shorten" | "suppress_warning" | "none";
  };
};
