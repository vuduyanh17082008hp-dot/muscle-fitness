# Muscle Fitness — Run & Test Locally

## Quick start

```bash
cd muscle-fitness   # your clone
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

## Required environment

File: `.env.local` (already present on this machine — do not commit secrets)

Minimum:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_KEY
# or legacy:
# NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Optional:

```env
OPENAI_API_KEY=
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

## Validation commands

```bash
npm run type-check
npm run lint
npm run build
```

## Database tests (`*.db.test.ts`)

These run SQL through `docker exec` against a local Supabase stack. Without
`MF_TEST_*` they use `supabase_db_muscle-fitness-claude`, the one stack every
worktree on the machine shares — it is usually behind your branch's
migrations, and must not be migrated from a feature branch. Build a
disposable stack from this checkout's migrations instead (local Docker only,
ports 566xx, rebuilt from scratch on every run):

```bash
node scripts/test-db-stack.mjs        # prints the exact env line below
MF_TEST_DB_CONTAINER=supabase_db_mf-test-db MF_TEST_AUTH_CONTAINER=supabase_auth_mf-test-db \
  MF_TEST_API_URL=http://127.0.0.1:56631 MF_TEST_SUPABASE_URL=http://127.0.0.1:56631 npm test
node scripts/test-db-stack.mjs stop   # remove it
```

Set all four `MF_TEST_*` vars or none: `test/db-target-guard.ts` (vitest
globalSetup) fails the run on a partial selection or an unreachable stack,
so the DB suites can't silently skip or mix one stack's DB with another's API.
Plain `npm test` still uses the shared stack; when that stack is behind (e.g.
missing `20261101120000_hypertrophy_catalogue.sql`), `workout-runtime.db`
A/D and B fail and `training-hold.db` skips — an environment gap, not a
product bug. Use the isolated command above for a full DB run.

## Test checklist

1. **Landing** — `/`
2. **Story** — `/story`
3. **Register / Login** — `/register`, `/login`
4. **Onboarding** — `/onboarding` (after auth)
5. **Dashboard** — `/dashboard` (real profile targets)
6. **Workouts** — `/dashboard/workouts`
7. **Plan builder** — `/dashboard/workouts/plans/new`
8. **Session player** — `/dashboard/workouts/session/[sessionId]`
9. **History** — `/dashboard/workouts/history`
10. **Nutrition / Progress / AI Coach nav** — `/dashboard/nutrition`, `/dashboard/progress`, `/dashboard/ai-coach`
11. **Coach chat** — `/chatbot`
12. **Meal plan calculator** — `/meal-plan`

## Source of truth

- Active app: repository root (`app/`, `components/`, `lib/`, `features/`)
- Nested `muscle-fitness/` folder is a Project 09 scaffold and is excluded from TypeScript
- Full audit: `docs/REPOSITORY_AUDIT.md`

## Notes for testers

- Dashboard nav sections no longer 404
- Workout set save / skip / replace / finish now use server mutations against Supabase
- Fake AI plan endpoint no longer invents sample workouts as user data
- AI Coach chat remains educational / non-medical
- Landing images under `/images/...` may still be missing from `public/`
