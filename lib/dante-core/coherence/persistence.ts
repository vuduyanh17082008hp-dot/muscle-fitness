/**
 * Phase 2 — durable VersionedState across independent requests.
 *
 *   load v_n (durable) → freeze → decompose/gates read v_n → turn_delta → reducer → commit v_n+1
 *   ... response ... post_turn_delta → reducer → commit v_n+2
 *
 * Storage is a compare-and-swap on the state version, so a stale writer can never overwrite a newer state.
 * Persistence is fail-open: if the store is unavailable the turn still runs (from chat history, exactly as
 * before) and the user is never blocked. Nothing here writes state directly — every state instance comes from
 * the reducer (applyDelta / restoreVersionedState).
 *
 * This module is transport-free. The Supabase implementation lives in supabase-store.ts.
 */

import { prepareCoherenceTurn, type PreparedCoherence } from "@/lib/dante-core/coherence/pipeline";
import type { SafetyCheckResult } from "@/lib/dante-core/safety-layer";
import { restoreVersionedState } from "@/lib/dante-core/coherence/reducer";
import { classifyCoreConflict, type CoreConflictClassifier } from "@/lib/dante-core/coherence/core-conflict";
import { interpretExpressionFeedback } from "@/lib/dante-core/coherence/expression-feedback";
import { recoverSafetyFromHistory } from "@/lib/dante-core/coherence/safety-evidence";
import type {
  ChatHistoryTurn,
  CoherenceTurnResult,
  CoreConflictDecision,
  VersionedState,
} from "@/lib/dante-core/coherence/types";

export type CoherenceLoadResult =
  | { status: "found"; state: VersionedState; rowVersion: number }
  | { status: "empty" }
  /** A row exists but is not a usable VersionedState; it may be replaced using its row version. */
  | { status: "corrupt"; rowVersion: number }
  | { status: "error"; detail: string };

export type CoherenceCommitResult =
  | { ok: true }
  | { ok: false; reason: "conflict" | "error"; detail?: string };

export interface CoherenceStateStore {
  load(key: string): Promise<CoherenceLoadResult>;
  /**
   * Atomic compare-and-swap. `expectedVersion === null` means "create" (must not already exist); otherwise the
   * stored version must equal `expectedVersion`. A mismatch is a `conflict` and writes nothing.
   */
  commit(key: string, next: VersionedState, expectedVersion: number | null): Promise<CoherenceCommitResult>;
}

export function encodeState(state: VersionedState): unknown {
  return JSON.parse(JSON.stringify(state));
}

export type TurnPersistence = "committed" | "unavailable" | "conflict" | "error";
export type PostTurnPersistence = "committed" | "skipped" | "conflict" | "error";
export type StateSource = "durable" | "history" | "new" | "session";

/** Persistence bookkeeping for one request. Holds no authoritative state of its own. */
export type CoherenceSession = {
  key: string;
  store: CoherenceStateStore;
  prepared: PreparedCoherence;
  /** Version last known to be durable for this key; null when nothing has been persisted this request. */
  persistedVersion: number | null;
  source: StateSource;
  turnPersistence: TurnPersistence;
  /** "outage": durable state could not be loaded, so this turn is NOT running on healthy authoritative state. */
  storeState: "healthy" | "outage";
  /** Whether a serious safety episode was rebuilt from the request's recent conversation during an outage. */
  safetyRecovery: "none" | "recovered";
  /** Conditional core-conflict classifier: how many times it was called this request (0 or 1) and what it decided. */
  coreConflict: { calls: number; decision: CoreConflictDecision | null };
};

/**
 * A store for an unauthenticated (session-only) turn. It holds nothing and refuses every write, so a session-only
 * preference can never reach a durable row even if a caller wires it up wrongly (P-6).
 */
const SESSION_ONLY_STORE: CoherenceStateStore = {
  async load() {
    return { status: "empty" };
  },
  async commit() {
    return { ok: false, reason: "error", detail: "session_only_store" };
  },
};

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safeLoad(store: CoherenceStateStore, key: string): Promise<CoherenceLoadResult> {
  try {
    return await store.load(key);
  } catch (error) {
    return { status: "error", detail: detailOf(error) };
  }
}

