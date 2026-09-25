# Dante Phase 1 — Baseline Snapshot (pre/post wiring)

Entry: `app/api/chatbot/route.ts` POST

User-visible coaching branches (pre-Phase-1):
- HARD_SAFETY → createSingleShotChatStream (direct)
- SOCIAL / CORRECTION / NOF1 / CURRENT_STATE / CONFIDENCE / RISK / TOOL / CASUAL → createSingleShotChatStream (direct)
- TOOL agent success/fallback → createSingleShotChatStream (direct)
- NORMAL_PROVIDER / FALLBACK (verifier) → createChatStreamResponse delta (direct text)
- PROVIDER_FAILURE → stream `error` event (no coaching body)
- Outer catch / auth parse → Response.json (non-coaching)

Finalizer / claim validator (pre): module-level APEX only; not on all route emits.

Critical suites green before Phase-1 wiring: Adaptive Coach V2, APEX, Final Boss, safety/social/confidence/risk/nof1/epistemic route suites.

Phase-1 touch set:
- `lib/dante-core/runtime-convergence/**` (new)
- `app/api/chatbot/route.ts` (emit wiring)
- `lib/dante-core/index.ts` (exports)
- `lib/dante-core/__tests__/runtime-convergence-phase1.test.ts` (new)

Rollback: remove emit imports + restore prior createSingleShotChatStream / raw delta emits in route only; delete `runtime-convergence/` if needed. Do not git reset/restore.
