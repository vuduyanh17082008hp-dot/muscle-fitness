/**
 * Phase 2 — the ONLY writer of VersionedState. Deterministic, idempotent, version-aware, provenance-aware.
 *
 * Every authoritative state instance is produced here and nowhere else:
 *   createInitialState        — explicit init contract (new session / history bootstrap)
 *   restoreVersionedState     — explicit load contract (validated persisted row)
 *   applyDelta / commitDelta  — proposed StateDelta → validation → new immutable state
 *
 * Outputs are deeply frozen and typed deeply-readonly, so a stage that tries to write state directly fails
 * at type-check time and throws at runtime instead of silently forking authoritative memory.
 */

import { z } from "zod";
import type {
  AddressForm,
  CategoricalPreference,
  DeltaOp,
  ExpressionChange,
  ExpressionDimension,
  ExpressionState,
  MutableVersionedState,
  OpenLoop,
  PreferenceSource,
  SessionLanguage,
  SessionLifecycle,
  StateDelta,
  UserExpressionProfile,
  VersionedSlot,
  VersionedState,
  Verbosity,
} from "@/lib/dante-core/coherence/types";
import {
  clampInferredStep,
  DANTE_BASELINE,
  fromAddressForm,
  isValidExpressionValue,
  PROMOTION_THRESHOLD,
  PROMOTION_WINDOW_TURNS,
  toAddressForm,
} from "@/lib/dante-core/coherence/expression";

const OPEN_LOOP_TTL = 6;
const MAX_APPLIED_DELTA_IDS = 64;
const MAX_SIGNATURES = 12;
const MAX_COMMITMENTS = 32;
const MAX_SUPERSEDED_SLOTS = 16;
const MAX_OPEN_LOOPS = 32;
const MAX_EXPRESSION_EVENT_IDS = 64;
const MAX_SUPERSEDED_PREFERENCES = 16;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

function slot<T>(
  id: string,
  value: T,
  version: number,
  turnRef: string,
  provenance: string,
): VersionedSlot<T> {
  return { id, value, version, turnRef, provenance, status: "ACTIVE" };
}

function emptyExpressionState(): ExpressionState {
  return { profile: {}, superseded: [], observations: [], appliedEventIds: [] };
}

function newPreference<T extends string>(
  value: T,
  source: PreferenceSource,
  scope: CategoricalPreference<T>["scope"],
  atMs: number,
): CategoricalPreference<T> {
  return { value, source, scope, status: "ACTIVE", createdAt: atMs, updatedAt: atMs };
}

function provenanceOf(source: PreferenceSource): string {
  return source === "EXPLICIT" ? "CURRENT_TURN_EXPLICIT" : source === "REPEATED" ? "REPEATED_SESSION" : "CURRENT_TURN_INFERRED";
}

/**
 * The legacy address/verbosity slots are read-only PROJECTIONS of the expression profile. They are rewritten here,
 * in the same reducer step that changes the profile, so there is one authority and no second writer.
 */
function projectLegacySlots(state: MutableVersionedState, turnRef: string): MutableVersionedState {
  const addr = state.expression.profile.addressStyle;
  const verb = state.expression.profile.verbosity;
  const address: AddressForm = addr?.status === "ACTIVE" ? toAddressForm(addr.value) : "unresolved";
  const verbosity: Verbosity = verb?.status === "ACTIVE" ? (verb.value.toLowerCase() as Verbosity) : "default";
  let next = state;
  if (state.address.value !== address) {
    next = { ...next, address: slot("addr", address, state.version, turnRef, addr ? provenanceOf(addr.source) : "init") };
  }
  if (state.verbosity.value !== verbosity) {
    next = { ...next, verbosity: slot("verb", verbosity, state.version, turnRef, verb ? provenanceOf(verb.source) : "init") };
  }
  return next;
}

