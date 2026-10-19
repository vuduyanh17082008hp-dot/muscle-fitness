# AI-R1 Architecture — Shared Epistemic Core

Status legend: IMPLEMENTED · ADAPTER · DESIGNED · DEFERRED · RESEARCH_ONLY

> The recorded R1A findings live in [AI-R1A-FORENSIC.md](./AI-R1A-FORENSIC.md). Its line references
> came partly from read-only subagent reports and were not all independently rechecked.

## AI-R1A findings (summary)

- Most AI-R1 concepts already exist in Dante / Gemma. Rule: REUSE > ADAPT > EXTEND > CREATE.
- `lib/ai/` serves a different (business-AI) role → not used for the shared core.
- Canonical home for the shared layer: `lib/intelligence/` (no prior equivalent).

## Existing-system reuse map

| Existing system | Role in R1B | Status |
|---|---|---|
| `DanteEvidenceKind` (`dante-core/epistemics/types.ts`) | → `EvidenceOrigin` via `fromDanteEvidenceKind` | ADAPTER |
| `ProvenanceKind` (`adaptive-coach-v2/types.ts`) | → origin + stale hint via `fromDanteProvenance` | ADAPTER |
| `DanteConfidence`, confidence-engine `EvidenceStrength` | → `UncertaintyClass` via `fromExistingConfidence` | ADAPTER |
| `EvidenceCertainty` | semantics covered by `EvidenceOrigin`; no direct adapter | DESIGNED |
| Gemma `DataSource`, `isEstimated`, `DraftStatus` (`nutrition/coach/types.ts`) | → `VerificationStatus` via `fromGemmaSource` / `fromGemmaDraftStatus` | ADAPTER |
| Retrieval metadata (doc/section ids) | → origin + `sourceRefs` via `fromRetrievalMetadata` | ADAPTER |
| `DanteEpistemicCapsule`, `claim-gate`, `output-claim-validator`, `MacroResultBinding`, `hasUngroundedMacros` | untouched; remain the runtime gates | REUSED (unchanged) |
| `validation/hypothesis-followups`, nof1-engine | terminology reused (SUPPORTS / INCONCLUSIVE ↔ statuses); no code coupling | DESIGNED |
| `skills/registry`, memory-hierarchy promotion, `shadow/`, `sandbox/`, `validation/promotion-readiness` | not duplicated; future promotion gates may call `canPromoteHypothesis` | DEFERRED |

## AI-R1B shared core (`lib/intelligence/`)

| Component | Status |
|---|---|
| Types: `EvidenceItem`, `Hypothesis`, `HypothesisStatus`, `IdentifiabilityStatus`, `UncertaintyClass`, `ClaimLedgerEntry`, `ClaimType`, `VerificationStatus` | IMPLEMENTED |
| `rankEvidence` (authority ordering; stale capped below fresh inference) | IMPLEMENTED |
| `findCounterEvidence` (+ `counterEvidenceEvaluated` flag) | IMPLEMENTED |
| `classifyIdentifiability` (LLM-free; relative dominance, no evidence-count thresholds) | IMPLEMENTED |
| `deriveUncertaintyClass` (qualitative only) | IMPLEMENTED |
| `canPromoteHypothesis` | IMPLEMENTED |
| `mergeEvidenceWithoutLosingProvenance` | IMPLEMENTED |
| `deriveClaimLedger` (derived, in-memory) | IMPLEMENTED |
| Gemma status projection (VERIFIED / ESTIMATED / UNRESOLVED / PROPOSED / SIMULATED) | ADAPTER |
| `canActAsMutationTruth` — only VERIFIED qualifies | IMPLEMENTED |

Promotion rule: SUPPORTED / PARTIALLY_IDENTIFIED / IDENTIFIED require (1) an explicit
counter-evidence evaluation, (2) counter-evidence outweighed by support, (3) at least one
fresh, non-inferred support item, (4) compatible identifiability; IDENTIFIED additionally needs
`identifiability = IDENTIFIED` and no remaining missing evidence.

