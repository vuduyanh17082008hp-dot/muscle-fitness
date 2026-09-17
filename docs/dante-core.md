# Dante Core

Adaptive Training Decision Intelligence for Muscle Fitness.

## Problem

A fitness app that only logs what happened isn't adaptive. Dante Core's job is
to look at a lifter's actual state — readiness, recovery, trend, and (via
SetVision) in-session fatigue signals — and turn that into a specific,
explainable adjustment to *today's* training, rather than a generic tip.

The explicit constraint this module is built around: **the LLM never computes
a number**. Every score, category, and recommendation in this document is
produced by plain deterministic TypeScript, unit-tested, before an LLM ever
sees it. The LLM's only job is explaining an already-final decision in
natural language (see "Response architecture" below).

## Architecture

```
USER DATA (recovery check-ins, workout history, SetVision metrics)
  -> FEATURE ENGINEERING        (lib/training/*, lib/recovery/* — pre-existing)
  -> READINESS ENGINE           (lib/dante-core/readiness-engine.ts)
  -> TREND ENGINE               (lib/dante-core/trend-engine.ts)
  -> AUTOREGULATION ENGINE      (lib/dante-core/autoregulation-engine.ts)
  -> DECISION OBJECT            (lib/dante-core/decision-object.ts)
  -> SAFETY LAYER               (lib/dante-core/safety-layer.ts, runs on the raw user message, in parallel)
  -> LLM EXPLANATION            (lib/dante-core/explain.ts, injects the finished decision — never asked to invent one)
  -> USER
```

Dante Core intentionally reuses, rather than reimplements, three engines that
already existed in the codebase before this module:

- `lib/recovery/score.ts::computeRecoveryScore` — the whole-body recovery
  score (sleep/stress/fatigue/soreness/mood, weighted, missing categories
  excluded and reweighted).
- `lib/recovery/training-load.ts::computeTrainingLoad` — green/amber/red
  training-load state from recent sessions.
- `lib/training/performance.ts::classifyPerformanceTrend` — e1RM trend
  classification (improving/stable/declining/mixed/insufficient_data),
  same-exercise-only comparisons.

Dante Core's readiness and trend engines are thin, additive layers over
these — they never recompute what those modules already own.

## Layers (spec requirement: 3 intelligence layers)

1. **Deterministic calculation and rules** — `readiness-engine.ts`,
   `autoregulation-engine.ts`, and the reused `lib/recovery`/`lib/training`
   modules. Every branch is an explicit `if`, not a model.
2. **Predictive / statistical intelligence** — `trend-engine.ts` (wraps
   `classifyPerformanceTrend`, fuses in an optional SetVision velocity-loss
   cross-check without overriding the classification).
3. **LLM + RAG explanation** — `explain.ts` + `knowledge/`. The LLM (OpenAI,
   via `lib/dante-core/llm-client.ts`) receives the already-final
   recommendation, its reasons, its data, and up to 2 retrieved knowledge
   entries, and is explicitly instructed never to change any number.

## Inputs

All Dante Core input types (`lib/dante-core/types.ts`) are built from
already-nullable fields — see `ReadinessEngineInput`, `AutoregulationInput`.
Nothing is required to be present:

- Recovery: `RecoveryScoreResult` (sleep, stress, fatigue, soreness, mood —
  each individually nullable; the score itself is `null` if every category
  is missing).
- Training load: `TrainingLoadSummary | null`.
- Per-muscle training signal: `lastTrainedDate`, `recentEffectiveSets`,
  `typicalWeeklyVolume` — each nullable.
- Performance trend: an array of `{date, estimated1RmKg}` points, or none.
- SetVision: `SetVisionSessionSignal | null` (velocity loss, calibration
  flag, ROM consistency, confidence) — entirely optional; the autoregulation
  engine works without it.
- Safety check runs on the raw user message text, independent of all the
  above.

## Outputs

### Readiness (`evaluateReadiness`)

```ts
{
  readinessScore: number | null,      // 0-100
  systemicFatigue: "low"|"moderate"|"high"|"unknown",
  muscleRecovery: Array<{
    muscle: CanonicalMuscle,
    recoveryPercent: number | null,   // 0-100+, see "ROM/recovery honesty" below
    daysSinceTrained: number | null,
    basis: "time_since_trained" | "no_recent_training_data" | "no_training_history",
  }>,
  limitingFactors: string[],          // e.g. "sleep_below_baseline", "chest_recovery_low"
  confidence: number,                 // 0-1, purely about input completeness
  method: string,                     // which branch produced readinessScore
}
```

