# Database types (TYPE-01)

**Canonical schema source:** `supabase/migrations/*.sql` (the only place the repo versions schema changes).
**Canonical type artifact:** `database.types.generated.ts` — generated, never hand-edited.

```
supabase/migrations  ->  local Supabase DB (supabase migration up --local)  ->  database.types.generated.ts
```

Why migrations: they are the only reviewed, version-controlled, replayable schema record. A hosted
DB is unverified and off-limits for generation unless explicitly authorized.

## Commands
- Regenerate: `npm run db:types` (needs `supabase start` and all migrations applied locally).
- Drift check: `npm run db:types:check` (fails if the committed file differs from the local DB).
  Run it after any migration change and in CI wherever a local Supabase stack is available.

Current generated state = local DB at migration `20261011110000` (all repo migrations applied,
including `20261008090000` which was pending locally).

## Inventory
| File | Class | Status |
|---|---|---|
| `database.types.generated.ts` | CANONICAL / GENERATED | use this |
| `database.types.ts` | DUPLICATE | now a 1-line re-export shim |
| `types/database.types.ts` | LEGACY | re-exports canonical; keeps only the `Profile`/`UserRole`... aliases |
| `types/app-database.types.ts` | HAND_WRITTEN / LEGACY | deprecated overlay, still used by `plans/[planId]/page.tsx` only (history + session moved to canonical in WF-04/05) |
| `src/types/database.types.ts` | UNKNOWN (empty file) | untouched |
| `lib/database/types.ts` | UNKNOWN | untouched |

## Typed clients
- `createTypedClient()` (`lib/supabase/server.ts`) is `createServerClient<Database>`; used by `createWorkoutPlanAction`.
- `createClient()` (server), the browser client and the admin client are still untyped.
  Typing them globally was tried: ~100 errors, all in modules whose queries do not match the
  migration schema (separate defects, deliberately NOT fixed in Batch 2):
  - `business*` tables (`businesses`, `business_staff`, `business_members`, `business_programs`) have **no migration**.
  - (WF-04/05 FIXED) history + session pages now read exercise_sets via `session_exercise_id`, `duration_minutes`, `total_volume_kg`.
  - Smaller type mismatches in `lib/audit/log.ts`, `lib/dante-core/tools/pending-actions.ts`, (DB-02-01 FIXED: `app/account/*` now on `createTypedClient()` + atomic `save_account_profile` RPC) `app/onboarding/actions.ts`.
  Migrate callers to `createTypedClient()` as those are fixed.

## Workout schema reconciliation
`20260805090000_workout_system.sql` is a no-op on DBs that already ran `20260804190000_project_09_workout_system.sql`.
`20261011100000_workout_schema_reconcile_app_columns.sql` additively adds the columns the app uses
(`day_number` generated from `day_order`, `focus`, `rest_day`, `exercise_name`, `rir`; `exercise_id` nullable).
`workout_plans.status` (`paused`) drift is SCHEMA-02 and untouched.
