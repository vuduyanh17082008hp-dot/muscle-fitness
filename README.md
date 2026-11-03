# Muscle Fitness

Muscle Fitness is a training, nutrition and recovery app built around one real
athlete profile. Most fitness apps record what you did; Muscle Fitness uses
that record to help decide what you should do next.

Its coach is **Dante** — the only AI coach in the product. Dante explains
numbers that deterministic code computes; it never invents a readiness score,
a macro total or a "saved" state.

> **Release status:** production-frozen. See [Known limitations](#known-limitations)
> before relying on any feature marked experimental.

---

## One Day. One Thread.

Every Dante surface — the Dante page, the Nutrition chat, the floating
assistant — writes to the same conversation thread for the day
(`lib/dante-core/active-thread.ts`). Meal state is held server-side on that
thread (`ai_messages.metadata.nutrition`), so "log that" on one screen sees the
meal you picked on another. "New chat" starts a fresh thread; otherwise the tab
continues today's latest one.

## Capabilities

### Dante (AI coach)

- One coach for training, nutrition and recovery. `/api/chatbot` routes each
  turn to the right engine: meal and food-lookup turns run the nutrition engine
  and come back as a confirmation card; training and recovery turns run the
  main pipeline.
- A safety layer (`lib/dante-core/safety-layer.ts`) runs before any model call
  and hard-blocks red flags (for example, can't bear weight, or a "pop" at
  injury).
- Dante receives structured context only (`lib/athlete-state/build-athlete-state.ts`),
  never raw database rows.
- Every write Dante proposes — a meal log, a workout adjustment, a calorie or
  schedule change — needs an explicit **Confirm / Accept** from the user, and
  the server re-checks ownership and safety at confirmation time.
- Voice input transcribes through OpenAI (`/api/dante/transcribe`).
- Conversation history persists in `ai_threads` / `ai_messages`.

### Training

- Plan builder, workout player (sets, rest timer, carry-forward hints, finish
  confirmation), history and progress.
- Exercise catalogue with an anatomy atlas, substitutions and experience-aware
  set prescriptions.
- Training holds: a reported pain or unresolved limitation blocks starting a
  session, enforced in the database as well as the UI.

### Nutrition

- Real Supabase-backed food log. Inputs: search (USDA → Open Food Facts →
  local fallback), barcode (Open Food Facts), photo estimate, menu-to-macro,
  a Vietnamese food catalogue, and HawkerLens SG (hawker dishes).
- Every source normalizes into one shape, and the server recomputes macros
  from `per100g × quantity` and re-resolves provenance. A client can't mark
  its own values as verified.
- Dante's nutrition engine proposes meals within the day's remaining targets,
  respects allergies and exclusions, and logs only after you confirm the card.

### Recovery

- Daily check-ins and a deterministic readiness score
  (`lib/recovery/score.ts`). Dante explains the score; it doesn't change it.
- A limitation you report ("readiness 94 but my foot hurts") is never cleared
  by a high readiness number. It goes through a limitation review against
  today's real session, with region-filtered substitutions behind a signed
  Confirm card.

### SetVision (training computer vision)

- Upload a set video. Pose estimation runs in the browser (MoveNet).
- Counts reps, range of motion, tempo, velocity, bar path and consistency.
- An optional AI review adds technique observations. They are always worded
  as **possible** findings, never confirmed ones.
- SetVision is shown as a controlled demo: its entry points are hidden from
  the main navigation, and the route is
  `/dashboard/workouts/setvision`.

| Coverage | Exercises |
| --- | --- |
| Verified rep tracking | Barbell back squat (free squat) |
| Experimental movement-family engines | Hinge, presses, pulls, curl, triceps extension, lateral raise, hack/Smith squat (38 catalogue + 5 SetVision-only) |
| Manual review only (no automatic count) | Flies, leg press, leg extension, leg curls, split squats, step-up, calf raises, hip thrust, glute bridge, crunches, leg raises, plank, landmine press, lunge (27 catalogue + 1 SetVision-only) |

You can review, correct and save any exercise. The full matrix is in
[docs/setvision.md](docs/setvision.md).

## Technology

| Layer | Stack |
| --- | --- |
| App | Next.js 16 (App Router, webpack build), React 19, TypeScript 5.9 |
| UI | Tailwind CSS 4, Radix UI, framer-motion |
| Data / auth | Supabase (Postgres, Row Level Security, Auth) via `@supabase/ssr` |
| AI | OpenAI only (chat, vision, transcription, embeddings) |
| Vision | TensorFlow.js MoveNet (SetVision), MediaPipe (squat pilot) — in-browser |
| Food data | USDA FoodData Central, Open Food Facts, curated local catalogues |
| Tests | Vitest (unit, route, live-DB suites) |
| Hosting | Vercel |

## Architecture

```
Browser ── proxy.ts (session refresh, route guard: lib/supabase/proxy.ts)
   │
   ├─ /dashboard/*  client app (Today, Training, Nutrition, Recovery, Dante)
   ├─ /business/*   coach / gym-owner portal  (requireBusinessAdmin)
   └─ /admin        platform admin            (requireAdmin)

API routes ── domain services (lib/training, lib/nutrition, lib/recovery, …)
   │              └─ Supabase (RLS: each user sees only their own rows)
   │
   └─ /api/chatbot ── safety layer ── athlete state (structured context)
                        ├─ nutrition engine  → confirm card → createFoodLog
                        └─ Dante pipeline    → Dante Core engines → OpenAI
```

- **Roles:** client, business and platform admin are three separate role
  systems. Authority comes from `user_roles` only
  (`lib/auth/permissions.ts::resolveActorRole`).
- **Dante Core** (`lib/dante-core/`) holds the deterministic readiness and
  autoregulation engines, the safety layer, and an explanation layer that
  never lets the model compute a number. See [docs/dante-core.md](docs/dante-core.md).
- **Performance Intelligence Core** (`lib/intelligence/performance-core/`)
  holds curated, PubMed-sourced knowledge records with evidence strength,
  plus the recommendation policy and output-integrity checks.
- The service-role client (`lib/supabase/admin.ts`) is server-only, and every
  query through it is scoped to the authenticated user's id.

Deeper notes: [docs/architecture.md](docs/architecture.md).

## Setup

Requirements: Node.js 22+, npm, and a Supabase project. Docker is needed only
for local Supabase and the database test suites.

```bash
git clone https://github.com/vuduyanh17082008hp-dot/muscle-fitness.git
cd muscle-fitness
npm install            # npm only — don't mix in pnpm (it installs a second supabase-js)
cp .env.example .env.local   # then fill in values
npm run dev            # http://localhost:3000
```

Use `http://localhost:3000`, not `127.0.0.1` — the dev server only hydrates on
`localhost`.

Apply the database schema from `supabase/migrations/` to your project
(`supabase db push`, or `supabase start` for a local stack). Review each
migration before running it against a shared database.

### Environment variables

Names only. Never commit values; `.env*` files are git-ignored except
`.env.example`.

| Required | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client key (legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also accepted) |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | Server-only writes: recovery proposals, tool-action finalization, coach signals |
| `OPENAI_API_KEY` | Dante, vision, transcription, embeddings |
| `RECOVERY_PROPOSAL_SECRET` | Signs recovery/workout adjustment proposals |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for auth redirects (for example, the production domain) |

| Optional | Purpose |
| --- | --- |
| `OPENAI_MODEL`, `OPENAI_VISION_MODEL`, `OPENAI_REASONING_EFFORT` | Model selection |
| `DANTE_OPENAI_MODEL`, `DANTE_OPENAI_FALLBACK_MODEL`, `DANTE_OPENAI_VISION_MODEL`, `DANTE_TRANSCRIBE_MODEL` | Dante-specific model overrides |
| `OPENAI_SETVISION_VISION_MODEL`, `OPENAI_MENU_VISION_MODEL` | SetVision review / menu-to-macro models |
| `DANTE_EMBEDDING_API_KEY`, `DANTE_EMBEDDING_BASE_URL`, `DANTE_EMBEDDING_MODEL`, `DANTE_EMBEDDING_DIMENSIONS`, `DANTE_RAG_MIN_SCORE` | Knowledge retrieval |
| `DANTE_RATE_LIMIT_REQUESTS`, `DANTE_RATE_LIMIT_WINDOW_SECONDS` | Chat rate limit |
| `USDA_FDC_API_KEY`, `OPENFOODFACTS_USER_AGENT` | Food search providers |
| `NCBI_API_KEY`, `NCBI_EMAIL`, `NCBI_TOOL`, `OPENFDA_API_KEY`, `MUSCLEWIKI_API_KEY` | Evidence and exercise lookups |
| `DANTE_RUNTIME_AUDIT` | Extra runtime audit logging |
| `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` | Optional Drive export |

## Development and testing

```bash
npm run dev          # dev server (webpack)
npm run type-check   # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run
npm run check        # type-check + lint + test
npm run build        # production build
```

Unit tests block real network access unless a `*LIVE*` flag is set.
Database suites (`*.db.test.ts`) run against a disposable local Supabase stack
built from this checkout's migrations:

```bash
node scripts/test-db-stack.mjs        # starts it and prints the MF_TEST_* env line
# run npm test with that env line
node scripts/test-db-stack.mjs stop
```

More: [docs/RUN_LOCAL.md](docs/RUN_LOCAL.md).

## Release verification (S4-B)

Engineering checks on the release source:

- Type-check, lint and production build pass (lint: 0 errors, a few tracked
  low-risk warnings).
- Full Vitest suite, including the database suites on a disposable stack:
  433 files, 6,194 tests passing (40 opt-in live-provider files skipped).
- One Day, One Thread, meal confirmation and safety holds were checked live
  on a local stack with real OpenAI calls.

These are engineering tests, not a clinical or user study.

## Known limitations

- **Voice:** transcription is tested with synthetic English audio against the
  real API. Human microphone input and Vietnamese speech aren't fully
  verified.
- **SetVision:** real-world validation is **partial**. No labelled benchmark
  exists, so no accuracy number may be quoted for any engine. Only the free
  squat is verified; the other engines are experimental and many exercises
  are manual review only (see the table above). Multiple people in frame can
  still confuse counting.
- **AI technique findings** from SetVision are possible observations, not
  confirmed faults.
- **Form Coach live camera** (`/dashboard/workouts/form-coach/live`) is an
  unevaluated squat-only pilot.
- **Nutrition estimates** from photos, menus and hawker dishes are estimates and
  are stored as such. Some swaps are calorie-matched to large portions.
- **Google sign-in** isn't configured for local development; use
  email/password.
- `/admin/login` is the business-portal login (a naming collision with the
  platform `/admin`). `/dashboard/ai-coach` keeps its historical URL for
  the Dante page.
- Dante gives general fitness guidance, not medical advice.

## Deployment

The app deploys to Vercel as a standard Next.js project (`vercel.json`:
`framework: nextjs`; build command `npm run build`).

1. Set every required environment variable for the target environment in
   Vercel. Set `NEXT_PUBLIC_SITE_URL` to that environment's origin, and add
   the origin to Supabase Auth redirect URLs.
2. Production builds reject a loopback (`http://127.0.0.1`) Supabase URL by
   design.
3. Apply pending migrations to the production database only after a backup and
   review. The app expects every migration in `supabase/migrations/`.
4. Deploy to a preview first, verify sign-in, a food log, a Dante turn and a
   workout start, then promote.
5. Roll back by promoting the previous production deployment in Vercel.

## Documentation

| Doc | Covers |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | System overview, role systems, data flow |
| [docs/dante-core.md](docs/dante-core.md) | Readiness and autoregulation formulas, safety layer |
| [docs/nutrition-coach.md](docs/nutrition-coach.md) | Dante's nutrition engine |
| [docs/setvision.md](docs/setvision.md) | SetVision engines, coverage, validation status |
| [docs/hawkerlens.md](docs/hawkerlens.md) | HawkerLens SG |
| [docs/RESPONSIBLE_AI.md](docs/RESPONSIBLE_AI.md) | Responsible-AI posture |
| [docs/RUN_LOCAL.md](docs/RUN_LOCAL.md) | Local setup and test stacks |
