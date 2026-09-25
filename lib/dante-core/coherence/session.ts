/**
 * Phase 2 — session lifecycle + entry router.
 * Resolves v_n from persisted prior state, or bootstraps it from conversation history when nothing durable
 * exists yet. Never writes state itself: initialization goes through createInitialState and resume/lifecycle
 * changes go through a session_delta committed by the reducer. No DB access here (see persistence.ts).
 */

import { createHash } from "node:crypto";
import { applyDelta, createInitialState, freezeSnapshot } from "@/lib/dante-core/coherence/reducer";
import type {
  AddressForm,
  ChatHistoryTurn,
  DeltaOp,
  EntryClass,
  SessionLanguage,
  SessionLifecycle,
  TurnAnalysis,
  VersionedState,
} from "@/lib/dante-core/coherence/types";
import { looksVietnamese } from "@/lib/dante-language";
import { detectAddressSignal } from "@/lib/dante-core/coherence/style";

const GAP_MS = 36 * 60 * 60 * 1000;

function dominantLanguage(text: string): SessionLanguage {
  if (looksVietnamese(text)) return "vi";
  if (text.trim().length >= 8) return "en";
  return "unresolved";
}

function detectAddress(text: string): AddressForm {
  return detectAddressSignal(text).form;
}

export function classifySessionLifecycle(input: {
  prior: VersionedState | null;
  history: ChatHistoryTurn[];
  now: string;
}): SessionLifecycle {
  const hasPriorTurns = Boolean(input.prior && input.prior.turnCount > 0);
  const hasHistory = input.history.length > 0;
  if (!hasPriorTurns && !hasHistory) return "NEW";
  const last = input.prior?.lastActivityAt ?? input.history.at(-1)?.at ?? null;
  if (last) {
    const gap = Date.parse(input.now) - Date.parse(last);
    if (Number.isFinite(gap) && gap >= GAP_MS) return "RESUME_AFTER_GAP";
  }
  return "CONTINUING";
}

/** Deterministic session-delta identity: same prior version + same ops → same id (idempotent). */
export function sessionDeltaId(sourceVersion: number, ops: DeltaOp[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ sourceVersion, klass: "session", ops }))
    .digest("hex")
    .slice(0, 20);
}

/** Bring a state's recorded lifecycle in line with the freshly classified one — via the reducer, never in place. */
export function reconcileLifecycle(state: VersionedState, lifecycle: SessionLifecycle): VersionedState {
  const ops: DeltaOp[] =
    lifecycle === "RESUME_AFTER_GAP"
      ? [{ op: "resume_after_gap" }]
      : state.lifecycle !== lifecycle
        ? [{ op: "set_lifecycle", value: lifecycle }]
        : [];
  if (ops.length === 0) return state;
  return applyDelta(state, {
    deltaId: sessionDeltaId(state.version, ops),
    class: "session_delta",
    turnRef: `s${state.version}`,
    sourceVersion: state.version,
    ops,
  });
}

export function loadSessionSnapshot(input: {
  prior?: VersionedState | null;
  history?: ChatHistoryTurn[];
  now: string;
  sessionId?: string;
}): VersionedState {
  const history = input.history ?? [];
  const lifecycle = classifySessionLifecycle({
    prior: input.prior ?? null,
    history,
    now: input.now,
  });
  if (input.prior) {
    // Durable state is authoritative. A prior with no turns yet is just an initialised session.
    if (lifecycle === "NEW") return freezeSnapshot(input.prior);
    return reconcileLifecycle(input.prior, lifecycle);
  }
  const userTurns = history.filter((t) => t.role === "user").map((t) => t.text);
  const lastUser = userTurns.at(-1) ?? "";
  const lang = userTurns.reduce<SessionLanguage>((acc, text) => {
    const d = dominantLanguage(text);
    return d === "unresolved" ? acc : d;
  }, "unresolved");
  const addr = detectAddress(lastUser);
  // Conversational safety never hydrates from raw history (SC-14).
  return createInitialState({
    sessionId: input.sessionId,
    now: input.now,
    lifecycle,
    language: lang,
    address: addr,
    provenance: "history",
  });
}

export function routeEntry(analysis: TurnAnalysis, snapshot?: VersionedState): EntryClass {
  if (analysis.safetyCandidates.present && analysis.safetyCandidates.current) {
    return "SAFETY_PRIORITY";
  }
  // A follow-up on an already-active persisted safety state stays on the safety path.
  const priorPhase = snapshot?.safety.phase;
  if (
    (priorPhase === "ENTER" || priorPhase === "PERSIST" || priorPhase === "ESCALATE")
    && analysis.safetyFollowUp !== null
  ) {
    return "SAFETY_PRIORITY";
  }
  const complex =
    analysis.obligations.length >= 2
    || analysis.corrections.length > 0
    || analysis.boundaries.length > 0
    || analysis.competingCorrections
    || analysis.intents.includes("TOOL_ACTION_TRUTH")
    || analysis.intents.includes("PRIVACY_BOUNDARY")
    || analysis.intents.includes("CAUSAL_ATTRIBUTION")
    || analysis.intents.includes("MIXED_CLAIM_PROVENANCE")
    || analysis.intents.includes("TEMPORAL_SAFETY")
    || analysis.explicitLanguageSwitch;
  if (complex) return "STANDARD";
  return "FAST";
}

export { dominantLanguage, detectAddress };