async function safeCommit(
  store: CoherenceStateStore,
  key: string,
  next: VersionedState,
  expectedVersion: number | null,
  allowRewind = false,
): Promise<CoherenceCommitResult> {
  if (!allowRewind && expectedVersion !== null && next.version <= expectedVersion) {
    // The reducer only moves versions forward; anything else is a stale/rewound state and must not be written.
    // (Only replacement of an unusable row may restart the version line.)
    return { ok: false, reason: "conflict", detail: "non_monotonic_version" };
  }
  try {
    return await store.commit(key, next, expectedVersion);
  } catch (error) {
    return { ok: false, reason: "error", detail: detailOf(error) };
  }
}

function warn(message: string, detail?: string): void {
  console.warn(`[DANTE COHERENCE] ${message}${detail ? `: ${detail}` : ""}`);
}

const MAX_TURN_ATTEMPTS = 2;

/**
 * Request start. Load durable v_n, run Phase 2 preparation against it (decomposition reads v_n, the turn_delta
 * is validated and committed by the reducer), then persist v_n+1. On a version conflict (a concurrent request
 * won) reload the newer state and redo the preparation once, so the turn is derived from the latest state.
 */
export async function prepareTurnWithPersistence(input: {
  store: CoherenceStateStore;
  key: string;
  message: string;
  now: string;
  history?: ChatHistoryTurn[];
  safety?: SafetyCheckResult;
  /**
   * P-6: durable expression personalization is keyed ONLY by an authenticated user_id. `false` runs the turn
   * session-only: nothing is loaded from or written to `store`, and the caller carries `sessionState` between turns.
   * Default true — the route has already required a signed-in user.
   */
  authenticated?: boolean;
  /** Session-only continuity (unauthenticated): the state the previous turn of THIS session produced. */
  sessionState?: VersionedState | null;
  /** Conditional core-conflict classifier. Invoked at most once per request, and only for a behaviour-constraining candidate. */
  coreConflictClassifier?: CoreConflictClassifier;
}): Promise<CoherenceSession> {
  const history = input.history ?? [];
  let last: CoherenceSession | null = null;

  // Conditional core-conflict path: ONLY a clause that constrains Dante's behaviour but maps to none of the four
  // expression dimensions ever reaches the classifier. Normal turns never do (0 mandatory calls).
  const candidates = interpretExpressionFeedback(input.message).coreConflictCandidates;
  const coreConflict: CoherenceSession["coreConflict"] = { calls: 0, decision: null };
  if (candidates.length > 0) {
    if (input.coreConflictClassifier) {
      coreConflict.calls = 1;
      coreConflict.decision = await classifyCoreConflict(input.coreConflictClassifier, input.message);
    } else {
      coreConflict.decision = { status: "UNCERTAIN", reason: "no_classifier" };
    }
    if (coreConflict.decision.status === "REJECTED") {
      warn(`core conflict rejected: ${coreConflict.decision.label} (${coreConflict.decision.confidence})`);
    }
  }

  if (input.authenticated === false) {
    const prior = input.sessionState ?? null;
    const prepared = prepareCoherenceTurn({
      message: input.message,
      now: input.now,
      prior,
      history,
      sessionId: input.key,
      safety: input.safety,
      authenticated: false,
      coreConflict: coreConflict.decision,
    });
    return {
      key: input.key,
      store: SESSION_ONLY_STORE,
      prepared,
      persistedVersion: null,
      source: prior ? "session" : history.length > 0 ? "history" : "new",
      turnPersistence: "unavailable",
      storeState: "healthy",
      safetyRecovery: "none",
      coreConflict,
    };
  }

  for (let attempt = 1; attempt <= MAX_TURN_ATTEMPTS; attempt += 1) {
    const loaded = await safeLoad(input.store, input.key);
    const prior = loaded.status === "found" ? loaded.state : null;
    const source: StateSource = prior ? "durable" : history.length > 0 ? "history" : "new";
    // Store outage: the safest minimal degradation. Durable state is unavailable, so the ONLY thing rebuilt from the
    // request-supplied recent conversation is safety-critical continuity (same state machine, current/historical
    // distinctions preserved). Nothing else about the session is reconstructed.
    const outage = loaded.status === "error";
    const recovered = outage
      ? recoverSafetyFromHistory(history.filter((turn) => turn.role === "user").map((turn) => turn.text))
      : null;
    const prepared = prepareCoherenceTurn({
      message: input.message,
      now: input.now,
      prior,
      history,
      sessionId: input.key,
      safety: input.safety,
      recoverSafety: recovered,
      coreConflict: coreConflict.decision,
    });
    const base: CoherenceSession = {
      key: input.key,
      store: input.store,
      prepared,
      persistedVersion: null,
      source,
      turnPersistence: "unavailable",
      storeState: outage ? "outage" : "healthy",
      safetyRecovery: recovered ? "recovered" : "none",
      coreConflict,
    };

    if (loaded.status === "error") {
      warn("state load failed; continuing from chat history", loaded.detail);
      if (recovered) {
        warn(`safety continuity recovered from request history (store outage): phase=${recovered.phase} category=${recovered.category ?? "none"}`);
      }
      return base;
    }

    const expected =
      loaded.status === "found" || loaded.status === "corrupt" ? loaded.rowVersion : null;
    if (loaded.status === "corrupt") warn("stored state unusable; replacing");

    const outcome = await safeCommit(
      input.store,
      input.key,
      prepared.state,
      expected,
      loaded.status === "corrupt",
    );
    if (outcome.ok) {
      return { ...base, persistedVersion: prepared.state.version, turnPersistence: "committed" };
    }
    last = { ...base, turnPersistence: outcome.reason === "conflict" ? "conflict" : "error" };
    if (outcome.reason === "error") {
      warn("turn commit failed", outcome.detail);
      return last;
    }
  }

  warn("turn commit lost the version race twice; state for this turn is not persisted");
  return last as CoherenceSession;
}

