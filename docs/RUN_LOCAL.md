# Muscle Fitness — Run & Test Locally

## Quick start

```bash
cd "C:\Users\DUY ANH\OneDrive\Desktop\muscle-fitness"
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

Optional / AI Coach:

```env
# Default provider is OpenRouter (free models) — avoids OpenAI billing 429s.
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-YOUR_KEY
OPENAI_MODEL=openrouter/free

# Optional: paid OpenAI instead
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4.1-mini

GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

Get a free OpenRouter key: [https://openrouter.ai/keys](https://openrouter.ai/keys)  
Then restart `npm run dev`. Dev health check: [http://localhost:3000/api/ai-coach/health](http://localhost:3000/api/ai-coach/health)

## Validation commands

```bash
npm run type-check
npm run lint
npm run build
```

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
11. **Coach chat** — `/ai-coach` (legacy `/chatbot` redirects here)
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
