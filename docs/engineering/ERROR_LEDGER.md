# Engineering Error Ledger

Recurring architecture / platform issues and the fixes that prevent repeats.

## ERR-AI-001 — OpenAI billing / key fallback caused production 429

**Symptom:** AI Coach returned provider rate-limit / billing errors in production even when OpenRouter was intended.

**Root cause:** Provider selection reused `OPENAI_API_KEY` / `OPENAI_MODEL` as an implicit fallback.

**Fix:** Default `AI_PROVIDER=openrouter`. OpenRouter uses only OpenRouter env vars. OpenAI only when explicitly selected. No silent fallback.

**Prevention:** Never infer provider from whichever key happens to exist. Keep provider selection explicit.

## ERR-AI-002 — Module-level OpenAI client crashed builds

**Symptom:** Local/Vercel build or prerender failed when AI keys were missing.

**Root cause:** Client instantiation at import time threw during compile/prerender.

**Fix:** Lazy provider client creation in `lib/ai/provider.ts`; routes return controlled 503 when unavailable.

**Prevention:** Do not instantiate vendor SDKs at module top-level when env may be absent during build.

## ERR-AI-003 — Dual usage limit sources drifted

**Symptom:** Chat limit could disagree with Phase 1 `ai_daily_limit` role entitlements.

**Root cause:** Usage RPCs preferred `ai_entitlements.daily_message_limit` only.

**Fix:** Phase 2 hardening migration makes `ai_daily_limit` authoritative via `get_entitlement_value`, with app helper soft-check before consume.

**Prevention:** Keep one authoritative entitlement key for daily AI caps and document it in Phase docs.