`DOMINANCE = 2` in `logic.ts` is a structural ratio between support and counter mass, not an
evidence-count threshold. Authority ranks are an ordering, not probabilities.

**Dominance ratio (`DOMINANCE = 2`) classification: INITIAL_HEURISTIC · UNCALIBRATED · EVALUATION_REQUIRED.**
It is used by `classifyIdentifiability` and `canPromoteHypothesis`; it has no empirical calibration
and must be evaluated before any claim that relies on its exact value.

## AI-R1B.1 — Dante ↔ Gemma coordination contract (`lib/intelligence/coordination.ts`)

Contract only: ephemeral/derived, no DB, no runtime imports, no mutation authority.
Persistence, if ever needed, must first evaluate `app_events` / existing action logs.

| Piece | Notes |
|---|---|
| `CoachSignal` (+ `CoachSignalStatus`, validity, provenance, evidenceRefs) | structured signal, never raw chat; status has no VERIFIED_FACT |
| `CoachImplication` | target-domain context (`RECOMMENDATION_CONTEXT`/`CONSTRAINT`/`CAUTION`/`REASSESSMENT_REQUEST`); no mutation type |
| `compareSignalAuthority` | SAFETY > DETERMINISTIC_TRUTH > CURRENT_VERIFIED_ATHLETE_STATE > USER_EXPLICIT > CROSS_COACH_VERIFIED_SIGNAL > SUPPORTED_HYPOTHESIS > INFERENCE > HEURISTIC |
| `isCoachSignalActive` | half-open `[validFrom, validUntil)`, fail-closed; durations are producer policy (later) |
| `evaluateCrossDomainRelevance` | IRRELEVANT / OPTIONAL / MATERIAL / CRITICAL, LLM-free |
| `CoachConflict` / `representConflict` | CONFLICT/CONSTRAINT resolved by the target specialist; `winner: null` |
| `CoachHandoff` / `createCoachHandoff` | ids + enums + timestamps only; requires an active MATERIAL+ signal |
| `canImplicationAuthorizeMutation` | always `allowed: false` |

Frozen invariants: DANTE_DOES_NOT_MUTATE_NUTRITION · GEMMA_DOES_NOT_MUTATE_TRAINING ·
RAW_CHAT_IS_NOT_THE_COORDINATION_PROTOCOL · COACH_SIGNAL != VERIFIED_FACT ·
CROSS_COACH_CONTEXT_RETAINS_PROVENANCE · CROSS_COACH_CONTEXT_HAS_TEMPORAL_VALIDITY ·
ATHLETE_STATE_REMAINS_SOURCE_OF_TRUTH · TARGET_COACH_INTERPRETS_SOURCE_SIGNAL_WITHIN_ITS_DOMAIN ·
DETERMINISTIC_TRUTH_OVERRIDES_COACH_SUGGESTION · SAFETY_OVERRIDES_CROSS_COACH_SIGNAL ·
USER_EXPLICIT_DECISION_OVERRIDES_INFERRED_COACH_SIGNAL ·
PERSISTENT_MUTATION_REQUIRES_EXISTING_CONFIRMATION_BOUNDARY.

## AI-R1B.2 COORDINATION HARDENING

Status: AI-R1B.1 = PASS · **AI-R1B.2 = current** · AI-R1 full freeze occurs only after B.2 passes. Contract + pure logic only (`coordination.ts`); no runtime wiring, DB, or mutation authority. All concepts are EPHEMERAL / DERIVED / CONTRACT_ONLY.

