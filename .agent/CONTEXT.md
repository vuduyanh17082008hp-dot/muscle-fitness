# DANTE — CONTEXT

## Core rule
Phase 1 = correctness.
Phase 2 = coherence, identity, continuity, lifecycle.

Same runtime pipeline. No second Phase 2 runtime.

## Target flow
INPUT
→ load VersionedState v_n
→ Semantic Decomposition
→ Gate A
→ StateDelta
→ Reducer
→ persist v_n+1
→ Strategy
→ Safety Lifecycle
→ Gate B
→ Persona + Language
→ Continuity + Repetition
→ Composition
→ Gate C
→ Final Coherence Gate
→ repair ≤2 / fallback
→ emit
→ post_turn_delta
→ Reducer

## Invariants
- Reducer is the only state writer
- No silent obligation drop
- Current state > historical state
- Accepted correction persists
- Laterality/provenance/tool/privacy truth must not drift
- Persona is never an authority layer
- Surface repair cannot change authoritative truth

## Task 2 focus
The remaining problem is LIVE PROVIDER INTEGRATION.

Trace where Phase 1 truth → Phase 2 draft → verifier/fallback → final HTTP response first diverges.

Do not redo Task 1 persistence. Do not implement Phase 3.

## Code map (verified 2026-09-19)
- Phase 1: `lib/dante-core/runtime-convergence/**` — authoritative state, `finalizeProviderReply`, hard-safety
  surface, `emit.ts` (`emitConvergedCore`). Baseline: `runtime-convergence/BASELINE.md`.
- Phase 2: `lib/dante-core/coherence/**` — analysis, gates, strategy, realize, reducer, session, pipeline,
  persistence, supabase-store. API: `coherence/index.ts`. Also untracked: `lib/dante-core/adaptive-coach-v2/**`.
- Route `app/api/chatbot/route.ts`:
  - `prepareTurnWithPersistence` once per request, before any branch (~L3869).
  - `emitConvergedSingleShot` (~L3877) = `emitConvergedCore` + coherence overlay + post-turn commit.
    Every deterministic branch uses it. The multi-intent branch (~L4048) is labelled `NORMAL_PROVIDER` but is
    deterministic.
  - Legacy provider stream (~L4701-4822): `generateReply` → `runVerifiedGeneration` (verifier/fallback) →
    `clarifyUnconfirmedWorkoutChange` → `finalizeProviderReply` → raw `emit` delta + done. No overlay, no
    post-turn commit.
- `emit.ts` runs `finishCoherenceDraft` for every branch except `HARD_SAFETY`.

## Rules that hold
- Persistence is CAS on `state_version`, fail-open. Chat history is supporting evidence only. State row stores no
  raw chat text.
- Migrations are NOT auto-applied.
- Repo rules (CLAUDE.md): assistant is "Dante"; Dante gets structured context only; safety layer runs before any
  LLM call. Read `node_modules/next/dist/docs/` before Next.js-specific changes (AGENTS.md).

## Tests
- Phase 2: `__tests__/coherence-persistence`, `coherence-route-persistence`, `coherence-phase2`
  (+ `__tests__/support/fake-coherence-supabase.ts`).
- Phase 1: `phase1-final-closure`, `runtime-convergence-*`, `multi-intent-phase1`.
- Route safety paths: `app/api/chatbot/__tests__/route.test.ts`.
- Subset: `npx vitest run <paths>`. Full gate: `npm run type-check && npm run lint && npm test && npm run build`.
