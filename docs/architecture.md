# Architecture

Snapshot as of the 2026-09-12 stabilization pass. See `CLAUDE.md` for
day-to-day working conventions; this document is the fuller picture.

## Data flow

```
User
 -> Muscle Fitness (Next.js app)
 -> Training / Nutrition / Recovery / Progress (feature pages + API routes)
 -> Supabase (Postgres, RLS, auth)
 -> lib/athlete-state/build-athlete-state.ts   (deterministic aggregation)
 -> Dante (app/api/chatbot/route.ts)            (explains, does not compute)
 -> Adaptive recommendation shown to user
 -> New data logged
 -> (loop)
```

The structured-context layer (`buildAthleteState`) is the boundary Dante
Core will eventually replace/extend. It is the only thing that should ever
be handed to an LLM as "what does this user look like right now" — never a
raw table dump.

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