- **Lifecycle** — `SignalLifecycle` ACTIVE | SUPERSEDED | EXPIRED | WITHDRAWN | CONSUMED, separate from epistemic `status`. `isSignalActive` = lifecycle ACTIVE and inside validity window; only active signals participate in relevance/handoff.
- **Idempotency** — `idempotencyKey` on signals and handoffs; same key + same user scope = duplicate (`isDuplicateSignal`, `isDuplicateHandoff`, `dedupeCoachSignals`, first wins).
- **Schema versioning** — `schemaVersion` (= `COORDINATION_SCHEMA_VERSION`) on CoachSignal, CoachHandoff, HandoffAcknowledgement, CoordinationConflict, CoordinationTrace. No migration machinery.
- **Acknowledgement** — `acknowledgeHandoff` returns a new `HandoffAcknowledgement` (RECEIVED | CONSUMED | REJECTED | EXPIRED | SUPERSEDED). Recipient and user scope are checked; REJECTED requires a reason; CONSUMED keeps `resultingDecisionRefs`. It mutates nothing. A consumed handoff does **not** change the underlying signal's lifecycle (consumed for one decision ≠ signal context gone).
- **Conflict resolution** — `resolveCoordinationConflict` → `CoordinationConflict` with `SAFETY_OVERRIDES | DETERMINISTIC_STATE_OVERRIDES | USER_DECISION_REQUIRED | COMPROMISE_WITHIN_CONSTRAINTS | NO_ACTION` + `explanationCode`. Authority order: SAFETY > PLATFORM_POLICY > DETERMINISTIC_TRUTH > CURRENT_VERIFIED_ATHLETE_STATE > USER_EXPLICIT > CROSS_COACH_VERIFIED_SIGNAL > SUPPORTED_HYPOTHESIS > INFERENCE > HEURISTIC. User cannot override safety; coach signals cannot override deterministic/verified state; a soft tradeoff needing persistent change → USER_DECISION_REQUIRED. Policy only, no optimiser.
- **Implication strength** — HARD | STRONG | SOFT | CONTEXTUAL (default). `effectiveImplicationStrength`: HARD only with a trusted `hardBasis` (safety, medical block, allergy/exclusion, deterministic/platform policy) on a CROSS_COACH_VERIFIED signal; otherwise capped at STRONG. `canImplicationAuthorizeMutation()` stays `false`.
- **Safety escalation** — `riskFlag` (MEDICAL_RISK | SAFETY_BLOCK) carries the result of existing safety layers (not reinterpreted). While one is active for the user, `evaluateCoordinationGate` → `BLOCK_NORMAL_COORDINATION` and `createCoachHandoff` only hands off the risk signals.
- **Privacy boundary** — `PrivacyClass` NORMAL | SENSITIVE | MEDICAL; ratchets up only (`maxPrivacyClass`) through projection, handoff and trace. Structured fields only; raw chat/health narrative is not part of the protocol.
- **User scope** — opaque `UserScopeRef` on signals/handoffs; cross-scope signals are never handed off, acknowledged, superseded or traced together.
- **Replay trace** — `buildCoordinationTrace` → `CoordinationTrace` (signal lifecycle + relevance + reason code → handoff → acknowledgement → conflict → decision/outcome refs). Refs must be token-shaped (`[A-Za-z0-9:_.-]`), so free text is rejected; no chain-of-thought or chat.
- **Supersession** — `applySupersession` marks older same-coach/same-user signals SUPERSEDED via `supersedes`, sets `supersededBy`, keeps provenance and evidence.
- **Relevance** stays qualitative (IRRELEVANT | OPTIONAL | MATERIAL | CRITICAL); no numeric thresholds.
- **Persistence** deferred: first evaluate `app_events` / action logs / memory infrastructure; otherwise schema proposal only.

## DailyNutritionSnapshot — canonical projection contract (DESIGNED, not stored)

No type, table, or persistence in R1B. A future snapshot must be a pure projection derived from
the existing `ContextSnapshot` + `DailyMacroComparison` + canonical nutrition state, each value
carrying a `VerificationStatus` (logged-estimated stays ESTIMATED). It is recomputed, never a
second source of truth.

## AI-R1C Executive Intelligence (`lib/intelligence/executive.ts`)

Shared, provider-free control plane. EPHEMERAL / DERIVED / PER-TURN — no DB, no persistence, no runtime import
from Dante/Gemma yet. Reuses R1B (`EvidenceItem`, `Hypothesis`, `MissingEvidence`, `IdentifiabilityStatus`,
`UncertaintyClass`) and the coordination contract (signals, handoff/conflict refs, `PrivacyClass`, `UserScopeRef`).

