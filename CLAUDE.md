@AGENTS.md

# Muscle Fitness — Working Notes

Muscle Fitness is evolving from a fitness tracker into an **AI Performance
Intelligence Platform**. Long-term this app is one layer of a larger system:

```
Muscle Fitness (product layer)
Dante Core        (adaptive decision intelligence — lib/dante-core/, see docs/dante-core.md)
SetVision         (training computer vision — lib/setvision/, see docs/setvision.md)
HawkerLens SG     (Singapore food intelligence — future)
```

Product thesis (architectural principle, not marketing copy to repeat
everywhere): most fitness apps record what you did — Muscle Fitness helps
determine what you should do next.

## Route structure

Client (end user), business (coach/gym operator), and platform-admin are
**three separate role systems** — do not conflate them:

- `/dashboard/*`, `/account*`, `/onboarding`, `/coach`, `/chatbot` — end
  user, gated by `lib/auth/permissions.ts` / per-page `supabase.auth.getUser()`
  checks, role resolved via `lib/auth/permissions.ts::resolveActorRole` (`user_roles`
  table first, `profiles.role` fallback, defaults to `"client"`).
- `/business/*` — coach/gym-owner portal, gated by
  `requireBusinessAdmin()` (`lib/business/require-business-admin.ts`), backed
  by the `businesses` / `business_staff` tables. `/admin/login` is actually
  this portal's login screen (naming collision with platform admin below —
  known tech debt, not yet resolved).
- `/admin` — platform-level admin, gated by `requireAdmin()`
  (`lib/auth/permissions.ts`), a distinct role system from business.

Edge-level session refresh and route protection lives in
`lib/supabase/proxy.ts` (`updateSession`), wired up from the **root**
`proxy.ts`. Next.js 16 only loads `proxy.ts` from the project root (or
`src/`) — never from `app/`. If you need to change middleware behavior, edit
`lib/supabase/proxy.ts`; do not create an `app/proxy.ts`, Next.js will
silently ignore it.

## Supabase access