/**
 * After the response is composed: persist the post_turn_delta result (assistant bookkeeping — response and
 * advice signatures, open loops). Optional by design: a skipped/failed post commit never affects the response.
 */
export async function commitPostTurn(
  session: CoherenceSession,
  finished: Pick<CoherenceTurnResult, "state" | "postTurnFailed">,
): Promise<PostTurnPersistence> {
  if (session.persistedVersion === null) return "skipped";
  if (finished.postTurnFailed || finished.state.version <= session.persistedVersion) return "skipped";
  const outcome = await safeCommit(session.store, session.key, finished.state, session.persistedVersion);
  if (outcome.ok) {
    session.persistedVersion = finished.state.version;
    return "committed";
  }
  if (outcome.reason === "error") warn("post-turn commit failed", outcome.detail);
  return outcome.reason === "conflict" ? "conflict" : "error";
}

export function persistenceTrace(session: CoherenceSession): string {
  const outage = session.storeState === "outage"
    ? `;outage=1;safety_recovery=${session.safetyRecovery}`
    : "";
  const conflict = session.coreConflict.decision
    ? `;cc=${session.coreConflict.decision.status}:${session.coreConflict.calls}`
    : "";
  return `phase2:state=${session.source};store=${session.turnPersistence};v=${session.persistedVersion ?? "none"}${outage}${conflict}`;
}

/** In-memory CAS store with the same semantics as the Supabase table — used to exercise separate-request flows. */
export function createInMemoryCoherenceStore(): CoherenceStateStore & {
  rows: Map<string, { version: number; json: string }>;
} {
  const rows = new Map<string, { version: number; json: string }>();
  return {
    rows,
    async load(key) {
      const row = rows.get(key);
      if (!row) return { status: "empty" };
      const state = restoreVersionedState(JSON.parse(row.json));
      return state ? { status: "found", state, rowVersion: row.version } : { status: "corrupt", rowVersion: row.version };
    },
    async commit(key, next, expectedVersion) {
      const row = rows.get(key);
      if (expectedVersion === null ? row !== undefined : row?.version !== expectedVersion) {
        return { ok: false, reason: "conflict" };
      }
      rows.set(key, { version: next.version, json: JSON.stringify(encodeState(next)) });
      return { ok: true };
    },
  };
}