- **Executive Workspace** — `buildExecutiveWorkspace()`: goal code, domain, evidence/hypothesis/signal/handoff/conflict
  *refs*, contradictions, unknowns, risk, budget, retrieval state, tool state, `blockedBy`, `nextDecision`. Bounded
  (`MAX_WORKSPACE_REFS`, `truncated` flag). Not athlete state, not memory, not a second profile. Foreign-scope needs/signals are ignored.
- **Risk** — LOW | MODERATE | HIGH | CRITICAL (`classifyRisk`). CRITICAL only from trusted safety input
  (`trustedSafetyCritical` or an active `riskFlag` signal); a declared CRITICAL is capped to HIGH. MODERATE + uncertainty → HIGH.
- **Reasoning Budget** — MINIMAL | LOW | MEDIUM | HIGH (`selectReasoningBudget`), provider-neutral. Escalates on risk,
  poor identifiability, contradiction, missing critical evidence, persistent mutation, known failure mode, active MATERIAL+ signal
  (max +2 steps, plus a risk floor). De-escalates to MINIMAL when deterministic truth resolves the task with no mutation/safety issue.
  Never escalates on response length or evidence count.
- **Evidence Router** — `routeEvidenceNeed()` → `EvidenceRouteDecision` over 8 `EvidenceSourceClass`es; interfaces only, no
  retrieval implemented. `SEARCH_IS_NOT_DEFAULT`: deterministic/canonical state first; current-state needs fall back to the user, never to
  generic knowledge; DETERMINISTIC-authority needs accept only a deterministic tool. Cross-scope → blocked; SENSITIVE/MEDICAL never routed
  to an external source; route privacy class only ratchets up.
- **Retrieve–Reflect–Stop** — `RetrievalState` + `recordRetrievalRound()` + `shouldRetrieveAgain()` (reason codes). Retrieves again only if
  material evidence is unresolved, rounds remain, VoI is MEDIUM/HIGH, last round gained something, and no confirmation/safety stop applies.
- **VoI heuristic** — `evaluateInformationValue()` → HIGH | MEDIUM | LOW | NONE. **UNCALIBRATED_HEURISTIC** (`VOI_STATUS`):
  additive qualitative points; NONE when the answer can't change the decision and buys no risk reduction. EVALUATION_REQUIRED before relying on thresholds.
- **Stop policy** — `shouldStopReasoning()` → CONTINUE | STOPPED(reason) | BLOCKED. Stop reasons: GOAL_SATISFIED, EVIDENCE_SUFFICIENT,
  LOW_INFORMATION_VALUE, USER_INPUT_REQUIRED, CONFIRMATION_REQUIRED, SAFE_BUDGET_EXHAUSTED, DETERMINISTIC_RESOLUTION.
  Unresolved safety, critical contradiction (both sides STRONG) and a missing material deterministic fact never yield a normal stop.
- **Blocked states** — structured `{code, refs}`: SAFETY_BLOCK, MISSING_USER_INPUT, MISSING_DETERMINISTIC_FACT, AUTHORITY_CONFLICT,
  TOOL_UNAVAILABLE, RETRIEVAL_BUDGET_EXHAUSTED, CONTRADICTORY_EVIDENCE, CROSS_USER_SCOPE, PRIVACY_RESTRICTION. Safety is read, never downgraded.
- **User clarification** — `shouldAskUserForEvidence()`: ask only for MATERIAL+ needs or ones affecting persistent state.
- **Structured Decision Record** — `buildStructuredDecisionRecord()`: ids, enums and reason codes only; every ref must be token-shaped
  (free text rejected). No chain-of-thought, no raw chat.
- **Coordination compatibility** — consumes `CoachSignal` / handoff / `CoordinationConflict` refs; expired, superseded or foreign-scope
  signals have no effect; `USER_DECISION_REQUIRED` conflicts → CONFIRMATION_REQUIRED. No runtime coordination required.

## AI-R1D Dante Runtime Integration (`lib/intelligence/dante-runtime.ts`, wired in `app/api/chatbot/route.ts`)