**Muscle recovery formula, stated plainly**: `recoveryPercent = clamp(hoursSinceTrained / recoveryWindowHours * 100, 0, 100)`,
where `recoveryWindowHours` is 72h for large muscle groups
(chest/lats/upper-back/quads/hamstrings/glutes/lower-back) and 48h for
everything else, scaled by up to ±50% based on this week's volume for that
muscle vs. the lifter's own personal baseline (`lib/training/baseline.ts`).
**This is a widely-used training heuristic, not a physiological
measurement** — it is documented this bluntly in the source
(`readiness-engine.ts`) and should stay that way.

### Autoregulation (`generateRecommendation` / `evaluateSet`)

```ts
{
  exercise: string,
  plannedLoadKg: number | null, recommendedLoadKg: number | null,
  plannedSets: number, recommendedSets: number,
  loadAdjustmentPercent: number | null, volumeAdjustmentPercent: number | null,
  decision: "proceed_as_planned"|"reduce_load"|"reduce_load_and_volume"|"deload_session"|"rest_recommended"|...,
  sessionRecommendation: "normal"|"modified"|"deload"|"rest",
  reasons: string[],
  confidence: "low"|"moderate"|"high",
  gated: boolean,   // true only when a pain flag overrode everything else
}
```

**Severity scoring, stated plainly** (`autoregulation-engine.ts`): systemic
fatigue (low=0/moderate=1/high=2) + relevant-muscle recovery average
(≥60%=0/40-59%=1/<40%=2) + declining trend (+1) + SetVision velocity loss
(<15%=0/15-24%=1/≥25%=2). Total severity 0/1/2-3/4-5/6+ maps to a fixed tier
table (proceed / reduce load / reduce load+volume / reduce load+volume more /
deload). A pain flag short-circuits all of this to `rest_recommended`
unconditionally — safety always wins, matching the same pattern already
established in `lib/training/progression-engine.ts`.

## Decision traceability (spec §6, §9)

`lib/dante-core/decision-object.ts::buildAutoregulationTraceableDecision`
turns a raw decision into `{recommendation, why, dataUsed, confidence,
sources}` — rendered by `components/dante/decision-card.tsx` as
Recommendation / Why / Data Used / Confidence / Sources. No Dante Core
decision reaches the UI as a bare number.

## RAG knowledge base (spec §7)

`lib/dante-core/knowledge/registry.ts` — a small (11-entry), hand-curated,
offline list covering hypertrophy, strength, recovery, DOMS, sleep, stress,
hydration, protein, and supplements. **Every entry is a real, checkable
publication** (Schoenfeld 2017, Pelland 2025, Jäger 2017 ISSN protein stand,
Kreider 2017 ISSN creatine stand, Hirshkowitz 2015 sleep duration, Kellmann
2018 recovery consensus, etc.) — `url` is left `null` throughout rather than
guessing an exact DOI link; title/authors/source/year is enough to verify.

Retrieval (`knowledge/retrieve.ts`) is **keyword-overlap scoring, not
semantic/embedding search** — stated in the module's own docstring. This is
an intentional, honest MVP choice given the registry's small size; if it
grows past a few dozen entries, replace this with real embedding retrieval
rather than stretching keyword matching further.

**Coverage gap, stated rather than papered over**: "technique" has no
registry entry in this pass — every technique claim I could think of either
wasn't specific/verifiable enough to cite as a discrete publication, or I
wasn't confident enough in the exact citation. Thinner coverage here was
judged better than a fabricated reference.

This is separate from — and does not replace — the LIVE PubMed/Europe
PMC/MedlinePlus/USDA retrieval already in `app/api/chatbot/route.ts`
(`getEvidence`), which handles open-ended nutrition/training questions with
fresh external search. Dante Core's registry exists specifically so an
*autoregulation explanation* never depends on a live network call
succeeding.

## Safety layer (spec §8)

`lib/dante-core/safety-layer.ts::checkSafety` runs on every chatbot message
**before** context loading or any LLM call
(`app/api/chatbot/route.ts`, wired in this pass). Seven categories: chest
pain/cardiac, fainting/dizziness, neurological symptoms, severe pain,
possible injury, eating-disorder indicators, dangerous substance dosing
questions. Each has its own fixed escalation response, always distinguishing
"this is a training question" from "this needs a professional" and never
diagnosing. Deliberately tuned to NOT trigger on ordinary training language
("my legs are sore", "is creatine worth it") — see the test suite
(`lib/dante-core/__tests__/safety-layer.test.ts`) for the specific
normal-vs-red-flag boundary cases it was checked against.

