# AI, Model & Tooling Disclosure

This page lists every AI model, API, and external data source that is
**actually wired into the codebase**, plus the tools used during
development. Nothing below is aspirational — anything we haven't built yet
is explicitly called out as a roadmap item, not a live integration, per our
own rule: don't claim an API is used if it isn't.

## Runtime AI providers (`lib/ai-coach/provider.ts`, `lib/ai-coach/server.ts`)

Dante's chat is implemented against the OpenAI-compatible Chat
Completions / Responses API surface via the official `openai` npm SDK
(`^7.4.0`). The actual provider is chosen at deploy/runtime via
`AI_PROVIDER`:

| Provider | Env var(s) | Purpose | Runtime or dev-only | License / attribution |
|---|---|---|---|---|
| **OpenRouter** (default) | `AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | Default LLM routing layer for Dante's chat + summaries | Runtime | OpenRouter is a commercial API gateway; the underlying model's license depends on which model is configured — **requires verification per deployment**, since `OPENROUTER_MODEL` is an environment setting, not a fixed value in code. |
| **OpenAI** (explicit opt-in) | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` | Alternate LLM provider for Dante's chat + summaries | Runtime | Commercial API, OpenAI usage policies apply. |
| **Self-hosted OpenAI-compatible server** (explicit opt-in) | `AI_PROVIDER=self_hosted`, `AI_BASE_URL`, `AI_MODEL` | Run Dante against a self-hosted model (e.g. vLLM/Ollama) for local development or fully self-hosted deployments | Runtime (dev-oriented) | Depends entirely on the operator-supplied model — **requires verification per deployment**. |

We do not claim Dante runs on a specific named foundation model in product
marketing copy, because the model is an environment-level configuration
choice (see `docs/RESPONSIBLE_AI.md` §2), not a fixed fact we can safely
print on the homepage.

## External evidence / data sources

| Source | Purpose | Data used | Runtime or dev-only | License / attribution |
|---|---|---|---|---|
| **USDA FoodData Central** (`lib/evidence/usda-food-data.ts`) | Live macro-nutrient lookup (`search_food_evidence` tool) so Dante can cite verified food composition instead of guessing | Sends only a food-name search string; receives calories/protein/carbs/fat per 100 g | **Runtime** (requires `USDA_FDC_API_KEY`; gracefully falls back to the local food database when unset) | U.S. government public-domain dataset; API terms at fdc.nal.usda.gov. Attribution: "Powered by USDA FoodData Central." |
| Local food database (`lib/nutrition/food.ts`) | Baseline food macro data used when the live API is unavailable or not configured | Static, hand-curated list | Runtime | Values sourced from USDA reference ranges; not a live feed — **treat as approximate**. |

### Roadmap (not yet integrated — do not treat as live)

The following sources are named in product messaging as *future* evidence
sources because they fit Dante's "evidence-aware" direction, but **no code
in this repository currently calls them**:

- PubMed / NCBI — biomedical literature search
- wger — open exercise database
- Open Food Facts — crowd-sourced food database
- PubChem — chemical/compound data (e.g. supplement ingredient lookups)
- openFDA — FDA adverse-event and label data

If/when any of these are wired in, this table (and the homepage copy) must
be updated in the same change.

## Development-time tooling

These tools were used to build the product but do not run in production
and never see end-user data at runtime:

| Tool | Purpose | Runtime or dev-only |
|---|---|---|
| **Cursor** (Cloud Agent) | AI-assisted software engineering: code generation, refactoring, and this AI Fair submission pass | Dev-only |

## Core platform / infrastructure

| Service | Purpose | Runtime or dev-only |
|---|---|---|
| **Supabase** | Postgres database, authentication, row-level security, session management | Runtime |
| **Vercel** | Hosting/deployment target for the Next.js app | Runtime (deployment) |

## Keeping this document honest

Whenever a new AI model, API, or data source is wired into the codebase (or
removed), update this file in the same pull request. If you are not sure
whether something counts as "live," check whether server-side code in
`lib/` or `app/api/` actually makes a network call to it — if it doesn't,
it belongs in the roadmap section, not the live table.