WRAP, DO NOT REWRITE. Pure module + two advisory call sites. No DB, no provider, no Gemma, no persistence. Output is logged
(enums/counts) and returned in-memory; it does not alter any reply, tool, or stored state.

**Integration point.** `runDanteIntelligence()` runs in two phases, both after auth → rate limit → body validation → safety pre-gate →
coherence/safety lifecycle → social/multi-intent/correction/N-of-1/casual exits, so a safety or deterministic-exit turn never reaches it:
- *phase A `pre-route`* — right after `detectIntent()`, before the tool-loop / legacy fork. Applies to BOTH paths. No Athlete State yet.
- *phase B `post-context`* — legacy path only, after `loadUserContext()` (where Athlete State is built today). Adds evidence, the
  hypothesis (causal turns) and signal production. The tool-loop path never builds Athlete State, so it gets phase A only and emits no signals.

Safety-active (`safetyCheck.triggered || persistedSafetyActive`) → workspace with `trustedSafetyCritical` only (`ESCALATE_SAFETY`); no evidence, hypothesis or signal.

**Workspace lifecycle.** Per turn, per phase, ephemeral. Refs only (ids, enums); Athlete State is not copied. Scope is an opaque
`u:<sha256-prefix>` token, never the user id. Needs: `need:current_state` (training/recovery/causal turns, MATERIAL, VERIFIED_STATE) and
`need:conceptual` (explanations, MINOR). Phase B resolves the state need via `recordRetrievalRound`.

**Reasoning budget mapping (advisory metadata; not bound to provider thinking modes; `orchestrate` limits unchanged).**
lookup → LOOKUP (MINIMAL/LOW) · explanation → EXPLANATION (LOW/MEDIUM) · causal/performance attribution → MULTI_CONSTRAINT (MEDIUM, HIGH when
identifiability is poor) · health/supplement → declared MODERATE · tool-action turn → `persistentMutationRequested` (conservative) ·
safety → blocked via trusted CRITICAL, not "HIGH reasoning".

**Evidence mapping.** Existing deterministic outputs (`computeRecoveryScore` status, `training-load` state) → `EvidenceItem`
(`DETERMINISTIC_RESULT` / `VERIFIED`; ids `ev:recovery_status`, `ev:training_load`). Route classes come from the shared Evidence Router
(`CURRENT_ATHLETE_STATE`, …). Dante's own epistemic types are untouched; shared types are a projection.

**Hypothesis.** Only on causal turns with state: `hyp:performance_limited_by_recovery_or_load`. Counter-evidence is evaluated (`findCounterEvidence`);
an always-present `missing:unmodeled_alternative_causes` keeps it from ever reaching IDENTIFIED. Promotion to SUPPORTED requires
identifiability IDENTIFIED/PARTIALLY_IDENTIFIED + `canPromoteHypothesis`; otherwise PLAUSIBLE/EARLY_SIGNAL. Claims derive as
HYPOTHESIS/UNRESOLVED — never VERIFIED_FACT. R1D does not rewrite response style; the final verifier and epistemic boundaries are unchanged.

**Signal producer (first real `CoachSignal` producer).** Owned domains only (TRAINING, RECOVERY). Emitted: `LOW_RECOVERY` (status
"Recovery Priority"), `HIGH_TRAINING_LOAD` (load state red), `UPCOMING_HEAVY_SESSION` (supported by the module; the route has no reliable
source yet and does not set it). NOT emitted (no deterministic trigger wired): `PERFORMANCE_DECLINE`, `LOW_READINESS`,
`TRAINING_PLAN_CONSTRAINT`, `RECOVERY_SUPPORT_NEEDED`. Emission requires a MATERIAL implication, evidence refs, provenance, uncertainty,
validity, same user scope, active, not safety-active (`validateProducedSignal`). Strength ≤ SOFT; never HARD; never `riskFlag`.
Implications target nutrition as `RECOMMENDATION_CONTEXT` (`AVOID_AGGRESSIVE_DEFICIT`, `SUPPORT_RECOVERY_NUTRITION`) or
`REASSESSMENT_REQUEST` (`REVIEW_PRE_TRAINING_FUEL`). `canImplicationAuthorizeMutation()` stays false; the module has no write path.
Pain/illness present → `SENSITIVE`. Handoff (`ADAPT_MEAL_STRATEGY`) and `CoordinationTrace` are built in-memory only when a signal exists.

