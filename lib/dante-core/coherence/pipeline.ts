/**
 * Phase 2 — shared control pipeline overlay.
 * Phase 1 produces authoritative drafts/dispositions.
 * This module owns session, strategy, persona, gates, repair, post-turn.
 * extra mandatory LLM calls = 0.
 */

import { createHash } from "node:crypto";
import { checkSafety, type SafetyCheckResult } from "@/lib/dante-core/safety-layer";
import type { RecoveredSafety } from "@/lib/dante-core/coherence/safety-evidence";
import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { buildJointPainCoachingResponse, extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";
import { coachingTopicOf, isThinContinuation } from "@/lib/dante-core/coherence/presentation";
import {
  isMultiIntentTurn,
  resolveMultiIntentTurn,
  type HandledObligation,
} from "@/lib/dante-core/runtime-convergence/multi-intent";
import { buildConfidenceDeterministicReply } from "@/lib/dante-core/confidence-engine/deterministic-reply";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import {
  buildSocialBoundaryResponse,
  createSocialRouterSession,
  evaluateSocialBoundary,
} from "@/lib/dante-core/social-boundary-router";
import { applyDelta, createInitialState, freezeSnapshot } from "@/lib/dante-core/coherence/reducer";
import { loadSessionSnapshot, reconcileLifecycle, routeEntry } from "@/lib/dante-core/coherence/session";
import { undisposedObligations } from "@/lib/dante-core/coherence/ledger";
import { analyzeTurn, evaluateGateA, resolveLanguage } from "@/lib/dante-core/coherence/analysis";
import {
  IDLE_RESET_MS,
  resolveContextMode,
  resolveExpressionPlan,
  toAddressForm,
  type TurnOverride,
} from "@/lib/dante-core/coherence/expression";
import { enforcePersonaGate, type PersonaRepair } from "@/lib/dante-core/coherence/persona-gate";
import {
  authorizeBlocks,
  buildAuthorityContext,
  decisionBlock,
  providerBlock,
} from "@/lib/dante-core/coherence/authority";
import { applyTargetBinding, confidenceReplyEligible } from "@/lib/dante-core/coherence/target-binding";
import { applyObligationScopesToBlocks, stampBlockScopeProvenance } from "@/lib/dante-core/reasoning-scope";
import type { AuthoritativeResponseState } from "@/lib/dante-core/runtime-convergence/authoritative-state";
import { composeStrategies, evaluateGateB, nextSafetyPhase } from "@/lib/dante-core/coherence/strategy";
import {
  adviceSignature,
  classifyRepetition,
  composeResponseBlocks,
  joinResponseBlocks,
  questionSignature,
  realizePersona,
} from "@/lib/dante-core/coherence/realize";
import { allowedFactorsOf, applyDecisionFirst, resolveDecisionState, type DecisionState } from "@/lib/dante-core/coherence/decision-first";
import { applyPersistedSafetyConstraint, resolvePersistedSafetyApplication } from "@/lib/dante-core/coherence/safety-persistence";
import {
  degradedFallback,
  evaluateFinalCoherence,
  evaluateGateC,
  surfaceRepair,
} from "@/lib/dante-core/coherence/gates";
import type {
  ChatHistoryTurn,
  CoherenceTurnResult,
  CoreConflictDecision,
  DeltaOp,
  ExpressionChange,
  ExpressionPlan,
  GateResult,
  PostTurnEvent,
  ResponseBlock,
  StateDelta,
  TurnAnalysis,
  VerificationStatus,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

/**
 * Canonical expression events -> reducer ops. Admissibility already happened in the interpreter (only the four
 * expression dimensions ever reach here). A TURN event never becomes an op — it lives in the plan for this turn only,
 * so it can never touch, supersede or leak into the durable profile. Unauthenticated sessions never get a DURABLE
 * scope: their explicit preferences are session-scoped and never written to a durable row.
 */
function buildExpressionOps(input: {
  analysis: TurnAnalysis;
  turnRef: string;
  atMs: number;
  authenticated: boolean;
  idleMs: number | null;
}): { ops: DeltaOp[]; turnOverride: TurnOverride } {
  const ops: DeltaOp[] = [];
  const turnOverride: TurnOverride = {};
  // Idle > 30 min: the implicit observation window restarts before this turn's observation is counted.
  if (input.idleMs !== null && input.idleMs > IDLE_RESET_MS) ops.push({ op: "expression_reset_window" });
  for (const event of input.analysis.expression.events) {
    if (event.scope === "TURN") {
      (turnOverride as Record<string, string>)[event.dimension] = event.value;
      continue;
    }
    const change = { dimension: event.dimension, value: event.value } as ExpressionChange;
    const eventId = `${input.turnRef}:${event.dimension}:${event.value}:${event.explicit ? "x" : "i"}`;
    if (event.explicit) {
      ops.push({
        op: "expression_set",
        eventId,
        atMs: input.atMs,
        scope: input.authenticated && event.scope === "DURABLE" ? "DURABLE" : "SESSION",
        change,
      });
    } else {
      ops.push({ op: "expression_observe", eventId, atMs: input.atMs, change });
    }
  }
  return { ops, turnOverride };
}

function idleMsBetween(previousIso: string | null | undefined, nowIso: string | null | undefined): number | null {
  const previous = previousIso ? Date.parse(previousIso) : Number.NaN;
  const now = nowIso ? Date.parse(nowIso) : Number.NaN;
  return Number.isFinite(previous) && Number.isFinite(now) ? now - previous : null;
}

/** Test-only sabotage: a "repair" that re-introduces the violations it was asked to remove. */
const sabotagedPersonaRepair: PersonaRepair = (draft) => `Bro, ${draft} 😂`;

function replayDurableHistory(base: VersionedState, history: ChatHistoryTurn[]): VersionedState {
  let state = base;
  const users = history.filter((turn) => turn.role === "user" && turn.text.trim());
  for (const [index, turn] of users.entries()) {
    const analysis = analyzeTurn({ message: turn.text, snapshot: freezeSnapshot(state) });
    const turnRef = `hist${index + 1}`;
    // History is supporting evidence, not authority: its explicit preferences are replayed session-scoped only.
    const expression = buildExpressionOps({
      analysis,
      turnRef,
      atMs: Date.parse(turn.at ?? "") || 0,
      authenticated: false,
      idleMs: idleMsBetween(state.lastActivityAt, turn.at),
    });
    const ops: DeltaOp[] = [
      { op: "age_loops" },
      ...analysis.proposedOps.filter((op) => op.op !== "set_safety_phase"),
      ...expression.ops,
    ];
    state = applyDelta(state, {
      deltaId: deltaId(turnRef, "hist", ops),
      class: "turn_delta",
      turnRef,
      sourceVersion: state.version,
      at: turn.at ?? undefined,
      ops,
    });
  }
  if (base.lifecycle === "RESUME_AFTER_GAP") {
    // Resume goes through the reducer (session_delta), never by rebuilding state here.
    state = reconcileLifecycle(state, "RESUME_AFTER_GAP");
  }
  return state;
}

function deltaId(turnRef: string, klass: string, ops: DeltaOp[]): string {
  const payload = JSON.stringify({ turnRef, klass, ops });
  return createHash("sha256").update(payload).digest("hex").slice(0, 20);
}

function producePhase1Draft(input: {
  message: string;
  language: "en" | "vi";
  analysis: ReturnType<typeof analyzeTurn>;
  topicStack?: readonly string[];
}): { draft: string; handled: HandledObligation[] } {
  const safety = checkSafety(input.message);
  const ctsEarly = extractCurrentTurnState(input.message);
  const jointEarly = buildJointPainCoachingResponse(ctsEarly, input.language);
  if (jointEarly && !(safety.triggered && safety.responseMode === "HARD_BLOCK")) {
    return { draft: jointEarly, handled: [] };
  }
  if (safety.triggered && safety.responseOverride && input.analysis.safetyCandidates.current) {
    return {
      draft: safety.responseOverride,
      handled: input.analysis.obligations.map((o) => ({
        ...o,
        disposition: o.intent === "TEMPORAL_SAFETY" ? "SAFETY_HANDLED" : "ANSWERED",
        text: o.intent === "TEMPORAL_SAFETY" ? safety.responseOverride as string : "",
      })),
    };
  }
  if (isMultiIntentTurn(input.analysis.obligations)) {
    const multi = resolveMultiIntentTurn({
      message: input.message,
      language: input.language,
      obligations: input.analysis.obligations,
    });
    return { draft: multi.reply, handled: multi.handledObligations };
  }
  if (input.analysis.competingCorrections) {
    return { draft: "", handled: [] };
  }
  const social = evaluateSocialBoundary(input.message, { session: createSocialRouterSession() });
  if (
    ["FIRM_BOUNDARY", "HARD_BOUNDARY", "ANTI_MANIPULATION"].includes(social.mode)
    && input.analysis.obligations.length === 0
    && !input.analysis.profanityWithoutSafety
  ) {
    return { draft: buildSocialBoundaryResponse(social, input.language), handled: [] };
  }
  const cts = ctsEarly;
  if (isThinContinuation(input.message) && (input.topicStack ?? []).includes("bench")) {
    return {
      draft: input.language === "vi"
        ? "Đừng lấy mức bench của người khác làm bảng điểm. Chọn mức bạn kiểm soát sạch và lấy lần tăng nhỏ tiếp theo làm mục tiêu."
        : "Stop using their 225 as your scoreboard. Pick a bench weight you can control cleanly and make your next small improvement the target. Chase your next rep or small plate, not someone else's number.",
      handled: [],
    };
  }
  const conf = buildConfidenceDeterministicReply(
    assessTurnConfidence({ message: input.message, currentState: cts }),
    input.language,
    { message: input.message },
  );
  if (conf && confidenceReplyEligible({ reply: conf, obligations: input.analysis.obligations, message: input.message })) {
    return { draft: conf, handled: [] };
  }
  interpretUserTurn(input.message);
  return { draft: "", handled: [] };
}

function buildPostTurnEvents(input: {
  turnRef: string;
  now: string;
  version: number;
  handled: HandledObligation[];
  responseSignature: string;
  adviceSignature: string;
  strategies: CoherenceTurnResult["strategies"];
  safetyPhase: CoherenceTurnResult["audit"]["safetyPhase"];
}): PostTurnEvent[] {
  const events: PostTurnEvent[] = [
    {
      eventId: `${input.turnRef}:emit`,
      turnId: input.turnRef,
      stateVersion: input.version,
      timestamp: input.now,
      type: "RESPONSE_EMITTED",
      responseSignature: input.responseSignature,
      adviceSignature: input.adviceSignature,
      strategyIds: input.strategies,
      obligationIds: input.handled.map((h) => h.id),
    },
  ];
  if (input.handled.length > 0) {
    events.push({
      eventId: `${input.turnRef}:advice`,
      turnId: input.turnRef,
      stateVersion: input.version,
      timestamp: input.now,
      type: "ADVICE_GIVEN",
      adviceSignature: input.adviceSignature,
    });
  }
  if (input.safetyPhase === "ENTER" || input.safetyPhase === "PERSIST" || input.safetyPhase === "ESCALATE") {
    events.push({
      eventId: `${input.turnRef}:safety`,
      turnId: input.turnRef,
      stateVersion: input.version,
      timestamp: input.now,
      type: "SAFETY_MESSAGE_EMITTED",
    });
  }
  return events;
}

export type PreparedCoherence = {
  snapshot: VersionedState;
  state: VersionedState;
  turnRef: string;
  now: string;
  analysis: ReturnType<typeof analyzeTurn>;
  entryClass: ReturnType<typeof routeEntry>;
  language: "en" | "vi";
  address: VersionedState["address"]["value"];
  strategies: ReturnType<typeof composeStrategies>;
  safetyPhase: ReturnType<typeof nextSafetyPhase>;
  gateA: CoherenceTurnResult["gateA"];
  gateB: CoherenceTurnResult["gateB"];
  /** The authoritative expression plan for this turn (profile + TURN override + safety context). */
  expressionPlan: ExpressionPlan;
  /** Core-conflict decision for this turn's behaviour-constraining clauses (null when none was attempted). */
  coreConflict: CoreConflictDecision | null;
  forcePersonaFail?: boolean;
  forceRepairFail?: boolean;
  forcePersonaRepairFail?: boolean;
  failPostTurn?: boolean;
};

export function prepareCoherenceTurn(input: {
  message: string;
  now: string;
  prior?: VersionedState | null;
  history?: ChatHistoryTurn[];
  sessionId?: string;
  /** Route-supplied safety decision. Omitted (tests, offline callers) → decided from the message alone. */
  safety?: SafetyCheckResult;
  /**
   * Store outage only: an active safety episode rebuilt from the request's recent conversation. Applied through the
   * reducer as a turn_delta, so the reducer stays the only writer; healthy paths never pass it.
   */
  recoverSafety?: RecoveredSafety | null;
  /**
   * P-6: durable personalization exists only for an authenticated user_id. false -> preferences stay session-scoped.
   * Defaults to true (the route has already required a signed-in user).
   */
  authenticated?: boolean;
  /** Result of the conditional core-conflict classifier (decided by the async persistence layer), if it ran. */
  coreConflict?: CoreConflictDecision | null;
  forcePersonaFail?: boolean;
  forceRepairFail?: boolean;
  forcePersonaRepairFail?: boolean;
  failPostTurn?: boolean;
}): PreparedCoherence {
  const loaded = loadSessionSnapshot({
    prior: input.prior ?? null,
    history: input.history ?? [],
    now: input.now,
    sessionId: input.sessionId,
  });
  const replayed = !input.prior && (input.history?.length ?? 0) > 0
    ? replayDurableHistory(loaded, input.history ?? [])
    : loaded;
  const snapshot = input.recoverSafety && replayed.safety.phase === "NONE"
    ? applyDelta(replayed, {
      deltaId: deltaId("outage_recovery", "turn", [{ op: "set_safety_phase", phase: input.recoverSafety.phase, category: input.recoverSafety.category }]),
      class: "turn_delta",
      turnRef: "outage_recovery",
      sourceVersion: replayed.version,
      at: input.now,
      ops: [{ op: "set_safety_phase", phase: input.recoverSafety.phase, category: input.recoverSafety.category }],
    })
    : replayed;
  const turnRef = `t${snapshot.turnCount + 1}`;
  const safety = input.safety ?? checkSafety(input.message);
  let analysis = analyzeTurn({ message: input.message, snapshot, safety });
  let gateA = evaluateGateA({ analysis, snapshot, attempt: 1 });
  if (!gateA.passed && gateA.code !== "COMPETING_CORRECTIONS") {
    analysis = analyzeTurn({ message: input.message, snapshot, safety });
    gateA = evaluateGateA({ analysis, snapshot, attempt: 2 });
  }

  const entryClass = routeEntry(analysis, snapshot);
  const language = resolveLanguage({ snapshot, analysis });
  const expression = buildExpressionOps({
    analysis,
    turnRef,
    atMs: Date.parse(input.now) || 0,
    authenticated: input.authenticated !== false,
    idleMs: idleMsBetween(snapshot.lastActivityAt, input.now),
  });

  const turnOps: DeltaOp[] = [
    { op: "age_loops" },
    ...analysis.proposedOps.filter((op) => {
      if (op.op === "set_language" && analysis.mixedCodeSwitch && !analysis.explicitLanguageSwitch) return false;
      return true;
    }),
    ...expression.ops,
  ];
  if (language === "en" || language === "vi") {
    if (snapshot.language.value === "unresolved" || analysis.explicitLanguageSwitch) {
      if (!turnOps.some((op) => op.op === "set_language")) {
        turnOps.push({
          op: "set_language",
          value: language,
          provenance: analysis.explicitLanguageSwitch ? "explicit_switch" : "session_init",
        });
      }
    }
  }
  // A session with at least one committed turn is CONTINUING from here on (persisted, so the next request
  // does not need a lifecycle-only delta).
  turnOps.push({ op: "set_lifecycle", value: "CONTINUING" });
  const coachingTopic = coachingTopicOf(input.message);
  if (coachingTopic) turnOps.push({ op: "push_topic", topic: coachingTopic });
  if (analysis.intents[0]) turnOps.push({ op: "push_topic", topic: analysis.intents[0] });
  if (analysis.unclearPriorAsk) {
    turnOps.push({ op: "open_loop", topic: "clarification" });
  } else if (/\?/.test(input.message) || analysis.obligations.length > 0) {
    turnOps.push({ op: "open_loop", topic: analysis.intents[0] ?? "task" });
  }

  const safetyPhase = nextSafetyPhase({
    snapshot,
    analysis,
    hardSafetyTriggered: Boolean(safety.triggered && analysis.safetyCandidates.current),
  });
  turnOps.push({
    op: "set_safety_phase",
    phase: safetyPhase,
    category: analysis.safetyCandidates.category,
  });

  const turnDelta: StateDelta = {
    deltaId: deltaId(turnRef, "turn", turnOps),
    class: "turn_delta",
    turnRef,
    sourceVersion: snapshot.version,
    at: input.now,
    ops: turnOps,
  };
  const state = applyDelta(snapshot, turnDelta);
  // ExpressionPlan is built AFTER truth/safety state is settled; nothing in it flows back into factual reasoning.
  const expressionPlan = resolveExpressionPlan({
    profile: state.expression.profile,
    turnOverride: expression.turnOverride,
    contextMode: resolveContextMode({ safetyPhase, safetyMentioned: analysis.safetyCandidates.present }),
  });
  const address = toAddressForm(expressionPlan.addressStyle);
  const strategies = composeStrategies({
    analysis,
    safetyPhase,
    competingCorrections: analysis.competingCorrections,
    entryClass,
    snapshot,
  });
  let gateB = evaluateGateB({ snapshot: state, analysis, strategies, safetyPhase });
  const resolvedStrategies = !gateB.passed
    ? composeStrategies({
      analysis,
      safetyPhase,
      competingCorrections: analysis.competingCorrections,
      entryClass: "STANDARD",
      snapshot,
    })
    : strategies;
  if (!gateB.passed) {
    gateB = evaluateGateB({ snapshot: state, analysis, strategies: resolvedStrategies, safetyPhase });
  }

  return {
    snapshot,
    state,
    turnRef,
    now: input.now,
    analysis,
    entryClass,
    language,
    address,
    strategies: resolvedStrategies,
    safetyPhase,
    gateA,
    gateB,
    expressionPlan,
    coreConflict: input.coreConflict ?? null,
    forcePersonaFail: input.forcePersonaFail,
    forceRepairFail: input.forceRepairFail,
    forcePersonaRepairFail: input.forcePersonaRepairFail,
    failPostTurn: input.failPostTurn,
  };
}

export function finishCoherenceDraft(input: {
  prepared: PreparedCoherence;
  message: string;
  phase1Draft?: string;
  handledObligations?: HandledObligation[];
  /** Who wrote `phase1Draft` when no handled obligation carries it. Provider replies say PROVIDER_OUTPUT. */
  draftSource?: "DETERMINISTIC_DECISION" | "PROVIDER_OUTPUT";
  /** Phase 1 authoritative state for this turn: the authority the guard compares provider claims against. */
  authoritative?: AuthoritativeResponseState | null;
  /** Result of an existing verification path for provider prose (the route's verifier). Absent → UNAVAILABLE (fail-closed). */
  providerVerification?: VerificationStatus;
  /** P-16U test hook: override upstream DecisionState. Production omits this. */
  decisionState?: DecisionState;
  allowedFactors?: readonly string[];
}): CoherenceTurnResult {
  const prepared = input.prepared;
  const { analysis, language, address, strategies, safetyPhase } = prepared;
  let state = prepared.state;

  const phase1 = input.phase1Draft != null
    ? { draft: input.phase1Draft, handled: input.handledObligations ?? [] }
    : producePhase1Draft({ message: input.message, language, analysis, topicStack: prepared.state.topicStack });

  // The draft is provider prose only when the caller says so (finalizeProviderReply / an obligation marked by origin).
  const draftSource = input.phase1Draft != null ? input.draftSource : "DETERMINISTIC_DECISION";
  let responseBlocks: ResponseBlock[] = composeResponseBlocks({
    handled: phase1.handled,
    strategies,
    analysis,
    snapshot: state,
    language,
    safetyPhase,
    competingCorrections: analysis.competingCorrections,
    phase1Draft: phase1.draft,
    message: input.message,
    draftSource,
  });
  if (responseBlocks.length === 0 && phase1.draft) {
    responseBlocks = [draftSource === "PROVIDER_OUTPUT"
      ? providerBlock("draft", "COMPOSED", phase1.draft)
      : decisionBlock("draft", "COMPOSED", phase1.draft)];
  }
  // AUTHORITY BEFORE SURFACE (P-10): every block's authority is decided here, on the happy path too. Persona validity and
  // being a ResponseBlock are not authority; provider claims reach the surface only if state (or an existing verifier)
  // backs them, otherwise they degrade block-by-block. Both realizations below render through the same contract.
  const authorityCtx = buildAuthorityContext({
    authoritative: input.authoritative ?? null,
    state,
    safetyPhase,
    safetyCategory: analysis.safetyCandidates.category ?? state.safety.category,
    safetyMentioned: analysis.safetyCandidates.present,
  });
  responseBlocks = authorizeBlocks({
    blocks: responseBlocks,
    ctx: authorityCtx,
    handled: phase1.handled,
    providerVerification: input.providerVerification,
    language,
  });
  // P-13 / P-14: authority is necessary, not sufficient — stale/unknown blocks cannot own the surface.
  responseBlocks = applyTargetBinding({
    blocks: responseBlocks,
    currentObligations: analysis.obligations,
    handled: phase1.handled,
    snapshot: state,
    language,
    safetyPhase,
    message: input.message,
  });
  responseBlocks = stampBlockScopeProvenance(responseBlocks, analysis.obligations);
  responseBlocks = applyObligationScopesToBlocks(responseBlocks, analysis.obligations, language);
  let draft = joinResponseBlocks(responseBlocks, language);
  const persistedSafety = resolvePersistedSafetyApplication({
    message: input.message,
    snapshot: state,
    followUp: analysis.safetyFollowUp,
    safetyPhase,
  });
  if (persistedSafety.mode === "CONSTRAIN" && persistedSafety.scope) {
    draft = applyPersistedSafetyConstraint({
      draft,
      message: input.message,
      language,
      scope: persistedSafety.scope,
    });
  }

  const repetition = classifyRepetition({
    snapshot: state,
    message: input.message,
    draft,
    analysis,
    safetyPhase,
  });
  const decisionState = input.decisionState ?? resolveDecisionState({
    obligations: analysis.obligations,
    handled: phase1.handled,
  });
  const allowedFactors = input.allowedFactors ?? allowedFactorsOf(analysis.obligations);
  draft = realizePersona({
    draft,
    language,
    address,
    safetyPhase,
    snapshot: state,
    message: input.message,
    decisionState,
    allowedFactors,
    repetitionAction: repetition.action,
    handledCount: phase1.handled.length,
    plan: prepared.expressionPlan,
    safetyCategory: analysis.safetyCandidates.category ?? state.safety.category,
  });

  if (prepared.forcePersonaFail) {
    draft = `${draft}\n\nI'm happy to help! Feel free to ask anything.`;
  }
  if (prepared.forcePersonaRepairFail) draft = `Bro, ${draft} 😂`;

  // PERSONA CONSISTENCY GATE (before Gate C / Final Gate): deterministic, max 2 rewrites, then the neutral renderer.
  const persona = enforcePersonaGate({
    draft,
    plan: prepared.expressionPlan,
    language,
    blocks: responseBlocks,
    repair: prepared.forcePersonaRepairFail ? sabotagedPersonaRepair : undefined,
  });
  draft = persona.text;

  let gateC = evaluateGateC({
    draft,
    handled: phase1.handled,
    language,
    address,
    snapshot: state,
    obligations: analysis.obligations,
    messageLanguage: analysis.languageSignal,
  });
  let finalGate = evaluateFinalCoherence({ draft, language, address, safetyPhase, snapshot: state, messageLanguage: analysis.languageSignal });
  let repairAttempts = persona.repairAttempts;
  let degraded = false;
  let fallbackDispositions: Record<string, CoherenceTurnResult["audit"]["dispositions"][string]> | null = null;

  const surfaceBase = repairAttempts;
  if (!gateC.passed || !finalGate.passed || prepared.forceRepairFail) {
    repairAttempts = surfaceBase + 1;
    draft = surfaceRepair({
      draft,
      code: finalGate.code ?? gateC.code,
      attempt: 1,
      language,
      address,
      safetyPhase,
      snapshot: state,
      handledCount: phase1.handled.length,
      plan: prepared.expressionPlan,
      message: input.message,
      decisionState,
      allowedFactors,
    });
    gateC = evaluateGateC({ draft, handled: phase1.handled, language, address, snapshot: state, obligations: analysis.obligations, messageLanguage: analysis.languageSignal });
    finalGate = evaluateFinalCoherence({ draft, language, address, safetyPhase, snapshot: state, messageLanguage: analysis.languageSignal });
  }
  if ((!gateC.passed || !finalGate.passed || prepared.forceRepairFail) && repairAttempts === surfaceBase + 1) {
    repairAttempts = surfaceBase + 2;
    draft = surfaceRepair({
      draft,
      code: finalGate.code ?? gateC.code,
      attempt: 2,
      language,
      address,
      safetyPhase,
      snapshot: state,
      handledCount: phase1.handled.length,
      plan: prepared.expressionPlan,
      message: input.message,
      decisionState,
      allowedFactors,
    });
    gateC = evaluateGateC({ draft, handled: phase1.handled, language, address, snapshot: state, obligations: analysis.obligations, messageLanguage: analysis.languageSignal });
    finalGate = evaluateFinalCoherence({ draft, language, address, safetyPhase, snapshot: state, messageLanguage: analysis.languageSignal });
  }
  if (!gateC.passed || !finalGate.passed || prepared.forceRepairFail) {
    degraded = true;
    const fallback = degradedFallback({
      language,
      handled: phase1.handled,
      competingCorrections: analysis.competingCorrections,
      pendingIntents: analysis.obligations.map((o) => o.intent),
      blocks: responseBlocks,
    });
    draft = applyDecisionFirst({
      draft: fallback.text,
      decisionState,
      allowedFactors,
      message: input.message,
      language,
      plan: prepared.expressionPlan,
      handledCount: phase1.handled.length,
      safetyPhase,
    });
    fallbackDispositions = fallback.dispositions;
    gateC = { passed: true, code: null, message: "degraded" };
    finalGate = { passed: true, code: null, message: "degraded" };
  }

  const responseSignature = adviceSignature(draft, "response", "calm");
  const postOps: DeltaOp[] = [
    { op: "record_advice", signature: repetition.signature },
    { op: "record_response", signature: responseSignature },
    { op: "record_user_question", signature: questionSignature(input.message) },
    { op: "mark_unclear", value: analysis.unclearPriorAsk },
  ];
  if (safetyPhase === "ENTER" || safetyPhase === "PERSIST" || safetyPhase === "ESCALATE") {
    postOps.push({ op: "record_safety_warning", signature: repetition.signature });
  }
  if (analysis.unclearPriorAsk) postOps.push({ op: "open_loop", topic: "clarification" });
  if (!analysis.unclearPriorAsk && state.openLoops.some((l) => l.topic === "clarification" && l.status === "ACTIVE")) {
    postOps.push({ op: "resolve_loop", topic: "clarification" });
  }

  const postDelta: StateDelta = {
    deltaId: deltaId(prepared.turnRef, "post", postOps),
    class: "post_turn_delta",
    turnRef: prepared.turnRef,
    sourceVersion: state.version,
    ops: postOps,
  };

  let postTurnFailed = false;
  let postTurnEvents: PostTurnEvent[] = [];
  try {
    if (prepared.failPostTurn) throw new Error("injected_post_turn_failure");
    state = applyDelta(state, postDelta);
    postTurnEvents = buildPostTurnEvents({
      turnRef: prepared.turnRef,
      now: prepared.now,
      version: state.version,
      handled: phase1.handled,
      responseSignature,
      adviceSignature: repetition.signature,
      strategies,
      safetyPhase,
    });
  } catch {
    postTurnFailed = true;
    postTurnEvents = [];
  }

  const dispositions = fallbackDispositions ?? Object.fromEntries(
    phase1.handled.map((h) => [h.intent === "OPEN_REQUEST" ? h.id : h.intent, h.disposition]),
  );

  return {
    snapshotVersion: prepared.snapshot.version,
    state,
    entryClass: prepared.entryClass,
    lifecycle: prepared.snapshot.lifecycle,
    analysis,
    strategies,
    handledObligations: phase1.handled,
    responseBlocks,
    response: draft,
    language,
    address,
    gateA: prepared.gateA,
    gateB: prepared.gateB,
    gateC,
    finalGate,
    repairAttempts,
    degraded,
    postTurnEvents,
    postTurnFailed,
    extraLlmCalls: 0,
    expressionPlan: prepared.expressionPlan,
    persona: {
      repairAttempts: persona.repairAttempts,
      fallback: persona.fallback,
      violations: persona.violations,
      warnings: persona.warnings,
    },
    audit: {
      silentDrop: phase1.handled.length > 0
        ? undisposedObligations(analysis.obligations, phase1.handled).map((o) => o.intent)
        : [],
      dispositions,
      safetyPhase,
      adviceAction: repetition.action,
    },
  };
}

/**
 * Gate C + Final Coherence Gate on the text that is actually about to be emitted.
 *
 * finishCoherenceDraft gates the Phase 2 draft, but the Phase 1 finalizer (claim/tool/privacy truth) runs after
 * it and may rewrite the text. Truth wins — this never edits facts — but the surface contract (no
 * customer-service drift, no question numbering, no humor during safety, no internal artifact) must hold for
 * the bytes the client receives, so the same gates, bounded surface repair (<=2) and degraded fallback run again
 * on the finalized text.
 */
export function enforceFinalSurface(input: {
  prepared: PreparedCoherence;
  finished: Pick<CoherenceTurnResult, "handledObligations" | "analysis"> & { responseBlocks?: ResponseBlock[] };
  text: string;
  /**
   * The Phase 1 truth pass. A fallback renders the guarded BLOCKS (same authority contract as the normal path); that text
   * has not been through the finalizer yet, so it is run through it here rather than emitted raw.
   */
  truthPass?: (text: string) => string;
}): {
  text: string;
  repairAttempts: number;
  degraded: boolean;
  gateC: GateResult;
  finalGate: GateResult;
  persona: { repairAttempts: number; fallback: boolean };
} {
  const { prepared, finished } = input;
  const { language, address, safetyPhase } = prepared;
  const snapshot = prepared.state;
  const handled = finished.handledObligations;

  const obligations = finished.analysis.obligations;
  const messageLanguage = finished.analysis.languageSignal;
  // Persona Gate on the bytes about to be emitted (max 2 rewrites, then the neutral renderer) BEFORE Gate C / Final Gate.
  const persona = enforcePersonaGate({
    draft: input.text,
    plan: prepared.expressionPlan,
    language,
    // If both persona repairs fail, the fallback renders the GUARDED blocks (authority already decided) — never the
    // failed bytes, and never handled text that bypasses the guard. No blocks → the bytes are unverified.
    blocks: finished.responseBlocks,
    // Test-only hook (same flag as finishCoherenceDraft): force the Persona Gate to fail twice on the emitted bytes too.
    repair: prepared.forcePersonaRepairFail ? sabotagedPersonaRepair : undefined,
  });
  let text = persona.fallback && input.truthPass ? input.truthPass(persona.text) : persona.text;
  let gateC = evaluateGateC({ draft: text, handled, language, address, snapshot, obligations, messageLanguage });
  let finalGate = evaluateFinalCoherence({ draft: text, language, address, safetyPhase, snapshot, messageLanguage });
  let repairAttempts = 0;

  while ((!gateC.passed || !finalGate.passed) && repairAttempts < 2) {
    repairAttempts += 1;
    text = surfaceRepair({
      draft: text,
      code: finalGate.code ?? gateC.code,
      attempt: repairAttempts === 1 ? 1 : 2,
      language,
      address,
      safetyPhase,
      snapshot,
      handledCount: handled.length,
      plan: prepared.expressionPlan,
      decisionState: resolveDecisionState({ obligations, handled }),
      allowedFactors: allowedFactorsOf(obligations),
    });
    gateC = evaluateGateC({ draft: text, handled, language, address, snapshot, obligations, messageLanguage });
    finalGate = evaluateFinalCoherence({ draft: text, language, address, safetyPhase, snapshot, messageLanguage });
  }

  if (!gateC.passed || !finalGate.passed) {
    text = degradedFallback({
      language,
      handled,
      competingCorrections: finished.analysis.competingCorrections,
      pendingIntents: finished.analysis.obligations.map((o) => o.intent),
      blocks: finished.responseBlocks,
    }).text;
    if (input.truthPass) text = input.truthPass(text);
    return {
      text,
      repairAttempts: persona.repairAttempts + repairAttempts,
      degraded: true,
      gateC: { passed: true, code: null, message: "degraded" },
      finalGate: { passed: true, code: null, message: "degraded" },
      persona: { repairAttempts: persona.repairAttempts, fallback: persona.fallback },
    };
  }
  return {
    text,
    repairAttempts: persona.repairAttempts + repairAttempts,
    degraded: false,
    gateC,
    finalGate,
    persona: { repairAttempts: persona.repairAttempts, fallback: persona.fallback },
  };
}

export function runCoherenceTurn(input: {
  message: string;
  now: string;
  prior?: VersionedState | null;
  history?: ChatHistoryTurn[];
  sessionId?: string;
  phase1Draft?: string;
  handledObligations?: HandledObligation[];
  draftSource?: "DETERMINISTIC_DECISION" | "PROVIDER_OUTPUT";
  authoritative?: AuthoritativeResponseState | null;
  providerVerification?: VerificationStatus;
  authenticated?: boolean;
  coreConflict?: CoreConflictDecision | null;
  forcePersonaFail?: boolean;
  forceRepairFail?: boolean;
  forcePersonaRepairFail?: boolean;
  failPostTurn?: boolean;
}): CoherenceTurnResult {
  const prepared = prepareCoherenceTurn(input);
  return finishCoherenceDraft({
    prepared,
    message: input.message,
    phase1Draft: input.phase1Draft,
    handledObligations: input.handledObligations,
    draftSource: input.draftSource,
    authoritative: input.authoritative,
    providerVerification: input.providerVerification,
  });
}

export function emptySession(now: string, sessionId = "test"): VersionedState {
  return createInitialState({ now, sessionId });
}

