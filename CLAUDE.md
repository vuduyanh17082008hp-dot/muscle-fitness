@AGENTS.md

# Muscle Fitness — Working Notes

Muscle Fitness is evolving from a fitness tracker into an **AI Performance
Intelligence Platform**. Long-term this app is one layer of a larger system:

```
Muscle Fitness (product layer)
Dante Core        (adaptive decision intelligence — lib/dante-core/, see docs/dante-core.md)
SetVision         (training computer vision — lib/setvision/, see docs/setvision.md)
HawkerLens SG     (Singapore food intelligence — lib/hawkerlens/, see docs/hawkerlens.md)
Dante 3D          (virtual coach avatar — components/dante-avatar/, see docs/dante-avatar.md)
Presentation Mode (/presentation — see docs/presentation.md)
```

All four AI modules (Dante Core, SetVision, HawkerLens, and the avatar) are
independently usable — none imports from another, and none breaks if
another is removed. See docs/architecture.md's "Final ecosystem data flow"
for the exact coupling rules.

Product thesis (architectural principle, not marketing copy to repeat
everywhere): most fitness apps record what you did — Muscle Fitness helps
determine what you should do next.

## Route structure

Client (end user), business (coach/gym operator), and platform-admin are
**three separate role systems** — do not conflate them:

- `/dashboard/*`, `/account*`, `/onboarding`, `/coach`, `/chatbot` — end
  user, gated by `lib/auth/permissions.ts` / per-page `supabase.auth.getUser()`
  checks, role resolved via `lib/auth/guard.ts::resolveActorRole` (`user_roles`
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
- No service-role/admin Supabase client exists in this codebase by design.
  If one is added later, it must never be imported into client-bundled code.
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
(USDA → Open Food Facts → local fallback), photo estimation
(`lib/nutrition/photo-estimate.ts`), and now HawkerLens SG
(`lib/hawkerlens/`) all normalize into one `ConfirmedFood` shape
(`components/nutrition/types.ts`) before hitting
`app/api/nutrition/log/route.ts`. The server always recomputes macros from
`per100g × quantity` — never trusts client-submitted totals. Keep it that
way when adding new input sources.

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

`lib/hawkerlens/` — Groq-vision-based (closed-set prompt, not a fine-tuned
model — no training dataset exists) dish classification + component
decomposition for 10 MVP Singapore hawker dishes, with a mandatory
calorie/protein RANGE (never a bare number) and three separately-tracked
uncertainty dimensions. Plugs into nutrition the same way barcode/search/
photo do — produces a normal `food_logs` row via the same `createFoodLog()`
path, `source: "ai_estimate"`. Product surface: the "HawkerLens SG" option
in the nutrition tracker's Track Food modal. **Curated dish nutrition data
is an internal estimate, not a verified Singapore-specific source** — see
docs/hawkerlens.md. Persistence needs
`supabase/migrations/20260917090000_hawkerlens.sql` applied (not done
automatically — review before running).

## Events and Daily Intelligence

`lib/events/emit.ts::emitEvent()` — six typed events, each logged to
`app_events` and (for five of six) triggering a cached recompute of
`dante_daily_intelligence` (`lib/dante-core/daily-intelligence.ts`), read
by the dashboard's `DailyIntelligenceCard`. Needs
`supabase/migrations/20260918090000_events_and_intelligence.sql` applied.
When adding a new mutation that should feed Dante's daily summary, call
`emitEvent()` at the end of it rather than teaching the summary builder to
poll a new table directly.

## AI Evaluation Dashboard

`/admin/ai-evaluation` (admin-only). Every metric is labeled Real or Demo
Data — see docs/ai-evaluation.md before trusting or quoting any number from
it. SetVision/HawkerLens accuracy metrics are currently Demo Data (no real
labeled dataset exists); Dante's safety-layer and determinism checks are
Real (live-computed on page load).

## Dante 3D / Presentation Mode

`components/dante-avatar/` — a real Three.js/React Three Fiber pose state
machine driving a procedural PLACEHOLDER humanoid (no sculpted character
model exists — see docs/dante-avatar.md for exactly what's real vs. a
stand-in, and how to swap in a real `.glb` later without touching the pose
system). `/presentation` is a fully static, zero-network-dependency
deterministic demo route (see docs/presentation.md) — do not add a
Supabase/API call to it; that would violate its core "works with everything
down" requirement.