export function createInitialState(input: {
  sessionId?: string;
  now: string;
  language?: SessionLanguage;
  address?: AddressForm;
  lifecycle?: SessionLifecycle;
  /** Provenance for language/address seeded at init (e.g. "history" when bootstrapped from chat history). */
  provenance?: string;
}): VersionedState {
  const turnRef = "t0";
  const provenance = input.provenance ?? "init";
  const state: MutableVersionedState = {
    version: 0,
    sessionId: input.sessionId ?? "session",
    turnCount: 0,
    lastTurnRef: null,
    lastActivityAt: null,
    lifecycle: input.lifecycle ?? "NEW",
    language: slot("lang", input.language ?? "unresolved", 0, turnRef, provenance),
    address: slot("addr", "unresolved", 0, turnRef, provenance),
    verbosity: slot<Verbosity>("verb", "default", 0, turnRef, "init"),
    expression: emptyExpressionState(),
    corrections: [],
    boundaries: [],
    commitments: [],
    openLoops: [],
    topicStack: [],
    safety: {
      phase: "NONE",
      category: null,
      turnRef: null,
      lastEmittedTurn: null,
      consecutiveSafetyTurns: 0,
    },
    adviceSignatures: [],
    responseSignatures: [],
    lastAdviceSignature: null,
    lastResponseSignature: null,
    lastUserQuestionSignature: null,
    lastAnswerUnclear: false,
    safetyWarningSignature: null,
    safetyWarningCount: 0,
    appliedDeltaIds: [],
  };
  // Address seeded at init (history bootstrap) is a session-scoped INFERRED usage preference, like any other.
  const seeded = fromAddressForm(input.address ?? "unresolved");
  if (seeded) {
    state.expression.profile.addressStyle = newPreference(seeded, "INFERRED", "SESSION", 0);
  }
  return deepFreeze(projectLegacySlots(state, turnRef));
}

/* ------------------------------------------------------------------ */
/* Load contract — persisted row → authoritative state                 */
/* ------------------------------------------------------------------ */

const slotSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    id: z.string(),
    value,
    version: z.number().int().nonnegative(),
    turnRef: z.string(),
    provenance: z.string(),
    status: z.enum(["ACTIVE", "SUPERSEDED"]),
    supersededBy: z.string().optional(),
  });

const signatureList = z.array(z.string()).max(MAX_SIGNATURES * 4);

const expressionDimensionSchema = z.enum(["addressStyle", "familiarity", "humor", "verbosity"]);

