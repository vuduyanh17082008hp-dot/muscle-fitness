# Muscle Fitness

An evidence-aware AI fitness coaching platform that turns a client's real
profile, goals, training data, nutrition preferences and recovery
information into personalized, actionable coaching — through Dante, the
AI coaching intelligence built into the product.

## The Problem

Fitness advice is everywhere. Personalized guidance isn't. Most people
struggle with generic workout programs that ignore their recovery and
schedule, contradictory nutrition advice, supplement misinformation,
programs that never adjust, expensive one-on-one coaching most people
can't access, and training/nutrition/progress data scattered across
disconnected apps.

## The Solution

One profile. One system. One coach. Muscle Fitness connects **training**,
**nutrition** and **recovery** instead of treating them as isolated tools,
and **Dante** is the layer that reads all three and turns them into a
single, personalized plan.

## Why AI?

Deterministic logic alone can compute a calorie target or a linear
progression scheme, but it can't hold a conversation about *why* a
client's plateau happened, weigh five different signals (recent adherence,
logged recovery, stated goal, food preferences, and verified food data) at
once, or explain trade-offs in plain language. That synthesis — combining
changing client context with external evidence and producing a specific,
justified recommendation — is what an LLM-based coach is good at, and
what a static rules engine isn't.

## Core Features

- Auth (email/password + Google OAuth) with onboarding-aware routing
- Multi-step onboarding capturing goals, experience, schedule, equipment,
  food preferences and limitations
- Dashboard tying training, nutrition, progress and Dante together
- Adaptive + fully custom workout builder (splits, muscle priorities,
  RIR, exercise substitution)
- Nutrition targets, meal logging and a food database
- Progress tracking (body-weight, workout history, adherence)
- Dante AI coach with conversation history and per-user settings

## Dante AI

Dante is Muscle Fitness's AI coaching feature. It reads the authenticated
client's own profile, workout, nutrition and progress data through a set
of server-side tools, and can call **USDA FoodData Central** live to cite
verified food composition instead of guessing. Write actions (reminders,
support tickets) require an explicit typed confirmation phrase before they
execute. Full technical and safety detail: [`docs/RESPONSIBLE_AI.md`](docs/RESPONSIBLE_AI.md)
and [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md).

## Workout Intelligence

Recommended and fully custom multi-day splits, muscle-priority
programming, per-set RIR, and exercise substitution when a prescribed
movement doesn't work for a client — backed by an exercise library
(Supabase table + API, with a local fallback).

## Nutrition Intelligence

Calorie and macro targets derived from the client's profile, meal
recommendations, food logging, and a food database that can fall back to
live USDA FoodData Central lookups through Dante.

## Recovery

Recovery and readiness signals (from logged training, body-weight and
`daily_metrics`) feed into Dante's guidance, so recommendations account
for recent training load, not just the stated goal.

## Architecture

```
CLIENT PROFILE
      │
      ├─────────────────────────────┐
      │                             │
      ▼                             ▼
  TRAINING                      NUTRITION
      │                             │
 workout plans, logs         calorie/macro targets
 RIR, substitutions          meal recommendations
      │                             │
      └─────────────┬───────────────┘
                     ▼
                 RECOVERY
                     │
           sleep, readiness, logs
                     │
                     ▼
                  DANTE
              (AI reasoning layer)
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
    Training     Nutrition    Recovery
    changes      guidance     insights
```

Evidence source live today: **USDA FoodData Central**. Other sources
(PubMed, wger, Open Food Facts, PubChem, openFDA) are roadmap targets, not
live integrations — see [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md)
for exactly what is and isn't wired in.

## AI / Data Sources

See [`docs/AI_DISCLOSURE.md`](docs/AI_DISCLOSURE.md) for the complete,
current list of AI providers and external data sources — including which
are live at runtime versus roadmap/dev-only.

## Responsible AI

Dante provides educational fitness and wellness guidance. It does not
diagnose disease, replace medical professionals, or fabricate evidence.
Full detail: [`docs/RESPONSIBLE_AI.md`](docs/RESPONSIBLE_AI.md).

## Surprise Features

Implemented, demoable standout features (not a wishlist):
[`docs/SURPRISE_FEATURES.md`](docs/SURPRISE_FEATURES.md).

## Technology Stack

- **Framework:** Next.js (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS v4
- **Database / Auth:** Supabase (PostgreSQL, row-level security)
- **AI:** OpenAI-compatible API via OpenRouter / OpenAI / self-hosted
  (`lib/ai-coach/provider.ts`)
- **External evidence:** USDA FoodData Central
- **Animation:** Framer Motion
- **Deployment target:** Vercel

## Local Setup

```bash
git clone <this-repository-url>
cd muscle-fitness
npm install
cp .env.example .env.local
# fill in .env.local with your own Supabase + AI provider values
```

## Environment Variables

Variable **names** only — never commit real values. See `.env.example`
for the full list and `docs/ACCESS_INSTRUCTIONS.md` for setup detail.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `AI_PROVIDER`
- `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`
- `OPENAI_API_KEY` / `OPENAI_MODEL`
- `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`
- `USDA_FDC_API_KEY` (optional — enables live nutrition evidence lookups)

## Run Development

```bash
npm install
npm run dev
```

App runs at `http://localhost:3000`. Public marketing pages render even
without Supabase configured in development (with a console warning);
authenticated features require it.

## Validation

```bash
npm run type-check
npx eslint . --quiet
npm run build
```

## Deployment

1. Import the repository into Vercel.
2. Configure the environment variables listed above in the Vercel project
   settings.
3. Deploy — Vercel runs `npm run build` automatically.

Full detail: [`docs/ACCESS_INSTRUCTIONS.md`](docs/ACCESS_INSTRUCTIONS.md).

## Demo Flow

See [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for a full 3–5 minute
walkthrough, including fallback steps if an external API is unavailable
during a live demo.

## Limitations

- The AI provider (OpenRouter/OpenAI/self-hosted) and the exact model are
  environment-level configuration, not fixed in code — see
  `docs/AI_DISCLOSURE.md`.
- Only USDA FoodData Central is live as an external evidence source today;
  PubMed, wger, Open Food Facts, PubChem and openFDA are roadmap items.
- Dante is educational guidance, not medical advice, and does not diagnose
  conditions.
- The local food database is a small, curated list, not exhaustive.

## Future Development

- Wire in additional evidence sources (PubMed for training/nutrition
  research, wger for exercise data, Open Food Facts for broader food
  coverage)
- Deeper recovery/check-in tooling for Dante (dedicated check-in data
  tool, not just derived readiness scores)
- Expand exercise substitution logic with injury-aware constraints

## AI Fair Submission Notes

This repository was refined for AI Fair submission: the previous
founder-autobiography homepage/story experience was replaced with a short,
original inspirational story (`components/home/inspiration-story.tsx`,
`/story`) and a homepage rebuilt around problem → solution → how Dante
works → AI features → responsible AI → CTA, so the product's AI value is
visible without reading source code. See `/ai-fair` in the running app for
a condensed, judge-facing summary, and `docs/PRESENTATION_OUTLINE.md` for
slide-by-slide presentation support.