**Signal validity (`SIGNAL_VALIDITY_POLICY`: INITIAL_POLICY, NOT_SCIENTIFICALLY_CALIBRATED).** LOW_RECOVERY: min(12 h, local-day end).
HIGH_TRAINING_LOAD / UPCOMING_HEAVY_SESSION: local-day end (user timezone, UTC fallback; DST days may be off by ≤1 h). Not persisted.

**Fallback.** `buildDanteIntelligence` never throws (`{status:"FAILED"}`), the route wrapper adds a second try/catch, and the result is
not consumed by the reply path — a failure is exactly today's behaviour.

**Observability.** `DANTE_INTELLIGENCE` event: workspace created, reasoning level, route classes, hypothesis count, identifiability,
uncertainty, signal emitted/type/relevance, blocked reason. No message, state values, ids or tokens.

**Known limitations.** (1) Signals live only for the request, so they cannot reach Gemma on a later page navigation. That needs
persistence — R1E/R1F proposal: a small per-user `coach_signals` table keyed by `idempotency_key`, RLS own-rows, expiry = `validUntil`,
written server-side by the producer only. Not built; no schema change in R1D. (2) Tool-loop turns emit no signals (no Athlete State).
(3) The reasoning budget is not enforced anywhere yet. (4) Thresholds ("Recovery Priority", red load) reuse existing deterministic
labels; they are not new calibrations. (5) R1D also made a behavior-neutral `prefer-const` fix in `executive.ts` so lint passes.

## AI-R1E.1 Coach Signal Persistence (`public.coach_signals`, `lib/intelligence/coach-signal-store.ts`)

Persistence only. Gemma does NOT read signals yet (R1E.2); provider policy, nutrition behavior and mutation authority are unchanged.
Migration `supabase/migrations/20261012100000_coach_signals.sql` — applied to the LOCAL Docker stack only; hosted needs review first.

**Store semantics.** One row per `CoachSignal`: structured columns only (enums, ref tokens, `implications` jsonb whitelisted to
`targetDomain/type/value/relevance/strength/hardBasis`). No raw chat, chain-of-thought or Athlete State. `signal_id` = contract `id`,
`superseded_by`/`supersedes` hold signal ids. Token fields must match `^[A-Za-z0-9:_.-]{1,128}$` (adapter and DB). Domains are the
canonical five (`CoachDomain` now = TRAINING, RECOVERY, NUTRITION, PERFORMANCE, GLOBAL; PERFORMANCE/GLOBAL are Dante-owned in
`ownerOfDomain`); `target_domains` is derived from the implications and must be non-empty.

**RLS / privileges.** RLS on. `authenticated`: SELECT own rows (`auth.uid() = user_id`), nothing else (no INSERT/UPDATE/DELETE/TRUNCATE
privilege). `service_role`: SELECT/INSERT/UPDATE, no DELETE. `user_id` is never read from a payload: the route passes the
authenticated session user to the adapter, and the signal's opaque `userScope` must equal `toUserScopeRef(userId)`. Writer client =
`lib/supabase/admin.ts` (server-only, `SUPABASE_SERVICE_ROLE_KEY`).

**Idempotency.** `unique(user_id, idempotency_key)` + `on conflict do nothing`: first publication wins, a duplicate returns
`DUPLICATE` and changes nothing. `unique(user_id, signal_id)` rejects an id clash under a different key (23505).

**Supersession.** `persist_coach_signal(p_user_id, p_signal)` (service_role only) inserts and, in the same transaction, marks the still-ACTIVE
signals named in `supersedes` (same user, same producer) `SUPERSEDED` with `superseded_by = new signal_id`. Old rows, evidence and
provenance are kept; a failed insert rolls the whole thing back.

**Expiry.** Read-time only: `lifecycle = 'ACTIVE' and valid_from <= now < valid_until`. Expired rows are not rewritten; no cron.