- Browser client: `lib/supabase/client.ts`.
- Server client: `lib/supabase/server.ts`.
- Both read env through `lib/supabase/env.ts::getSupabaseEnvironment()` /
  `lib/supabase/config.ts` (publishable key preferred, falls back to legacy
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Don't add a third env-reading helper —
  extend `env.ts` instead.
- One service-role client exists: `lib/supabase/admin.ts` (`server-only`,
  `SUPABASE_SERVICE_ROLE_KEY`), used by server routes for recovery proposals,
  Dante tool-action finalisation and `coach_signals` writes. It must never be
  imported into client-bundled code, and every query through it must be scoped
  to the authenticated user's id.
- Domain services live under `lib/{training,nutrition,recovery,auth,workouts,
  athlete-state,repositories}/`. Several pages still query Supabase directly
  instead of going through these — known duplication (see
  `docs/architecture.md`), not yet fully consolidated. Prefer the existing
  service module for a domain over adding a new direct `.from()` call.

## Dante naming

The product assistant is always called **Dante** in user-facing copy —
never "AI Coach", "Smart Coach", "Assistant", or a generic chatbot label.
The chat component is `components/dante-chat.tsx` (`DanteChat`). The route
`/dashboard/ai-coach` still uses the historical `ai-coach` URL segment —
renaming it is a deliberate follow-up (needs a redirect for existing links),
not done yet.

Dante must only receive **structured, deterministic context**, never raw
database dumps. `lib/athlete-state/build-athlete-state.ts::buildAthleteState()`
is that structured-context layer today — it aggregates training, nutrition,
and recovery state into one normalized object consumed by
`app/api/chatbot/route.ts` and the dashboard. Extend this object rather than
having new code read tables directly for Dante-facing output.

## Nutrition

Real, Supabase-backed CRUD — not mocked. Barcode (Open Food Facts), search
(USDA → Open Food Facts → local fallback), and photo estimation
(`lib/nutrition/photo-estimate.ts`) all normalize into one `ConfirmedFood`
shape (`components/nutrition/types.ts`) before hitting
`app/api/nutrition/log/route.ts`. The server always recomputes macros from
`per100g × quantity` — never trusts client-submitted totals. Provenance is
server-owned too: `createFoodLog` re-resolves any `usda` / `open-food-facts`
/ `local` claim by id (`lib/nutrition/food-log/provenance.ts`) and stores the
server's profile, or downgrades the entry to `user_provided` + estimated —
a request can never mark its own values verified. Keep it that way when
adding new input sources (e.g. HawkerLens later).

The only mock/hardcoded nutrition data in the app is the public,
unauthenticated `/meal-plan` calculator (`app/meal-plan/page.tsx`) — it
self-discloses that it isn't connected to a saved profile. That's
intentional; don't confuse it with `/dashboard/nutrition`.

## Recovery

`/dashboard/recovery` is a real page, not a dashboard shortcut. The
readiness score is computed deterministically in
`lib/recovery/score.ts::computeRecoveryScore` — Dante explains the score, it
never invents or adjusts it. Keep that separation when extending recovery
logic.

## Testing

Run before considering any change done:

```
npm run type-check
npm run lint
npm test
npm run build
```

(`npm run check` runs the first three together.) The lint/build commands
must show 0 errors; a handful of pre-existing low-risk warnings (unused
`<img>` vs `next/image`, one `useMemo` dependency nit) are tracked, not
blocking.

## Dante Core

`lib/dante-core/` — deterministic readiness/autoregulation engines, a
curated (not live-search) knowledge base, a safety layer (wired into
`app/api/chatbot/route.ts`, runs before any LLM call), and an explanation
layer that never lets the LLM compute a number. Public API:
`lib/dante-core/index.ts` (`evaluateReadiness`, `evaluateSet`/
`generateRecommendation`, `explainRecommendation`). Wired to real data via
`app/api/dante/{readiness,recommendation}/route.ts`. Full detail, formulas,
and known limitations: `docs/dante-core.md`.

## Performance Intelligence Core (ICH-1)

`lib/intelligence/performance-core/` — the shared substrate Dante and Gemma
both consume: canonical knowledge + evidence strength, need/recommendation
policy, safety posture, conversation control, output integrity. Pure and
synchronous. Public API: `index.ts` (`buildIntelligenceBrief`,
`resolveConversationControl`, `checkOutputIntegrity`, `enforceIntegrity`).

- Knowledge lives in `knowledge/*.ts` as `KnowledgeRecord`s, never in
  prompts. Every source in `sources.ts` was looked up on PubMed and its
  abstract read; a claim may state only what its abstract states. No
  verified source → the topic goes in `KNOWLEDGE_GAPS`, not a record.
  Evidence strength belongs to one claim × outcome × population × context.
- One copy of supplement evidence; each coach reads it through its own lens.
  Option tiers are derived per turn in `policy.ts`, never stored.
- `detectTurnLanguageRequest` is the only explicit-language detector
  (`lib/dante-language.ts` and the coherence layer call it). Don't add
  another phrase list.
- It stops nothing itself: hard stops stay with
  `lib/dante-core/safety-layer.ts` and the nutrition coach's `screenSafety`.
- `ICH1_LIVE=1 npx vitest run lib/dante-core/__tests__/ich1-intelligence.live.test.ts`
  runs an opt-in real-provider smoke. Not frozen; independent evaluation
  pending.

## SetVision

`lib/setvision/` — MoveNet-based (reuses the same pose detector as the
pre-existing Form Coach feature) rep counting, ROM, tempo, velocity, bar-path
and technique-consistency analysis for Bench Press/Squat/Deadlift, driven
from an uploaded video processed entirely client-side. Public API:
`lib/setvision/index.ts` (`analyzeWorkoutVideo`). Product surface:
`/dashboard/workouts/setvision`. **No real accuracy numbers exist yet** —
see docs/setvision.md's Benchmarking section before ever quoting one.
Persistence needs `supabase/migrations/20260916090000_setvision.sql`
applied (not done automatically by this pass — review before running).

## HawkerLens SG

This doc previously said "do not build yet" — that's stale. It's already
built and live at `/dashboard/nutrition` (`lib/hawkerlens/`,
`app/api/hawkerlens/{scan,confirm}/route.ts`,
`components/nutrition/hawkerlens-panel.tsx`). It correctly plugs into
nutrition the way this doc always required: `app/api/hawkerlens/confirm/route.ts`
calls the same `createFoodLog()` every other source (barcode/search/photo)
uses, tagged `source: "ai_estimate"`, gated behind a real-vs-demo vision
check with explicit "Demo mode" UI disclosure. No architectural fix needed
here — this is a documentation correction only. Whether to keep it live,
gate it further, or fold it into a broader HawkerLens SG rollout is a
product decision, not an architecture-review action.