const preferenceSchema = z.object({
  value: z.string(),
  source: z.enum(["EXPLICIT", "REPEATED", "INFERRED"]),
  scope: z.enum(["TURN", "SESSION", "DURABLE"]),
  status: z.enum(["ACTIVE", "SUPERSEDED"]),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const expressionSchema = z.object({
  profile: z.object({
    addressStyle: preferenceSchema.optional(),
    familiarity: preferenceSchema.optional(),
    humor: preferenceSchema.optional(),
    verbosity: preferenceSchema.optional(),
  }),
  superseded: z.array(preferenceSchema.extend({ dimension: expressionDimensionSchema })).max(64),
  observations: z
    .array(
      z.object({
        eventId: z.string(),
        dimension: expressionDimensionSchema,
        value: z.string(),
        turn: z.number().int().nonnegative(),
      }),
    )
    .max(64),
  appliedEventIds: z.array(z.string()).max(MAX_EXPRESSION_EVENT_IDS * 2),
});

const persistedStateSchema = z.object({
  version: z.number().int().nonnegative(),
  sessionId: z.string(),
  turnCount: z.number().int().nonnegative(),
  lastTurnRef: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
  lifecycle: z.enum(["NEW", "CONTINUING", "RESUME_AFTER_GAP"]),
  language: slotSchema(z.enum(["en", "vi", "unresolved"])),
  address: slotSchema(z.enum(["ong", "ban", "bro", "tao_may", "anh_em", "neutral", "unresolved"])),
  verbosity: slotSchema(z.enum(["brief", "default", "detailed"])).optional(),
  expression: expressionSchema.optional(),
  corrections: z.array(slotSchema(z.object({ topic: z.string(), statement: z.string() }))).max(256),
  boundaries: z
    .array(
      slotSchema(
        z.object({
          kind: z.enum(["no_jargon", "no_memory_dump", "no_lecturing", "custom"]),
          statement: z.string(),
        }),
      ),
    )
    .max(256),
  commitments: z
    .array(slotSchema(z.object({ kind: z.enum(["micro", "task", "clarification"]), text: z.string() })))
    .max(256),
  openLoops: z
    .array(
      z.object({
        id: z.string(),
        topic: z.string(),
        status: z.enum(["ACTIVE", "AGING", "DORMANT", "RESOLVED"]),
        createdTurn: z.number().int().nonnegative(),
        lastTouchedTurn: z.number().int().nonnegative(),
        ttlTurns: z.number().int().positive(),
      }),
    )
    .max(256),
  topicStack: z.array(z.string()).max(32),
  safety: z.object({
    phase: z.enum(["NONE", "ENTER", "PERSIST", "ESCALATE", "DOWNGRADE", "EXIT"]),
    category: z.string().nullable(),
    turnRef: z.string().nullable(),
    lastEmittedTurn: z.number().int().nonnegative().nullable(),
    consecutiveSafetyTurns: z.number().int().nonnegative(),
  }),
  adviceSignatures: signatureList,
  responseSignatures: signatureList,
  lastAdviceSignature: z.string().nullable(),
  lastResponseSignature: z.string().nullable(),
  lastUserQuestionSignature: z.string().nullable(),
  lastAnswerUnclear: z.boolean(),
  safetyWarningSignature: z.string().nullable(),
  safetyWarningCount: z.number().int().nonnegative(),
  appliedDeltaIds: z.array(z.string()).max(MAX_APPLIED_DELTA_IDS * 2),
});

/**
 * Load contract. Validates a persisted payload and returns authoritative state, or null when the payload is
 * not a usable VersionedState. Fields added after the row was written (e.g. verbosity) are defaulted here —
 * not by the caller — so restored state always has the full current shape.
 */
export function restoreVersionedState(raw: unknown): VersionedState | null {
  const parsed = persistedStateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  const state: MutableVersionedState = {
    ...data,
    verbosity: data.verbosity ?? slot<Verbosity>("verb", "default", 0, data.lastTurnRef ?? "t0", "restore_default"),
    expression: sanitizeExpression(data.expression) ?? migrateLegacyExpression(data.address.value, data.verbosity?.value),
  };
  return deepFreeze(projectLegacySlots(state, data.lastTurnRef ?? "t0"));
}

/** Drop persisted preference values that are not valid for their dimension instead of trusting the row. */
function sanitizeExpression(raw: z.infer<typeof expressionSchema> | undefined): ExpressionState | null {
  if (!raw) return null;
  const profile: UserExpressionProfile = {};
  for (const dimension of ["addressStyle", "familiarity", "humor", "verbosity"] as const) {
    const pref = raw.profile[dimension];
    if (pref && isValidExpressionValue(dimension, pref.value)) {
      (profile as Record<string, unknown>)[dimension] = pref;
    }
  }
  return {
    profile,
    superseded: raw.superseded.filter((p) => isValidExpressionValue(p.dimension, p.value)),
    observations: raw.observations.filter((o) => isValidExpressionValue(o.dimension, o.value)),
    appliedEventIds: raw.appliedEventIds,
  };
}

/** Rows written before Task 5 carried only the legacy address/verbosity slots: carry them over as session-scoped inferences. */
function migrateLegacyExpression(address: AddressForm, verbosity: Verbosity | undefined): ExpressionState {
  const expression = emptyExpressionState();
  const style = fromAddressForm(address);
  if (style) expression.profile.addressStyle = newPreference(style, "INFERRED", "SESSION", 0);
  if (verbosity === "brief" || verbosity === "detailed") {
    expression.profile.verbosity = newPreference(verbosity === "brief" ? "BRIEF" : "DETAILED", "INFERRED", "SESSION", 0);
  }
  return expression;
}

/* ------------------------------------------------------------------ */
/* Op application (private — reachable only through commitDelta)       */
/* ------------------------------------------------------------------ */

function supersede<T>(items: VersionedSlot<T>[], id: string, nextId: string): VersionedSlot<T>[] {
  return items.map((item) =>
    item.id === id && item.status === "ACTIVE"
      ? { ...item, status: "SUPERSEDED", supersededBy: nextId }
      : item,
  );
}

function ageLoop(loop: OpenLoop, turnCount: number): OpenLoop {
  if (loop.status === "RESOLVED") return loop;
  const age = turnCount - loop.lastTouchedTurn;
  if (age >= loop.ttlTurns) return { ...loop, status: "DORMANT" };
  if (age >= Math.max(2, Math.floor(loop.ttlTurns / 2))) return { ...loop, status: "AGING" };
  return loop;
}

function endExpressionSession(expression: ExpressionState): ExpressionState {
  const profile: UserExpressionProfile = {};
  for (const dimension of ["addressStyle", "familiarity", "humor", "verbosity"] as const) {
    const pref = expression.profile[dimension];
    if (pref && pref.scope === "DURABLE") (profile as Record<string, unknown>)[dimension] = pref;
  }
  return { ...expression, profile, observations: [] };
}

function rememberEvent(expression: ExpressionState, eventId: string): string[] {
  return [...expression.appliedEventIds, eventId].slice(-MAX_EXPRESSION_EVENT_IDS);
}

/** Replace the ACTIVE preference for a dimension, keeping the old one as SUPERSEDED provenance. */
function replacePreference(
  expression: ExpressionState,
  dimension: ExpressionDimension,
  next: CategoricalPreference<string>,
  atMs: number,
): ExpressionState {
  const existing = expression.profile[dimension] as CategoricalPreference<string> | undefined;
  const superseded =
    existing && existing.status === "ACTIVE" && existing.value !== next.value
      ? [...expression.superseded, { ...existing, dimension, status: "SUPERSEDED" as const, updatedAt: atMs }].slice(-MAX_SUPERSEDED_PREFERENCES)
      : expression.superseded;
  return { ...expression, superseded, profile: { ...expression.profile, [dimension]: next } };
}

/**
 * EXPLICIT preference. A new explicit value immediately supersedes a conflicting old one (P-4) - no repetition
 * threshold. TURN overrides never reach the reducer, so they can never touch the durable profile.
 */
function setExpression(
  state: MutableVersionedState,
  change: ExpressionChange,
  scope: "SESSION" | "DURABLE",
  eventId: string,
  atMs: number,
  turnRef: string,
): MutableVersionedState {
  if (state.expression.appliedEventIds.includes(eventId)) return state;
  const { dimension, value } = change;
  const existing = state.expression.profile[dimension] as CategoricalPreference<string> | undefined;
  const sameValue = existing?.status === "ACTIVE" && existing.value === value;
  // A same-value re-statement never downgrades an existing durable scope (an unauthenticated SESSION can't undo DURABLE).
  const next: CategoricalPreference<string> = {
    value,
    source: "EXPLICIT",
    scope: sameValue && existing?.scope === "DURABLE" ? "DURABLE" : scope,
    status: "ACTIVE",
    createdAt: sameValue && existing ? existing.createdAt : atMs,
    updatedAt: atMs,
  };
  let expression = replacePreference(state.expression, dimension, next, atMs);
  // An explicit statement settles the dimension: pending implicit counts for it are moot.
  expression = {
    ...expression,
    observations: expression.observations.filter((o) => o.dimension !== dimension),
    appliedEventIds: rememberEvent(expression, eventId),
  };
  return projectLegacySlots({ ...state, expression }, turnRef);
}

/**
 * IMPLICIT observation, counted per (dimension, canonical value):
 *   1 observation                          -> INFERRED / SESSION
 *   3 within 10 consecutive USER turns     -> REPEATED / SESSION, and that pair's window restarts
 * Different values never cancel or vote. The same eventId, or a second identical observation on the same user turn,
 * is one logical observation - a replay must not manufacture a promotion.
 */
function observeExpression(
  state: MutableVersionedState,
  change: ExpressionChange,
  eventId: string,
  atMs: number,
  turnRef: string,
): MutableVersionedState {
  const { expression } = state;
  if (expression.appliedEventIds.includes(eventId) || expression.observations.some((o) => o.eventId === eventId)) {
    return state;
  }
  const turn = state.turnCount;
  const same = (o: { dimension: ExpressionDimension; value: string }) => o.dimension === change.dimension && o.value === change.value;
  const window = expression.observations.filter((o) => o.turn > turn - PROMOTION_WINDOW_TURNS);
  if (window.some((o) => same(o) && o.turn === turn)) {
    return { ...state, expression: { ...expression, observations: window, appliedEventIds: rememberEvent(expression, eventId) } };
  }
  let observations = [...window, { eventId, dimension: change.dimension, value: change.value, turn }];
  const promoted = observations.filter(same).length >= PROMOTION_THRESHOLD;
  if (promoted) observations = observations.filter((o) => !same(o));

  let next: ExpressionState = { ...expression, observations, appliedEventIds: rememberEvent(expression, eventId) };
  next = adoptImplicit(next, change, promoted ? "REPEATED" : "INFERRED", atMs);
  return projectLegacySlots({ ...state, expression: next }, turnRef);
}

function adoptImplicit(
  expression: ExpressionState,
  change: ExpressionChange,
  source: "INFERRED" | "REPEATED",
  atMs: number,
): ExpressionState {
  const { dimension, value } = change;
  const existing = expression.profile[dimension] as CategoricalPreference<string> | undefined;
  const active = existing?.status === "ACTIVE" ? existing : undefined;
  if (active) {
    // P-2: an explicit preference is never overridden by an implicit one; repeated is never downgraded by a single inference.
    if (active.source === "EXPLICIT") return expression;
    if (active.source === "REPEATED" && source === "INFERRED") return expression;
    if (active.value === value) {
      return source === "REPEATED" && active.source === "INFERRED"
        ? { ...expression, profile: { ...expression.profile, [dimension]: { ...active, source, updatedAt: atMs } } }
        : expression;
    }
    // Usage never replaces an established address; only an explicit instruction or a repeated pattern does.
    if (dimension === "addressStyle" && source === "INFERRED") return expression;
  }
  const current = active?.value ?? (DANTE_BASELINE[dimension] as string);
  const target = clampInferredStep(dimension, current, value);
  if (target === current) return expression;
  return replacePreference(expression, dimension, newPreference(target, source, "SESSION", atMs), atMs);
}

function applyOp(state: MutableVersionedState, op: DeltaOp, turnRef: string): MutableVersionedState {
  switch (op.op) {
    case "set_language":
      if (state.language.value === op.value && state.language.status === "ACTIVE") return state;
      return {
        ...state,
        language: slot("lang", op.value, state.version, turnRef, op.provenance),
      };
    // Legacy explicit ops, kept for callers that predate the expression profile. They write the PROFILE, and the
    // legacy slot follows as its projection.
    case "set_address": {
      const style = fromAddressForm(op.value);
      return style
        ? setExpression(state, { dimension: "addressStyle", value: style }, "DURABLE", `legacy:${turnRef}:address:${op.value}`, 0, turnRef)
        : state;
    }
    case "set_verbosity":
      return setExpression(
        state,
        { dimension: "verbosity", value: op.value.toUpperCase() as "BRIEF" | "DEFAULT" | "DETAILED" },
        "DURABLE",
        `legacy:${turnRef}:verbosity:${op.value}`,
        0,
        turnRef,
      );
    case "expression_set":
      return setExpression(state, op.change, op.scope, op.eventId, op.atMs, turnRef);
    case "expression_observe":
      return observeExpression(state, op.change, op.eventId, op.atMs, turnRef);
    case "expression_reset_window":
      return state.expression.observations.length === 0
        ? state
        : { ...state, expression: { ...state.expression, observations: [] } };
    case "set_lifecycle":
      return state.lifecycle === op.value ? state : { ...state, lifecycle: op.value };
    case "resume_after_gap":
      return projectLegacySlots({
        ...state,
        lifecycle: "RESUME_AFTER_GAP",
        // A new session: session-scoped preferences and the implicit observation window end; durable ones stay.
        expression: endExpressionSession(state.expression),
        // Time passing is not evidence of resolution: an unresolved safety episode survives a gap unchanged (the
        // next reply re-checks with the user). Only what the user reports about the symptom moves the phase.
        openLoops: state.openLoops.map((loop) =>
          loop.status === "RESOLVED" ? loop : { ...loop, status: "DORMANT" },
        ),
      }, turnRef);
    case "upsert_correction": {
      const active = state.corrections.find((c) => c.status === "ACTIVE" && c.value.topic === op.topic);
      // Two corrections of one topic can land in the same delta (earlier assertion, then explicit correction).
      const nextId = `corr:${op.topic}:v${state.version}:${state.corrections.length}`;
      const next = slot(nextId, { topic: op.topic, statement: op.statement }, state.version, turnRef, op.provenance);
      const base = active ? supersede(state.corrections, active.id, nextId) : state.corrections;
      return { ...state, corrections: [...base, next] };
    }
    case "upsert_boundary": {
      const active = state.boundaries.find((b) => b.status === "ACTIVE" && b.value.kind === op.kind);
      const nextId = `bnd:${op.kind}:v${state.version}`;
      const next = slot(nextId, { kind: op.kind, statement: op.statement }, state.version, turnRef, op.provenance);
      const base = active ? supersede(state.boundaries, active.id, nextId) : state.boundaries;
      return { ...state, boundaries: [...base, next] };
    }
    case "add_commitment": {
      const next = slot(
        `cmt:${state.version}:${state.commitments.length}`,
        { kind: op.kind, text: op.text },
        state.version,
        turnRef,
        op.provenance,
      );
      return { ...state, commitments: [...state.commitments, next] };
    }
    case "open_loop": {
      const existing = state.openLoops.find((l) => l.topic === op.topic && l.status !== "RESOLVED");
      if (existing) {
        return {
          ...state,
          openLoops: state.openLoops.map((l) =>
            l.id === existing.id
              ? { ...l, status: "ACTIVE", lastTouchedTurn: state.turnCount, ttlTurns: op.ttlTurns ?? l.ttlTurns }
              : l,
          ),
        };
      }
      return {
        ...state,
        openLoops: [
          ...state.openLoops,
          {
            id: `loop:${op.topic}:${state.version}`,
            topic: op.topic,
            status: "ACTIVE",
            createdTurn: state.turnCount,
            lastTouchedTurn: state.turnCount,
            ttlTurns: op.ttlTurns ?? OPEN_LOOP_TTL,
          },
        ],
      };
    }
    case "touch_loop":
      return {
        ...state,
        openLoops: state.openLoops.map((l) =>
          l.topic === op.topic && l.status !== "RESOLVED"
            ? { ...l, status: "ACTIVE", lastTouchedTurn: state.turnCount }
            : l,
        ),
      };
    case "resolve_loop":
      return {
        ...state,
        openLoops: state.openLoops.map((l) =>
          l.topic === op.topic && l.status !== "RESOLVED" ? { ...l, status: "RESOLVED" } : l,
        ),
      };
    case "age_loops":
      return {
        ...state,
        openLoops: state.openLoops.map((l) => ageLoop(l, state.turnCount)),
      };
    case "push_topic": {
      const stack = [...state.topicStack.filter((t) => t !== op.topic), op.topic].slice(-8);
      return { ...state, topicStack: stack };
    }
    case "set_safety_phase": {
      const consecutive =
        op.phase === "NONE" || op.phase === "EXIT"
          ? 0
          : op.phase === "ENTER"
            ? 1
            : state.safety.consecutiveSafetyTurns + (op.phase === "PERSIST" || op.phase === "ESCALATE" ? 1 : 0);
      return {
        ...state,
        safety: {
          phase: op.phase,
          category: op.phase === "NONE" || op.phase === "EXIT" ? null : op.category ?? state.safety.category,
          turnRef,
          lastEmittedTurn:
            op.phase === "NONE" || op.phase === "EXIT" ? state.safety.lastEmittedTurn : state.turnCount,
          consecutiveSafetyTurns: consecutive,
        },
      };
    }
    case "record_advice": {
      const signatures = [...state.adviceSignatures, op.signature].slice(-MAX_SIGNATURES);
      return { ...state, adviceSignatures: signatures, lastAdviceSignature: op.signature };
    }
    case "record_response": {
      const signatures = [...state.responseSignatures, op.signature].slice(-MAX_SIGNATURES);
      return { ...state, responseSignatures: signatures, lastResponseSignature: op.signature };
    }
    case "mark_unclear":
      return { ...state, lastAnswerUnclear: op.value };
    case "record_user_question":
      return { ...state, lastUserQuestionSignature: op.signature };
    case "record_safety_warning": {
      const same = state.safetyWarningSignature === op.signature;
      return {
        ...state,
        safetyWarningSignature: op.signature,
        safetyWarningCount: same ? state.safetyWarningCount + 1 : 1,
      };
    }
    default: {
      const _never: never = op;
      void _never;
      return state;
    }
  }
}

/** Keep the persisted row bounded: all ACTIVE slots, only the most recent SUPERSEDED ones. */
function retainSlots<T>(items: VersionedSlot<T>[]): VersionedSlot<T>[] {
  const superseded = items.filter((item) => item.status !== "ACTIVE");
  if (superseded.length <= MAX_SUPERSEDED_SLOTS) return items;
  const keep = new Set(superseded.slice(-MAX_SUPERSEDED_SLOTS));
  return items.filter((item) => item.status === "ACTIVE" || keep.has(item));
}

/** Loops that are still live are always kept; spent (RESOLVED/DORMANT) ones are trimmed oldest-first. */
function retainLoops(loops: OpenLoop[]): OpenLoop[] {
  if (loops.length <= MAX_OPEN_LOOPS) return loops;
  const live = loops.filter((l) => l.status === "ACTIVE" || l.status === "AGING");
  const room = Math.max(0, MAX_OPEN_LOOPS - live.length);
  const spent = loops.filter((l) => l.status === "RESOLVED" || l.status === "DORMANT");
  const keep = new Set<OpenLoop>([...live, ...(room > 0 ? spent.slice(-room) : [])]);
  return loops.filter((l) => keep.has(l));
}

/* ------------------------------------------------------------------ */
/* Delta authority + validation                                        */
/* ------------------------------------------------------------------ */

/** Assistant bookkeeping only — a post_turn_delta may never carry user-derived state. */
const POST_TURN_OPS: ReadonlySet<DeltaOp["op"]> = new Set<DeltaOp["op"]>([
  "record_advice",
  "record_response",
  "record_user_question",
  "mark_unclear",
  "record_safety_warning",
  "open_loop",
  "touch_loop",
  "resolve_loop",
]);

/** Session init/resume only — no user-derived or assistant state. */
const SESSION_OPS: ReadonlySet<DeltaOp["op"]> = new Set<DeltaOp["op"]>(["set_lifecycle", "resume_after_gap"]);

function opAllowedForClass(delta: StateDelta, op: DeltaOp): boolean {
  switch (delta.class) {
    case "post_turn_delta":
      return POST_TURN_OPS.has(op.op);
    case "session_delta":
      return SESSION_OPS.has(op.op);
    case "turn_delta":
      return op.op !== "resume_after_gap";
  }
}

export function validateDelta(state: VersionedState, delta: StateDelta): { ok: boolean; reason: string | null } {
  if (!delta.deltaId || !delta.turnRef) return { ok: false, reason: "missing_ids" };
  if (delta.sourceVersion !== state.version && !state.appliedDeltaIds.includes(delta.deltaId)) {
    return { ok: false, reason: "version_mismatch" };
  }
  const offending = delta.ops.find((op) => !opAllowedForClass(delta, op));
  if (offending) return { ok: false, reason: `class_op_violation:${delta.class}:${offending.op}` };
  return { ok: true, reason: null };
}

export type CommitResult =
  | { status: "applied"; state: VersionedState }
  | { status: "duplicate"; state: VersionedState }
  | { status: "rejected"; state: VersionedState; reason: string };

/**
 * Validate and commit a delta. Never throws; never mutates `state`.
 *  - same deltaId already applied  → "duplicate" (no second effect, state unchanged)
 *  - stale sourceVersion / wrong op authority → "rejected"
 */
export function commitDelta(state: VersionedState, delta: StateDelta): CommitResult {
  if (state.appliedDeltaIds.includes(delta.deltaId)) {
    return { status: "duplicate", state: freezeSnapshot(state) };
  }
  const check = validateDelta(state, delta);
  if (!check.ok) {
    return { status: "rejected", state, reason: check.reason ?? "invalid" };
  }
  let next: MutableVersionedState = clone(state) as MutableVersionedState;
  if (delta.class === "turn_delta") {
    next.turnCount = state.turnCount + 1;
    next.lastTurnRef = delta.turnRef;
    if (delta.at) next.lastActivityAt = delta.at;
  } else if (delta.class === "post_turn_delta") {
    next.lastTurnRef = delta.turnRef;
  }
  for (const op of delta.ops) {
    next = applyOp(next, op, delta.turnRef);
  }
  next.commitments = next.commitments.slice(-MAX_COMMITMENTS);
  next.openLoops = retainLoops(next.openLoops);
  next.corrections = retainSlots(next.corrections);
  next.boundaries = retainSlots(next.boundaries);
  next.version = state.version + 1;
  next.appliedDeltaIds = [...state.appliedDeltaIds, delta.deltaId].slice(-MAX_APPLIED_DELTA_IDS);
  return { status: "applied", state: deepFreeze(next) };
}

/**
 * Apply a delta or throw. Same deltaId against an already-applied state is a no-op (idempotent);
 * a stale sourceVersion or an op the delta class may not carry is rejected.
 */
export function applyDelta(state: VersionedState, delta: StateDelta): VersionedState {
  const result = commitDelta(state, delta);
  if (result.status === "rejected") {
    throw new Error(`coherence_reducer:${result.reason}`);
  }
  return result.state;
}

export function freezeSnapshot(state: VersionedState): VersionedState {
  return deepFreeze(clone(state) as VersionedState);
}

export function activeCorrections(state: VersionedState): VersionedState["corrections"] {
  return state.corrections.filter((c) => c.status === "ACTIVE");
}

export function activeBoundaries(state: VersionedState): VersionedState["boundaries"] {
  return state.boundaries.filter((b) => b.status === "ACTIVE");
}

export function relevantOpenLoops(state: VersionedState): VersionedState["openLoops"] {
  return state.openLoops.filter((l) => l.status === "ACTIVE" || l.status === "AGING");
}
