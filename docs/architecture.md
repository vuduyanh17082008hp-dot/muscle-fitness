# Architecture

Snapshot updated through the final AI-ecosystem-integration pass (Dante
Core, SetVision, HawkerLens SG, the event model, the benchmark dashboard,
Dante 3D, and Presentation Mode). See `CLAUDE.md` for day-to-day working
conventions; this document is the fuller picture. See
`docs/dante-core.md`, `docs/setvision.md`, `docs/hawkerlens.md`,
`docs/dante-avatar.md`, `docs/presentation.md`, and `docs/ai-evaluation.md`
for each subsystem's full detail.

## Final ecosystem data flow

```
                USER
                 |
                 v
         MUSCLE FITNESS
                 |
    +------------+------------+
    |            |            |
    v            v            v
SETVISION    DANTE CORE    HAWKERLENS
    |            ^            |
    +------------+------------+
                 |
           STRUCTURED DATA
      (lib/athlete-state, lib/dante-core/readiness-engine,
       SetVisionAnalysis, HawkerLensResult — never raw table dumps)
                 |
                 v
          ADAPTIVE DECISION
      (lib/dante-core/autoregulation-engine -> TraceableDecision)
                 |
                 v
               USER
                 |
                 +---- events (lib/events) ----> Dante Daily Intelligence
                 |                                (recomputed on meaningful
                 |                                 events, cached, not
                 |                                 recomputed per render)
                 +--------------------------------------------- (loop)
```

SetVision and HawkerLens are each independently usable (`/dashboard/
workouts/setvision`, the HawkerLens scan panel in nutrition tracking) with
no dependency on Dante Core — Dante Core only OPTIONALLY consumes their
output (`SetVisionSessionSignal`, and HawkerLens data reaching Dante only
indirectly via the food log / nutrition adherence numbers). Neither module
imports from `lib/dante-core/`, and `lib/dante-core/` never imports from
`lib/setvision/` or `lib/hawkerlens/` — the coupling is one-directional,
data-shaped, and happens at the call site (API routes / components), never
inside the library code itself. This was a deliberate check against the
spec's "do not create direct dependencies that make each AI module
unusable independently."

## Structured-context layers (plural, now)

| Layer | Feeds | Lives in |
|---|---|---|
| `buildAthleteState()` | The chatbot's free-form conversation | `lib/athlete-state/` |
| `evaluateReadiness()` | Autoregulation decisions, the daily intelligence summary | `lib/dante-core/readiness-engine.ts` |
| `SetVisionAnalysis` | The autoregulation engine's `setVision` input, the results UI | `lib/setvision/types.ts` |
| `HawkerLensResult` | The nutrition confirmation UI, food_logs on save | `lib/hawkerlens/types.ts` |

All four exist because they serve genuinely different consumers with
different shapes — this was a deliberate decision against collapsing them
into one mega-object, which would couple unrelated features together.

## Event model (spec Part B §14)