## Response architecture (spec §9)

`explain.ts` separates FACTS+DECISION (already computed) from EXPLANATION
(LLM) and SOURCES (retrieved knowledge). The prompt sent to the LLM
(`buildExplanationPrompt`) literally contains sections labeled RECOMMENDATION
/ WHY / DATA / CONFIDENCE / SOURCES and instructs the model, repeatedly, not
to invent or adjust any number in them. If the LLM call fails entirely,
`explainRecommendation` falls back to a plain-text render of the same
WHY/CONFIDENCE data — the user never gets nothing.

## API surface (spec §27)

- `dante.evaluateReadiness()` → `lib/dante-core/readiness-engine.ts`
- `dante.evaluateSet()` / `dante.generateRecommendation()` → same function,
  `lib/dante-core/autoregulation-engine.ts` (aliased both ways in
  `lib/dante-core/index.ts` to match the spec's two names for the same call)
- `dante.explainRecommendation()` → `lib/dante-core/explain.ts`

Wired to real Supabase data via `app/api/dante/readiness/route.ts` (GET) and
`app/api/dante/recommendation/route.ts` (POST, optional `explain: true`),
both authenticated, both reusing
`lib/dante-core/server/load-readiness-for-user.ts` so the two routes can
never compute readiness two different ways for the same user.

## Tests

`lib/dante-core/__tests__/` — 36 tests: readiness (missing-data degradation,
per-muscle estimation, malformed-date handling), autoregulation (safety gate
priority, stacked-signal severity, bodyweight-exercise null-safety, velocity-
loss termination suggestion), trend (SetVision cross-check agreement/
conflict), safety layer (normal-vs-red-flag boundary), knowledge retrieval
(category filtering, stopword handling, no-fabrication check on the registry
itself).

## Layer 1 — premise validation (new)

`lib/dante-core/premise-validation.ts::validatePremises` — deterministic,
pattern-based. Given the raw message plus three booleans (does this user have
training history / recovery data / a nutrition profile), it returns a
structured `PremiseIssue[]` (`anchored_numeric_target`, `unclear_deadline`,
`missing_baseline`, `missing_required_variable`). It generates no
recommendation itself — deeper semantic assumption detection (an unstated
causal claim buried in prose) is explicitly out of reach for regex matching
and is left to a future Critic-role deliberation stage rather than faked here
as a false-positive generator. Not yet wired into `app/api/chatbot/route.ts`.

## Layer 6 — final response verifier (new)

`lib/dante-core/verifier/` — runs on the LLM's actual output TEXT (not its
inputs), catching what got through despite everything upstream. Four checks,
each a pure function over already-known data (`verifier/checks.ts`):

- `checkSafetyAdherence` — if safety was triggered, the reply must match the
  required escalation text verbatim (defense-in-depth against a future wiring
  bug bypassing the upstream short-circuit in `route.ts`).
- `checkDeterministicValueMutation` — for every known fact whose label is
  mentioned in the reply, the nearby number must match the fact's value
  (exact, rounded, one-decimal, or percent-of-fraction).
- `checkInventedAthleteMetric` — a fixed set of "your X is N" patterns
  (recovery, readiness, sleep, HRV, calories/protein, load) must be backed by
  a matching known fact; otherwise the LLM invented a specific athlete metric.
- `checkCitationMismatch` — "research shows"/"studies suggest" language
  requires at least one retrieved source this turn (does not verify the claim
  actually matches that source's content — presence-only, a stated
  limitation, not a hidden one).

`verifyFinalResponse()` aggregates all four into a `VerifierResult`
(`passed`, `findings`, `correctionBrief`). `runVerifiedGeneration()` is a
generic, side-effect-free bounded-retry helper (`MAX_VERIFIER_RETRIES = 2` —
3 total generation attempts, then a caller-supplied deterministic fallback,
itself re-verified rather than assumed to pass) — it never calls an LLM
itself; the caller supplies `generate`.

**Now wired into `app/api/chatbot/route.ts`, on both response paths:**

