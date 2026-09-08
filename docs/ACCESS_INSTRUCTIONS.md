# Access & Running Instructions

## Production URL

`https://<your-vercel-deployment>.vercel.app` — replace with the actual
deployment URL once the project is deployed on Vercel. (Placeholder: no
production URL is committed to this repository.)

## Demo account

If a shared demo account is provided for judging, its credentials will be
distributed separately (for example via the AI Fair submission form or
presentation notes) — **never commit account passwords to this
repository.** If no shared account is provided, create a new account
through `/signup` and complete onboarding to see personalized data flow
through Dante.

## Run locally

### Prerequisites

- Node.js 20+
- A Supabase project (free tier is enough for local development)

### Setup

```bash
git clone <this-repository-url>
cd muscle-fitness
npm install
cp .env.example .env.local
```

Fill in `.env.local` with your own values (see Environment Variables
below), then:

```bash
npm run dev
```

The app runs at `http://localhost:3000`.

> Without `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
> configured, public marketing pages (homepage, `/story`, `/coach`,
> `/ai-fair`) still render in development, but authentication and
> anything behind it will not work.

## Environment variables (names only — never commit real values)

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (for auth/data) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes (for auth/data) | Supabase public/anon key |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical site URL for redirects |
| `AI_PROVIDER` | Yes (for Dante) | `openrouter` (default), `openai`, or `self_hosted` |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | If using OpenRouter | Dante's LLM provider credentials |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | If using OpenAI | Dante's LLM provider credentials |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | If self-hosted | Self-hosted OpenAI-compatible endpoint |
| `USDA_FDC_API_KEY` | Optional | Enables Dante's live USDA FoodData Central lookups (free key at fdc.nal.usda.gov) |

See `.env.example` for the full, current list and `docs/AI_PROVIDER_SETUP.md`
for provider-specific setup details.

## Supabase setup

1. Create a Supabase project.
2. Apply the SQL migrations in `supabase/migrations/` (via the Supabase
   CLI or SQL editor) to create the required tables and row-level security
   policies.
3. Copy the project URL and anon/publishable key into `.env.local`.

## Deploy on Vercel

1. Import this repository into Vercel.
2. Add the environment variables listed above in the Vercel project
   settings (never commit them to the repo).
3. Deploy. Vercel will run `npm run build` automatically.
4. After deploying, update the "Production URL" section above with the
   real URL.

## Validation before submitting/demoing

```bash
npm run type-check
npx eslint . --quiet
npm run build
```

All three should pass with no errors before a demo or submission.