`lib/events/emit.ts::emitEvent()` — six event types
(`WORKOUT_COMPLETED`, `SET_ANALYZED`, `FOOD_LOGGED`, `RECOVERY_UPDATED`,
`BODYWEIGHT_UPDATED`, `CHECKIN_COMPLETED`), each appended to `app_events`
(a real, queryable audit table) and, for five of the six (all but
`BODYWEIGHT_UPDATED`, which doesn't feed any cached number), triggering a
recompute of `dante_daily_intelligence` — cached per user per day, not
recomputed on every dashboard render. Wired into: `lib/workouts/
session-mutations.ts` (finish workout), `app/api/recovery/checkin/route.ts`,
`lib/nutrition/food-log/mutations.ts::createFoodLog` (every input method —
barcode/search/photo/HawkerLens/manual — funnels through this one function,
so one `emitEvent` call covers all of them), `app/api/setvision/
results/route.ts`, and `app/api/progress/route.ts` (bodyweight).

## Dante Daily Intelligence (spec Part B §15)

`lib/dante-core/daily-intelligence.ts::buildDailyIntelligence()` —
aggregates `evaluateReadiness()`, today's scheduled `workout_sessions.name`
(training focus), calorie-target-vs-consumed (nutrition adherence %), and
recovery status, then asks the LLM for ONE short grounded sentence (with a
deterministic template fallback if the LLM call fails). Rendered on the
main dashboard via `components/dante/daily-intelligence-card.tsx`, backed
by `/api/dante/daily`.

## Closed loop (spec Part B §16) — what's real vs. demonstrated

The REAL, live version of this loop already exists in the product:
`/dashboard/workouts/setvision`'s "Ask Dante" button sends a real
`SetVisionAnalysis`'s velocity-loss signal to `/api/dante/recommendation`,
which returns a real `TraceableDecision` rendered via `DecisionCard`. What
does NOT yet exist: an automatic feed-forward where that decision changes
what the NEXT logged session's `workout_session_exercises` target load
actually is — that would require wiring the decision into the program/
progression engine (`lib/training/progression-engine.ts`), which was
judged too large a change to make blind in this pass (see "Not touched,
and why" below). The full narrative loop (plan → train → SetVision →
Dante → retrain → improve → save → next plan) IS demonstrated end-to-end,
with real production UI, in Presentation Mode's `closed_loop` beat — using
hand-authored demo numbers, not a replay of a real historical session. See
`docs/presentation.md`.

## Role systems

Three independent role systems exist; none share a guard:

| Surface | Guard | Backing tables |
|---|---|---|
| `/dashboard/*`, `/account*`, `/onboarding` | `lib/auth/guard.ts`, per-page `supabase.auth.getUser()` | `profiles`, `user_roles` |
| `/business/*` (coach/gym portal) | `requireBusinessAdmin()` (`lib/business/require-business-admin.ts`) | `businesses`, `business_staff` |
| `/admin` (platform admin) | `requireAdmin()` (`lib/auth/permissions.ts`) | `user_roles` (`app_role` enum) |

Known issue: `/admin/login` is actually the business-portal login, not the
platform-admin login — the URL implies the wrong persona. Not renamed yet
because it's a live, linked route; fixing it needs a redirect-compatible
rename, not a blind move.

## Middleware

Next.js 16 renamed `middleware.ts` to `proxy.ts` and only loads it from the
project root (or `src/`). Before this pass, the real route-protection logic
lived in `app/proxy.ts` → `lib/supabase/proxy.ts`, which Next.js never
executed — every "protected" route was relying entirely on per-page server
checks, with no edge-level enforcement or session-refresh guarantee. Fixed
by making the root `proxy.ts` delegate to the existing, already-correct
`lib/supabase/proxy.ts::updateSession`, and removing the dead `app/proxy.ts`.
Verified via `npm run build`, which now lists `ƒ Proxy (Middleware)` in the
route table (it did not appear before the fix).

## Supabase access layer

Canonical clients: `lib/supabase/client.ts` (browser), `lib/supabase/server.ts`
(server), both reading env via `lib/supabase/env.ts::getSupabaseEnvironment()`.
`lib/supabase/config.ts` is a thin `{url, key}` adapter over the same
function, kept only because `lib/supabase/client.ts` expects that shape.

Domain service modules exist under `lib/{training,nutrition,recovery,
workouts,athlete-state,repositories}/` and are the preferred place for new
Supabase queries. They are **not** universally used yet — `fitness_profiles`
and `workout_sessions` are each queried directly from ~6 different
pages/actions (e.g. `app/account/actions.ts` and `app/onboarding/actions.ts`
each independently upsert `fitness_profiles` with near-identical code).
Consolidating these into a shared repository function is flagged as
technical debt rather than done in this pass — the onboarding and account
save flows are live, user-facing, and not something to refactor without
the ability to test the actual browser flow end-to-end.

### Database types

Four Supabase type files existed before this pass:
`database.types.ts` (root, hand-maintained, actively imported), a stale
`database.types.generated.ts` (0 importers — deleted), a subset
`types/database.types.ts` (used only by `lib/database/queries.ts`), and an
empty `types/supabase.ts` (deleted). `types/app-database.types.ts` wraps the
root file with a hand-written `WorkoutTables` override and is used by 7
files. Full consolidation onto one canonical type source is still open —
regenerating types from the live Supabase schema and reconciling the
`WorkoutTables` override is the next step, deferred because it touches
type-level contracts across the workout history/session code without a way
to verify against the live database schema from this environment.

## Dead code removed in this pass

Confirmed via grep (zero importers) before deletion, then verified with
`npm run type-check`, `npm run lint`, `npm test`, and `npm run build`:

- `app/auth/login/` (dead duplicate of `app/login/`), `app/auth/actions.ts`
  (unused server actions duplicating `login-form.tsx`/`register-form.tsx`)
- `app/onboarding-backup/` and its only reference, a defensive entry in
  `lib/auth/safe-next.ts`'s blocked-redirect list
- `app/business/(portal)/members/trainers/` and `app/business/insights/`
  (unlinked duplicates of `app/business/(portal)/trainers/` and
  `app/business/(portal)/ai-insights/`)
- `app/business/business-mobile-nav/page.tsx` — a component file mistakenly
  placed as a route, serving a drifted copy of
  `components/business/business-mobile-nav.tsx` at a real, unlinked URL
- `app/marketing/` (layout with no page, unreachable) and the two things
  only it kept alive: `components/layout/site-header.tsx` and the unrelated,
  separately-unused `components/Navbar.tsx` / `components/layout/navbar.tsx`
- `hooks/useAuth.ts` (only consumer was `app/onboarding-backup`)
- `lib/client.ts` and `utils/supabase/server.ts` (duplicate Supabase client
  constructors; the one real caller of the latter was migrated to the
  canonical `lib/supabase/server.ts`)

## Bugs fixed in this pass

- **`/auth/signout` 404**: the route directory was misspelled `singout`.
  Every sign-out button/form in the app (`account/page.tsx`, both
  `logout-button.tsx` components, `user-menu.tsx`) posted to the correctly
  spelled `/auth/signout`, which didn't exist. Renamed the directory.
- **`/admin/unauthorized` 404**: `lib/business/require-business-admin.ts`
  redirected unauthorized business-portal users to a route that was never
  created. Pointed it at the existing `/unauthorized` page instead.
- **Recovery empty-state dead end**: the dashboard's "Recovery data is
  empty" card linked to `/dashboard/today` (a generic dynamic-route stub)
  instead of the real recovery check-in page. Fixed to link to
  `/dashboard/recovery`.
- **Middleware not executing** — see above.

## Dante naming pass

Renamed `components/ai-coach-chat.tsx` (`AICoachChat`) to
`components/dante-chat.tsx` (`DanteChat`), and replaced "AI Coach" as a
product/entity name with "Dante" across `/coach`, the dashboard `[section]`
page, `dashboard-overview.tsx`, `dashboard-shell.tsx` nav, `front-page.tsx`,
`auth-shell.tsx`, and `lib/dante-language.ts`. The `/dashboard/ai-coach`
URL segment itself was intentionally left as-is — renaming a live route
needs a redirect, not a blind rename, and is left as follow-up work.

## Not touched, and why

- **Nutrition and recovery systems**: audited in depth and found to already
  be real, Supabase-backed, well-structured features (barcode/search/photo
  food input normalizing into one shape, deterministic recovery scoring).
  The task brief assumed these might be mocked; they weren't. No changes
  needed beyond what's listed above.
- **`app/callback/route.ts` vs `app/auth/callback/route.ts`**: `/callback`
  has no in-repo callers (all `redirectTo` builders point at
  `/auth/callback`), but it could still be registered as a redirect URI in
  the live Supabase Auth provider configuration, which this environment
  cannot inspect. Left in place rather than risk breaking OAuth in
  production; flagged for a human to check the Supabase dashboard's
  configured redirect URLs before deleting.
- **`fitness_profiles`/`workout_sessions` query duplication**,
  **`/admin/login` naming collision**, and **database type consolidation**:
  real, confirmed issues, deliberately deferred — each touches live
  auth/onboarding/workout-history flows that need browser-level testing to
  change safely, which isn't available in this environment.
- **Feed-forward from a Dante decision into the actual program/progression
  engine** (see "Closed loop" above): a real architectural change to
  `lib/training/progression-engine.ts`'s inputs, deferred rather than made
  blind without the ability to test the real workout-session flow live.
- **A service-role Supabase client**: introduced nowhere in this pass. The
  AI Evaluation dashboard's usage counts are RLS-scoped to the requesting
  admin's own rows rather than system-wide, specifically to avoid adding
  the first service-role client (a new secret, a new privilege boundary)
  as a side effect of a dashboard feature. See `docs/ai-evaluation.md`.
- **A real Dante 3D character model, real TTS narration, and lip sync**:
  see `docs/dante-avatar.md` — the pipeline is real, the assets aren't, and
  the doc says so plainly rather than papering over it.