**Privacy rank.** NORMAL=0 < SENSITIVE=1 < MEDICAL=2 (`privacyRank`, `permittedPrivacyClasses`; never lexical). Clearance N reads
classes with rank ≤ N. Writes only ratchet up (`MEDICAL_RISK` floors the class at MEDICAL); a DB trigger rejects any downgrade, any
change to a signal's meaning columns, and any move out of a non-ACTIVE lifecycle — even for service_role.

**No consume-on-read.** `loadActiveCoachSignalsForDomain()` is a pure SELECT. A future handoff acknowledgement reaching `CONSUMED` does
not set the signal to `CONSUMED`; signal lifecycle only changes by deliberate SUPERSEDED / EXPIRED / WITHDRAWN transitions. No
acknowledgement table exists yet.

**Dante write path.** In `app/api/chatbot/route.ts` only the post-context `runDanteIntelligence` result is persisted
(`persistDanteSignals`, validated ACTIVE signals, no `riskFlag`). A safety-active turn yields no signals so nothing is written. Failure
(missing key, DB error, exception, 3 s timeout) is logged as `signal persistence failed` with a category/counts only and the reply is
unaffected. Tool-loop turns still emit no signals.

**Known limitations.** (1) The route awaits persistence (≤3 s) before building the prompt; move it after the reply if latency matters.
(2) ~~`GLOBAL` implications dropped by projection~~ — resolved in R1E.2 (GLOBAL-target semantics below). (3) Nothing sets
`EXPIRED`/`WITHDRAWN` yet; expired ACTIVE rows accumulate until a cleanup job exists. (4) `identifiability` is length-checked, not
enum-checked, in SQL (the adapter types it). (5) ~~Route-level persistence unverified over HTTP~~ — verified in R1E.1a below.

## AI-R1E.1a Live persistence gate — VERIFIED
Real authenticated HTTP to `/api/chatbot` on a dev server wired to the LOCAL Docker Supabase (the `.env.local` service-role key is the well-known
`supabase-demo` local key; hosted was never touched). Test: `lib/intelligence/__tests__/r1e-live-http.test.ts` (skipped unless `MF_LIVE_BASE` is set).
Dante turn "How should I handle recovery today?" → `LOW_RECOVERY` row written by the route itself → request ends → a separate user-JWT
`loadActiveCoachSignalsForDomain(…, NUTRITION, …)` returns it (ACTIVE, `valid_until` > now, idempotency key `dante:LOW_RECOVERY:<local-date>`, user scope
matches; an unauthenticated client reads nothing). The row holds no chat text and no reasoning. Repeating the turn leaves exactly one ACTIVE row. A chest-pain
turn is handled by safety and writes nothing.
Defect found and fixed by the gate: `extractDanteStateSnapshot` set `painIllness = !!today.painIllness`, and the real check-in value `"no"` is a truthy string, so
every LOW_RECOVERY was persisted as SENSITIVE. Only `"minor"`/`"yes"` count now (regression test in `dante-runtime.test.ts`).

