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
3. **LLM + RAG explanation** — `explain.ts` + `knowledge/`. The LLM (Groq,
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

## Known limitations

- **LLM client duplication**: `lib/dante-core/llm-client.ts` re-implements a
  small Groq fetch-with-fallback client rather than extracting one from
  `app/api/chatbot/route.ts` (a ~3,300-line, live, production file). This was
  a deliberate risk tradeoff — extracting a shared helper from that file
  without the ability to exercise the change in a real browser session was
  judged too risky. Revisit once there's a way to test the chatbot route
  live end-to-end.
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