- **Legacy Q&A path** (the prompt-stuffed flow, most conversational traffic):
  previously forwarded each provider delta to the client the instant it arrived
  (true token streaming). It now buffers the full reply via
  `runVerifiedGeneration`, verifies it, and only then emits it as one
  `delta` + `done` pair — the same "single-shot" wire shape the safety-layer
  and agent-loop paths already used, so the client's NDJSON parser needed no
  changes. **Real, disclosed cost: the per-token "typing" effect is gone on
  this path.** A generation failure now also never leaves partial text in
  the client's hands (nothing is emitted until the whole thing passes),
  which is a behavior change from before (previously a mid-stream failure
  could show already-streamed text plus an "interrupted" note). Retries
  reuse the same prompt with the verifier's `correctionBrief` appended — this
  path has no side effects, so real regeneration is safe.
  `knownFacts` for this path come from `buildKnownFactsFromContext()`
  (`lib/dante-core/verifier/known-facts-from-context.ts`), reading back
  through the same recovery/food-log summaries already built for the
  prompt — deliberately narrow (recovery score, readiness, sleep hours,
  calories/protein), matching exactly the dimensions
  `checkInventedAthleteMetric` checks for; HRV and training load are not
  extracted (not available in a clean single-number form here) so a claim
  about either is correctly flagged as unbacked rather than guessed.
- **Agent-loop path** (action-shaped messages — add food, start workout,
  confirm a recommendation): verified **once, with no regeneration** — by
  the time `envelope.reply` exists, the loop may already have created a
  pending-action row or executed a read, so re-running it on a verifier
  failure risks duplicating those effects. `knownFacts` is deliberately
  `[]` here (the envelope exposes no structured numeric facts today — see
  `DanteResponseEnvelope`), so this fails closed: any specific
  athlete-metric assertion in this path's reply must stand on its own or it
  is treated as invented. On failure, the reply text is replaced by a plain
  fallback message while the envelope's own deterministic fields
  (`sources`/`actions`/`pendingConfirmation`) are preserved unchanged.

Both paths log `DANTE_VERIFIER_RETRY` / `DANTE_VERIFIER_FALLBACK`
(`lib/dante-core/tools/observability.ts`) — no raw prompt/reply text, just
the occurrence.

Not covered by an automated test in this pass: the live route's full
request→verify→emit wiring itself (no existing test harness for this
3,900-line route — mocking Supabase + the OpenAI stream + a dozen external
APIs was judged disproportionate to this change; the four verifier checks
and the retry/fallback loop are unit-tested in isolation, and so is the new
`buildKnownFactsFromContext`). This should get real conversational QA
(English, Vietnamese, an actual fabricated-number attempt) in a live
session before being considered fully proven.

## DecisionObject identity (new)

`TraceableDecision<T>` (`lib/dante-core/types.ts`) gained two **optional**
fields — `decisionId` (crypto.randomUUID()) and `createdAt` (ISO string) — so
the ~25 existing call sites that build a `TraceableDecision` literal directly
are unaffected. Only `buildAutoregulationTraceableDecision` populates them so
far; the other builders (`daily-decision-engine.ts`,
`adaptive-program-engine.ts`, etc.) don't yet — a real remaining gap, not
backfilled this pass.

## Known limitations

- **Single provider, no fallback LLM**: as of the OpenAI migration, Dante has
  exactly one LLM provider (`OPENAI_API_KEY` / `OPENAI_MODEL`, default
  `gpt-5.4-mini`, in `lib/dante-core/llm-client.ts`) — no Groq/Gemini
  fallback chain. `app/api/chatbot/route.ts`'s streaming path now delegates
  to `streamDanteLlmReply()` from that same module (the prior
  Groq-fetch-duplicated-in-the-route problem this bullet used to describe no
  longer applies). If OpenAI is misconfigured or down, the main chat route
  surfaces an error to the client; only `explain.ts` and
  `daily-intelligence.ts` have a deterministic (non-LLM) text fallback.
- **Per-muscle recovery is a heuristic**, not measured physiology (see
  formula above) — this is stated in the UI (`MuscleReadinessPanel`
  footnote) as well as here.
- **Decision Card isn't yet wired into the live workout-session flow** —
  it's wired into `/dashboard/workouts/setvision` (after a SetVision
  analysis) and used generically wherever a `TraceableDecision` exists.
  Surfacing "today's recommended load" pre-emptively on the workout session
  page itself (before SetVision analysis, purely from readiness) is a
  natural next step, deferred because that page has significant existing
  state management this pass didn't want to touch blind.
- **Knowledge registry "technique" gap** — see above.

## Future improvements

- Real embedding-based retrieval once the knowledge registry grows.
- A dedicated "readiness" `TraceableDecision` (currently only autoregulation
  decisions get the full traceability treatment).
- Feed SetVision's cross-session trend data (`SetVisionTrendPoint[]`) from
  real stored history in `setvision_analyses` into `evaluateTrend`, once
  enough analyses exist per user to make that meaningful.
