# Nutrition Data Sources

This document records the research behind the open-data food
architecture in `lib/nutrition/food-data/`, `lib/nutrition/plan.ts`
and `lib/nutrition/shopping-list.ts`. It is written from each
source's own official documentation, not third-party blog posts.

## 1. Sources researched

- **USDA FoodData Central** — official API guide,
  <https://fdc.nal.usda.gov/api-guide> (confirmed base URL, auth,
  rate limits, data types, licensing).
- **Open Food Facts** — official API documentation,
  <https://openfoodfacts.github.io/openfoodfacts-server/api/>
  (confirmed current API version, auth, rate limits, licensing).
- Additional open government/scientific datasets were considered
  (e.g. national food composition databases from other countries)
  but were **not** added: USDA + Open Food Facts already cover raw
  and packaged foods respectively with clear, reusable licenses, and
  adding a third source would increase maintenance burden without a
  clear gap being filled.

## 2 & 3. Sources selected, and why

| Source | Used for | Why |
|---|---|---|
| USDA FoodData Central | Raw meat, poultry, fish, eggs, grains, fruit, vegetables, dairy, oils, minimally processed foods | Government-maintained, laboratory-analyzed (Foundation Foods, SR Legacy), public domain, free, high per-request rate limit with a registered key |
| Open Food Facts | Packaged/branded foods, barcode products, protein powder, packaged yogurt, cereal, packaged bread, sauces, snacks | Purpose-built, crowd-sourced database of exactly this category, with barcode lookup, no auth required for reads |
| Local fallback (`lib/nutrition/food-data/local-fallback.ts`) | Resilience only | Keeps the Nutrition page and meal-plan engine working even with no network access or no API key configured |

## 4. License of each source

- **USDA FoodData Central**: public domain, CC0 1.0 Universal. USDA
  requests (but does not legally require) attribution:
  "U.S. Department of Agriculture, Agricultural Research Service.
  FoodData Central, fdc.nal.usda.gov."
- **Open Food Facts**: database contents under the **Open Database
  License (ODbL)**; individual data contents under the **Database
  Contents License**. Product images use CC-BY-SA 3.0 (this project
  does not use or store OFF images at all, avoiding that licensing
  surface entirely).
- **Local fallback**: hand-entered, order-of-magnitude reference
  values maintained by this project; not redistributed from any
  external database.

## 5. Attribution requirement

Surfaced directly in the product UI on `/dashboard/nutrition` under
"Nutrition Data Sources," and in this document. No source is
misrepresented as more precise or more authoritative than it is.

## 6. API authentication

- **USDA**: `api_key` query parameter on every request. Key comes
  from `process.env.USDA_FDC_API_KEY` (server-only — see
  `lib/nutrition/food-data/usda.ts`). A `DEMO_KEY` works but is
  heavily rate-limited; this project expects a real registered key
  for production use.
- **Open Food Facts**: no authentication for reads. A descriptive
  `User-Agent` header (`process.env.OPENFOODFACTS_USER_AGENT`,
  already used by the existing Dante integration in
  `app/api/chatbot/route.ts` and reused here rather than introducing
  a second variable) is sent on every request instead.

## 7. Rate limits

- **USDA**: 1,000 requests/hour per IP with a registered key
  (`DEMO_KEY`: 30/hour, 50/day). Exceeding the limit returns HTTP 429
  with a temporary block.
- **Open Food Facts**: roughly 10 requests/minute for search, 15/min
  for product reads, per IP, per their official docs. This project
  never calls either API from a keystroke handler — only from an
  explicit search action or the API routes below — and caches
  results (see "Caching strategy").

## 8. Raw-vs-packaged source priority

Implemented in `lib/nutrition/food-data/index.ts`:

**Raw / basic foods**
1. USDA Foundation Foods / SR Legacy (`lib/nutrition/food-data/usda.ts`, `preferRawFoodTypes: true`)
2. Local curated fallback

**Packaged / branded foods**
1. Open Food Facts (`lib/nutrition/food-data/open-food-facts.ts`)
2. Local curated fallback

A small heuristic (`looksPackaged()` in `index.ts`) decides which
source to try first for an unqualified query (e.g. "whey protein"
tries Open Food Facts first; "chicken breast" tries USDA first), but
both are always attempted before falling back to local data — a
"packaged" query that finds nothing on Open Food Facts still tries
USDA, and vice versa.

USDA search ranking (`scoreCandidate()` in `usda.ts`) prefers
Foundation/SR Legacy data types, boosts raw/cooked keyword matches
that align with the query, and penalizes prepared-dish and branded
noise (e.g. "sandwich," "dinner," "flavored") so "chicken breast"
does not return a fried chicken sandwich.

## 9. Caching strategy

- **USDA**: raw/basic foods change essentially never, so requests
  use Next.js's `fetch` cache with a 30-day `revalidate` window
  (`RAW_FOOD_REVALIDATE_SECONDS` in `usda.ts`).
- **Open Food Facts**: an in-process 10-minute cache
  (`CACHE_TTL_MS` in `open-food-facts.ts`) covers both search and
  barcode lookups, since branded product data can change (and to
  respect the tighter rate limit).
- **Meal-plan generation itself never depends on a live API call.**
  The plan engine (`lib/nutrition/plan.ts`) uses its own small,
  local, deterministic food-template table so `/dashboard/nutrition`
  and the shopping list render instantly and identically whether or
  not USDA/Open Food Facts are reachable. The USDA/Open Food Facts
  adapters power the separate `/api/nutrition/foods/search` and
  `/api/nutrition/foods/barcode` routes for future food lookup/swap
  UI, not the core plan calculation.
- No Supabase cache table was added — an in-process/`fetch` cache is
  sufficient for the current call volume and keeps this change
  minimal; a `food_data_cache` table can be introduced later without
  changing the adapter interfaces if usage grows.

## 10. Fallback strategy

If `USDA_FDC_API_KEY` is not set, `isUsdaConfigured()` returns
`false` and `searchFood()` in `usda.ts` returns an empty array
immediately (no request attempted). If Open Food Facts is
unreachable or rate-limited, its adapter catches the error and also
returns an empty array. In both cases,
`lib/nutrition/food-data/index.ts` falls back to
`searchLocalFallback()` and reports `usedFallback: true` plus a
plain-language `warning` — the Nutrition page and shopping list never
crash or block on an external API.