## AI-R1E.2 Gemma read-only consumer (`lib/intelligence/gemma-consumer.ts`, wired in `lib/nutrition/coach/chat.ts`)
**Integration point.** `handleNutritionCoachChat`, immediately after the nutrition context load (which follows route auth + rate limit and both safety screens)
and before any meal/nutrition reasoning: `loadGemmaCoordination(supabase, userId, now)`. It uses the user-session client (RLS own-rows SELECT), never the service
role. Safety/scope exits above the load never see a signal.
**Filtering.** Same user, `lifecycle = ACTIVE`, inside `[valid_from, valid_until)`, schema-compatible, `target_domains ∋ NUTRITION`, privacy-permitted by explicit
rank (Gemma clearance = SENSITIVE: NORMAL + SENSITIVE, never MEDICAL), not superseded, no risk flag (coordination gate). The query filters, then the interpreter
re-checks every invariant in code. Unknown implication values are ignored (closed vocabulary). A read never touches lifecycle (no CONSUMED).
**GLOBAL-target semantics.** Source and target ownership are separate: the read matches on `target_domains`, and `interpretSignalsForGemma` projects with
`projectSignalForTarget(…, "GEMMA")` over NUTRITION-targeted implications. A GLOBAL-sourced signal targeting NUTRITION is consumed; `ownerOfDomain` is unchanged.
**ExecutiveWorkspace.** Accepted signals go through `buildExecutiveWorkspace({ activeDomain: "nutrition", viewer: "GEMMA", signals })`; only `signalRefs`, the
reasoning level and reason codes (`ESC_MATERIAL_SIGNAL`) are kept, not the payload. The level is diagnostic today (no new tool budget is wired to it).
**Interpretation (closed vocabulary).** `AVOID_AGGRESSIVE_DEFICIT` (LOW_RECOVERY), `SUPPORT_RECOVERY_NUTRITION` (HIGH_TRAINING_LOAD), `REVIEW_PRE_TRAINING_FUEL`
(UPCOMING_HEAVY_SESSION). Effects: (a) `ctx.coordination` feeds model prompts as structured `crossCoachContext` plus a rule that it is context, not fact, and never
overrides targets/allergies/exclusions (`converse`, the ambiguous-turn resolver, orchestration `sessionPreferences`); (b) the deterministic `build` route appends one
note. Prompts are byte-identical when no signal is consumed.
**Authority.** Deterministic nutrition truth > Athlete State > signal. The note is built from the canonical remaining budget: with < 300 kcal (or none) remaining it
states the real remaining number and says that going over is the user's decision. Engine macros/constraints are never altered (live-verified identical to baseline).
**No mutation.** Nothing here logs food, edits a plan/target/profile/training, or writes a signal; mutations stay behind the existing proposal/confirmation flow.
**Failure degradation.** Any error, RLS denial, missing table or > 2 s load → `EMPTY_COORDINATION` → exactly the pre-R1E.2 reply; one `GEMMA_COORDINATION` log line
(enums/counts only); no retries.
**Response field.** `coordination` (debug/telemetry): `{signalLoaded, signalTypes, signalRefs, directives, reasoningLevel, noteApplied}` or `null`.
**Tests.** `r1e-live-gemma.test.ts` (live): Dante turn → separate Gemma turn "What should I eat tonight?" (reply differs, macros identical); expired / withdrawn /
superseded / future-dated / unsupported-schema / non-NUTRITION-target / foreign-user ignored; GLOBAL source consumed; privacy ranks; 250-kcal authority case; table-offline
degradation; safety unchanged. Offline: `gemma-consumer.test.ts`.
**Known limitations.** (1) Dante publishes only on turns that reach the post-context step: turns answered by earlier deterministic exits (risk accumulator,
confidence engine, casual, safety) publish nothing. "I slept badly and recovery feels low. How should I handle today?" is answered by the risk accumulator and emits no
signal; "How should I handle recovery today?" does. (2) HIGH_TRAINING_LOAD / UPCOMING_HEAVY_SESSION consumption was exercised with fixture rows; the test user has no red
training load, and the route never sets `scheduledHeavySessionToday`, so Dante does not emit UPCOMING_HEAVY_SESSION yet. (3) The deterministic note is attached to the
engine `build` route only; other Gemma routes get prompt context. (4) Signals accumulate (no cleanup job).

## Known forensic backlog (tracked, NOT fixed in R1B)

- AI-R1-SEC-01 — client-supplied `per100g` trusted by some mutation paths.
- AI-R1-SEC-02 — nutrition mutation routes lack rate limiting.
- AI-R1-PROVIDER-01 — OpenAI model config inconsistency.
- AI-R1-DOC-01 — N1.6.3 freeze documentation mismatch.

## Deferred / research-only boundaries

- Background Cognitive Layer — DEFERRED
- Persistent CoachingEpisode store, new DB tables — DEFERRED
- Graph database, new vector retrieval — RESEARCH_ONLY
- Autonomous self-improvement, skill deployment — RESEARCH_ONLY
- Dante producer + Gemma read-only consumer DONE (R1E.1/R1E.2); Gemma producer DEFERRED
