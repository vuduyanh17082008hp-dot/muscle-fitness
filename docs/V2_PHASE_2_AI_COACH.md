# Muscle Fitness V2 — Phase 2 AI Coach

## Goal

Production authenticated AI Fitness Coach that reads the signed-in client’s Muscle Fitness data, enforces daily entitlements, logs tool usage, and requires explicit confirmation for write actions.

## Branch

`feature/v2-phase-2-ai-coach`

## Architecture

```
Browser (AiCoachClient)
  -> /api/ai-coach/chat (SSE stream)
  -> lib/ai/transport (planning + final answer)
  -> lib/ai/server + lib/ai/tools (tool execution)
  -> Supabase (RLS-scoped user data)
```

Provider layer (`lib/ai/provider.ts`, `lib/ai/transport.ts`):

- Default provider: OpenRouter (`AI_PROVIDER=openrouter`)
- Native OpenAI Responses API when `AI_PROVIDER=openai`
- Keys are server-only; missing keys return controlled 503, not build failure

## Routes

| Route | Purpose |
|---|---|
| `/ai-coach` | Main chat UI (sidebar, streaming, proposals) |
| `/ai-coach/history` | Search / rename / delete conversations |
| `/ai-coach/settings` | Tone, detail, reminders, weekly summary |
| `/chatbot` | Redirects to `/ai-coach` |
| `/api/chatbot` | 410 Gone → `/api/ai-coach/chat` |
| `/api/ai-coach/chat` | Authenticated streaming chat |
| `/api/ai-coach/thread/[threadId]` | Rename / delete |
| `/api/ai-coach/thread/[threadId]/messages` | Load thread messages |
| `/api/ai-coach/tools/confirm` | Confirm / cancel write proposals |
| `/api/ai-coach/feedback` | Thumbs up / down |
| `/api/ai-coach/settings` | Persist coach preferences |
| `/api/ai-coach/health` | Provider health |

## Database tables used

Phase 1 / AI schema:

- `ai_threads`
- `ai_messages`
- `ai_usage_daily`
- `ai_tool_logs`
- `ai_feedback`
- `ai_user_settings`
- `ai_entitlements`
- `ai_thread_summaries`
- `ai_workout_reminders`
- `ai_support_tickets`
- `entitlements` / `role_entitlements` / `user_entitlements`
- Existing product tables: `profiles`, `fitness_profiles`, `workout_sessions`, `workout_plans`, `daily_metrics`, `meal_logs`, `weight_entries`

## Migration

Additive:

`supabase/migrations/20260810130000_v2_phase2_ai_coach_hardening.sql`

- Expands `ai_tool_logs.status` for confirmation lifecycle
- Grants authenticated update on own tool logs
- Adds `get_entitlement_value(text)`
- Makes `consume_ai_usage` / `get_ai_usage_snapshot` prefer Phase 1 `ai_daily_limit`

## AI tools

Read:

- `get_client_profile`
- `get_today_workout`
- `get_recent_workouts`
- `get_workout_history`
- `get_nutrition_summary`
- `get_today_nutrition`
- `get_recent_progress`
- `get_weight_trend`
- `get_recent_checkins`
- `get_training_adherence`
- `get_weekly_summary`

Write proposals (UI confirmation required):

- `propose_reminder`
- `propose_support_ticket`
- `propose_workout_adjustment`
- `propose_nutrition_adjustment`

Legacy phrase-confirm tools remain for compatibility:

- `create_workout_reminder`
- `create_support_ticket`

## Entitlements / daily limits

1. Authenticate with `supabase.auth.getUser()`
2. Resolve `ai_daily_limit` via `getAiDailyLimit()` / `get_entitlement_value`
3. Soft-check usage snapshot before model work
4. Atomically consume via `consume_ai_usage`
5. Return **429** when exhausted
6. Refund on failed generation where existing refund RPC applies

Do not hard-code Free=5 in the chat route. Catalog default remains the Phase 1 seed value.

## Security model

- Never trust browser `user_id`
- Thread / message / tool-log ownership always filtered by `auth.uid()`
- Tools never accept arbitrary user IDs
- Write proposals revalidated on confirm from `ai_tool_logs`
- Confirmation rechecks ownership before mutation
- Audit log written on confirm / cancel
- Prompt-injection defense: DB text treated as untrusted content
- Medical / PED safety rules live in system prompt

## Write confirmation flow

1. Model calls `propose_*`
2. Server stores `ai_tool_logs` with `awaiting_confirmation`
3. SSE emits `proposals`
4. UI shows Confirm / Cancel
5. `POST /api/ai-coach/tools/confirm` re-auths, reloads tool log, revalidates, executes, marks `succeeded` / `failed` / `cancelled`

## Required environment variables

Server only:

- `OPENROUTER_API_KEY` (default path)
- `OPENROUTER_MODEL`
- Optional: `AI_PROVIDER=openai` + `OPENAI_API_KEY` + `OPENAI_MODEL`
- Optional self-hosted: `AI_PROVIDER=self_hosted`, `AI_BASE_URL`, `AI_MODEL`

Never use `NEXT_PUBLIC_OPENAI_API_KEY`.

## Testing checklist

- Anonymous chat → 401
- User A cannot read User B thread → 404
- Daily limit reached → 429 and no extra model call after consume rejection
- Propose then cancel → no mutation
- Propose then confirm → mutation + audit
- Missing provider key → controlled unavailable error, app still builds

## Known limitations

- Workout / nutrition proposal execution is conservative: owned session notes / advisory acceptance rather than full plan rewrite engines
- Check-ins currently map to `daily_metrics`
- `npm run verify` is not defined in this repo; use `type-check`, `lint`, `build`

## Rollback

1. Keep Preview unmerged
2. Revert feature branch
3. Do not DROP AI tables in production panic
4. Disable provider keys / cron if needed
