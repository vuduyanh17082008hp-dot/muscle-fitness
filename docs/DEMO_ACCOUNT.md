# Demo account readiness

Competition demos must use a **real authenticated account**. Do not hardcode
credentials in docs that get committed, bypass auth, or write to hosted
Supabase without an explicit go-ahead.

Wearable “demo scenarios” (HRV / sleep fixtures) are a separate, labeled
toggle — see `docs/DEMO_SCRIPT.md` and `/admin/ai-evaluation`. They are
**not** a substitute for training, nutrition, recovery, or progress logs.

## Environment

| Target | Allowed for this seed? |
| --- | --- |
| Local Docker stack at `http://127.0.0.1:54321` (`muscle-fitness-nof1-local`) | Yes |
| Dedicated non-prod Supabase | Only with explicit approval |
| Hosted project `jlwszvtitjtgothgxubo` | **No. The seed refuses any non-loopback URL.** |

The Next app’s `.env.local` currently points at hosted. **The seeded user is
invisible to that process until you point the app at local loopback and
restart.** Copy the local anon key from the running Docker stack (`supabase
status` in the directory that started `muscle-fitness-nof1-local`), not the
hosted publishable key.

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Do not commit that file.

## How the account is created

Synthetic identity (not a real person): **Jordan Lee**, timezone
`Asia/Singapore`, goal build muscle, intermediate, 4 days/week.

1. Confirm local API: `http://127.0.0.1:54321/auth/v1/health`.
2. Set a password in the shell only (never in git):

   ```powershell
   $env:MF_DEMO_PASSWORD = "your-local-only-password"
   $env:MF_DEMO_EMAIL = "golden-journey.demo@local.test"   # optional
   npm run demo:seed-local
   ```

3. If `MF_DEMO_PASSWORD` is omitted on **first** create, the script prints a
   generated password once to stdout. Store it in a password manager. Later
   re-seeds require `MF_DEMO_PASSWORD` (the script will not rotate it).

The script is idempotent for this email: it resets **that user’s**
workout/recovery/nutrition rows and re-inserts. It does not truncate other
users. It never disables RLS. Admin APIs are used only on loopback to
create/confirm the auth user.

## What gets populated

| Domain | Tables | Enough for |
| --- | --- | --- |
| Profile | `profiles`, `fitness_profiles`, `user_preferences` | Dashboard, nutrition engine, onboarding gate |
| Training | active `workout_plans` + 7 completed sessions + today’s Upper (not started) | `/dashboard`, `/dashboard/workouts` |
| Recovery | 12 daily `recovery_checkins` with `computeRecoveryScore` | `/dashboard/recovery`, Dante readiness |
| Nutrition | `food_logs` (~2 weeks; today lunch only so remaining macros show) | `/dashboard/nutrition` |
| Progress | derived from the above (no fake bodyweight trend — that feature is honest-empty) | `/dashboard/progress` |

Coherent story: last two days sleep/fatigue/soreness are down (score ~60 vs
~83 baseline), yesterday was Lower, today is scheduled Upper.

## Reset

```powershell
$env:MF_DEMO_PASSWORD = "your-local-only-password"
npm run demo:seed-local
```

That deletes and recreates domain rows for this demo user only.

To drop the auth user itself, use local Studio → Authentication (loopback
only). Do not run that against hosted.

## Login (no password in this file)

1. App must be talking to local loopback (see Environment).
2. `/login` with `golden-journey.demo@local.test` and the password from your
   password manager / seed stdout.
3. Should land on `/dashboard` with onboarding already complete.

## Golden Journey to click

Login → `/dashboard` → `/dashboard/workouts` → `/dashboard/recovery` →
`/dashboard/ai-coach` (Dante) → `/dashboard/nutrition` → `/dashboard/progress`
→ `/settings` → sign out → `/login` again.

### Recommended Dante question (not a scripted reply)

“Based on my recovery and recent training, what should I do today?”

**Context Dante should already have from app state (not from hidden prompt
text):**

- Today’s planned session: Upper Strength, not started
- Yesterday: completed Lower Strength
- Today’s recovery score ~60 (sleep ~6.2h, fatigue 6, soreness 6) vs earlier
  ~83
- Nutrition: protein target from profile; today only breakfast + lunch logged
- Profile: intermediate, 4-day strength, muscle-gain / lean-bulk

Do not expect a fixed sentence. The demo is that the answer refers to that
state.

Optional labeled wearable overlay (separate): `/admin/ai-evaluation` → Demo
Data Control. Keep the `isDemo` badge.

## Verify the seed without the UI

The seed prints a JSON summary (`onboardingCompleted`, session counts,
`todayRecoveryScore`, `foodLogs`). You can also inspect local Postgres
(Docker `supabase_db_muscle-fitness-nof1-local`) for that `user_id` only.

## What not to do

- Do not put the password in this repo, README, or Vercel env “for ease”.
- Do not run `npm run demo:seed-local` against hosted (the guard will throw).
- Do not disable `requireCompletedOnboarding` or the session proxy.
- Do not present wearable demo series as a real device.
- Do not invent dashboard metrics; empty states stay honest where the product
  has no history table (bodyweight trend).
