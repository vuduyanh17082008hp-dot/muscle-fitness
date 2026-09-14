# Implementation Checklist — Dante Adaptive Performance Intelligence

Legend: `[x]` verified complete (code read directly), `[~]` partial (see
note), `[ ]` confirmed missing/not done this pass.

## Baseline

- [x] `npm run type-check` clean
- [x] `npm run lint` 0 errors (12 pre-existing/consistent-pattern warnings)
- [x] `npm test` 661/661 passing, 95 files
- [x] `npm run build` succeeds, proxy/middleware registered

## Project 1 — Adaptive Intelligence Runtime

- [x] Athlete Digital Twin contract (`buildAthleteState`) — canonical
      structured layer
- [x] Personal baseline contract (`lib/dante-core/personal-baseline.ts`)
- [x] Memory hierarchy (L0-L4) — evidence thresholds enforced
      (`consolidate.ts::computePatternConfidence`, sample-weighted, one event
      can't reach policy confidence), confidence decay on contradiction and
      on staleness (`applyDecay`) both real and tested
- [x] Response learning — `classifyContext`/`resolveObservedOutcome`/
      `outcomeIsPositive` use non-causal wording ("associated with
      a better outcome"), never "caused"/"proved"
- [x] Client policy (`lib/dante-core/policy/`)
- [x] Decision sandbox — `NO_CHANGE` genuinely wins ties, not a fallback
- [x] Loop runtime — React/Plan-Execute-Verify/Reflection/Fresh-Context all
      have real implementations; `loops/types.ts` formalizes, doesn't stub
- [x] Pending-action idempotency — atomic CAS updates prevent duplicate
      execution on retry/double-click/race
- [x] Typed action pipeline + write verification — **fixed this pass**:
      `session-mutations.ts` now does a real read-back after every write;
      previously reported false success on a silently-matched-zero-rows
      update
- [x] Autonomy levels + AUTO/CONFIRM/BLOCK classification
      (`lib/dante-core/autonomy/`)
- [x] Action budgets — real Supabase-backed queries (`budgets.ts`), not
      stubbed
- [~] Outcome windows per action type — not independently verified this
      pass (out of scope of the audit questions asked); existing
      `dante_action_log`/observation timing suggests this is handled at the
      call-site level (reflection is invoked once an outcome exists), not
      via a stored "evaluate-at" timestamp — worth a dedicated look if this
      becomes load-bearing
- [x] "Dante Learned" UI — real, wired end-to-end; FORGET does an actual
      `DELETE`, not a UI-only hide
- [x] Undo as a typed action — **added this pass**
      (`UndoActionPayload`/`buildInverseActionPayload`), reuses existing
      before/after state already captured in the audit log, tested
- [x] Adaptive test suite — 95 test files / 661 tests across dante-core +
      this pass's additions cover the spec's core scenarios (no-history,
      one-bad-set, repeated-pattern, contradictory-evidence, write-fails,
      retry-safe, unsafe-blocked, NO_CHANGE, stale-data-decay,
      user-forget) at the unit level

## Project 2 — Knowledge Brain Hardening

- [x] Knowledge Brain exists (`lib/dante-core/knowledge-brain/`) — real
      pgvector + full-text hybrid retrieval, not built from scratch
- [x] Security review of `supabase-admin.ts` — server-only, ingestion-
      script-only (confirmed zero app-code importers via grep), reads
      `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_`); every other
      knowledge-brain path uses the normal RLS-scoped client
- [x] Vector/RLS isolation — `match_dante_knowledge_chunks` is `SECURITY
      INVOKER`, so a private row can't cross users regardless of caller
- [x] Domain routing (`route.ts`) — personal-data questions explicitly
      routed away from RAG
- [x] Hybrid retrieval (vector 0.7 / lexical 0.3, per-document dedupe,
      relevance threshold, capped result count) — real, not vector-only
- [x] Ingestion idempotency — content-hash based, confirmed in
      `docs/dante-core.md`'s Knowledge Brain section and `ingest.test.ts`
- [x] RAG vs Adaptive Memory boundary — separate tables/systems by
      construction (`dante_knowledge_chunks` vs `dante_memory`/
      `dante_observations`/`dante_learned_patterns`)
- [x] RAG failure degradation — `embedText`/`retrieveDanteKnowledge` never
      throw, resolve to `null`/`[]`, chatbot continues without RAG
- [x] Citation integrity — `sourceUrl`/`source` always come from the
      retrieved row, never fabricated
- [ ] Source/evidence quality tiers (A-F) — confirmed missing, not built
      this pass (see implementation-progress.md's "Remaining tasks" for why)
- [~] Deterministic reranking — the hybrid score itself (0.7/0.3 weighted,
      per-document dedupe) functions as the rerank stage; no separate
      reranking pass exists beyond that, which reads as adequate for the
      current corpus size rather than a gap
- [~] Knowledge evals fixture suite — `knowledge-retrieve.test.ts` and
      `dante-checks.ts` cover routing/no-fabrication at the unit level; a
      dedicated end-to-end eval fixture set (conflicting evidence,
      no-evidence query, personal-vs-RAG routing as one named suite) was not
      independently confirmed as a single cohesive suite this pass

## Project 3 — Unified Dante Performance OS

- [x] Context builder (`buildAthleteState` + orchestrator input assembly)
- [x] Skill/tool registry (`lib/dante-core/skills/`, `tools/registry.ts`)
- [x] Pending confirmation endpoint — auth from session (never request
      body), wrong-owner and missing-id indistinguishable, expired/
      cancelled/already-executed all rejected (verified via direct code
      read of `confirm/route.ts` + `pending-actions.ts`)
- [x] Failure degradation patterns present across multiple modules
      (`explain.ts` LLM fallback, `load-setvision-context.ts`,
      `retrieveDanteKnowledge`)
- [x] Proactive/heartbeat cycle trigger surface (MORNING/PRE_WORKOUT/
      POST_WORKOUT/OUTCOME_DUE/EVENING) — **built this pass**:
      `app/api/dante/cron/route.ts` (secret-gated, fails closed),
      `lib/dante-core/proactive/run-scheduled-cycles.ts` (batches
      `runDanteCycleForUser` over onboarded client users, bounded
      concurrency, per-user autonomy/budgets unchanged). Not wired into a
      live scheduler this pass — needs `DANTE_CRON_SECRET` set + an
      external cron configured (deployment step, not a code gap)
- [ ] Undo UI surface (history panel + button) — backend exists and is
      tested; no dashboard panel to trigger it from yet, deliberately not
      built blind without live-browser verification
- [x] Muscle Intelligence -> Dante structured context — confirmed real:
      `selectedMuscle`/`selectedExercise` flow as structured fields (not
      SVG) from `components/dante-chat.tsx` through
      `app/api/chatbot/route.ts` into `buildDanteContext`
      (`lib/athlete-state/build-dante-context.ts`)
- [ ] SetVision -> Adaptive Memory — confirmed **fully disconnected**, not
      just "correctly never promoted to policy": `setvision_analyses`
      inserts + a `SET_ANALYZED` app_event, but `recordObservationAndLearn`
      is never called from the SetVision results route. Real gap, left
      open — see implementation-progress.md's "genuinely open gaps" for
      why (schema mismatch between a raw measurement and the
      intervention/outcome shape `dante_observations` expects)
- [ ] Reflection loop activation — `recordObservationAndLearn` is real,
      tested, and safe, but confirmed to have **zero production callers**
      anywhere in the app. Left open — see implementation-progress.md
- [~] Two write pathways (chat tool writes via `pending-actions.ts` /
      `dante_tool_actions` vs. `apply-action.ts` / `dante_action_log`) —
      both real, independently authed/audited, not literally converged
      into one pipeline. Accepted as-is (documented rationale in
      implementation-progress.md), matching this repo's existing precedent
      for other live-flow duplication
- [~] Observability/structured tracing — `tools/observability.ts` /
      `logToolEvent` exist and are exercised by tests; not cross-checked
      against the full field list in the spec (cycleId/stateVersion/etc.)
- [ ] End-to-end scenario tests (A-N from spec, as one named suite) — the
      underlying behaviors are covered piecemeal across the 95 test files;
      not consolidated into one scenario-lettered suite

## Database / Migrations

- [x] Existing migrations reviewed at the content level for the tables this
      pass touched (`dante_action_log` via `apply-action.ts`,
      `workout_session_exercises`/`exercise_sets` RLS via
      `session-mutations.ts`)
- [x] No new migrations needed — undo reuses existing `payload` JSON
      already stored on `dante_action_log`

## Quality gate history

| Step | type-check | lint | test | build |
|---|---|---|---|---|
| Baseline (start) | pass | pass (0 err) | 653 pass | pass |
| After write-verification fix | pass | pass (0 err) | 659 pass | pass |
| After undo typed action | pass | pass (0 err) | 661 pass | pass |
| After proactive cycle trigger surface (final) | pass | pass (0 err, 12 warn) | 670 pass / 97 files | pass |
