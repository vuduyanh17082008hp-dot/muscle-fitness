# AI-R1F — Shared Query Understanding + Smart Retrieval

One deterministic layer in front of both coaches, so they understand real user language (typos, slang,
Vietnamese/mixed, follow-ups) before deciding how to answer. It sits **beside** the existing planners and safety
layers; it replaces none of them.

```
USER MESSAGE
 → parseUserQuery()            lib/intelligence/query-understanding/
 → UserQueryFrame              (internal; never returned to the client)
 → decideRetrieval()           route + reasoning effort
 → resolveFoodEntity()         lib/intelligence/food-resolution/   (local canonical → USDA)
 → Dante prompt block / Gemma tool run  → verified response
```

## Ownership (unchanged)

| | Owns | May read | Must not |
|---|---|---|---|
| **Dante** | training, recovery, performance, load/volume/intensity, readiness | nutrition **facts** through the shared resolver | build a meal plan or become the nutrition authority |
| **Gemma** | foods, macros, meals, cravings, calorie/macro allocation | training **context** (heavy leg day, low recovery) | change a calorie target silently or prescribe training |
| **Shared** | query understanding, entities, references, units, uncertainty, provenance | | |

Cross-coach *handoff* (R1E.3) is **not** implemented. `frame.deferToGemma` is a flag; Dante's prompt block tells the
model that meal construction belongs to Gemma, nothing more.

## UserQueryFrame (`query-understanding/types.ts`)

`rawText`, `language` (EN/VI/MIXED), `normalizedText`, `primaryDomain`/`secondaryDomains`, `owner`, `intent`,
`entities`, `references`, `constraints`, `informationNeed`, `crossCoachRelevance`, `ambiguity`, `confidenceClass`,
plus three internal extras: `deferToGemma`, `safetySignal` (flag only — `lib/dante-core/safety-layer.ts` still owns
safety), and `followUpOf` (the earlier user message a topic-less follow-up continues).

### Intent system
- **Gemma:** FOOD_FACT, FOOD_MACRO_LOOKUP, MEAL_IDEA, MACRO_CALCULATION, MEAL_ADJUSTMENT, FOOD_COMPARISON, CRAVING,
  RESTAURANT_QUERY, FOLLOWUP_QUANTITY, DAILY_REMAINING, NUTRITION_EXPLANATION, PLAN_CHANGE, SIMULATION, MUTATION_REQUEST.
- **Dante:** TRAINING_FACT, PERFORMANCE_EXPLANATION, CURRENT_STATE, TRAINING_RECOMMENDATION, TRAINING_PLAN_CHANGE,
  TRAINING_SIMULATION, CROSS_DOMAIN_DECISION, FATIGUE_REPORT, SAFETY_SYMPTOM.
- **Neutral:** BARE_MENTION ("cod"), CASUAL ("im dead lol"), SOCIAL_INSULT, UNKNOWN — these retrieve nothing.

### Language and normalization
Diacritics are **preserved**. `foldDiacritics` is never used to classify (it turned *ngủ* "sleep" into *ngu* "stupid" and
caused a real social-router misroute). Typos (`protien`, `calory`, `recoverry`, `excersise`, `carbss`) and slang (`tn`,
`ko`, `vl`) are corrected per word; `rawText` is kept. Regexes use Unicode lookarounds, so `ngu` never matches inside `ngủ`.
All vocabulary lives in `lexicon.ts` — add aliases there, not as ad-hoc regexes in a coach.

### Reference resolution (`references.ts`)
Priority: current turn → active task/draft → immediately previous turn (≤2 turns) → recent history (**bounded to 6
turns**, never arbitrary stale entities) → Athlete State → UNKNOWN (reported in `references.unresolvedReferences`).
- "give me the macros" → food from history; "what about 200g?" → same food + 200 g; "same but Atlantic cod?" keeps the
  earlier quantity; "same but raw?" adds preparation.
- Dante follow-ups ("why?", "what should I change?", "what if I train tomorrow?") inherit the topic (and exercise) of the
  nearest earlier user turn that has one.

### Constraints
Calorie ceiling vs **intake** ("under 500 calories" ≠ "I ate 800 calories"), macro targets (`40g protein` is not a food
weight), keep/reduce/increase ("same protein but 300 fewer calories", "reduce fatigue but keep intensity"), time refs,
meal, workout.

### Retrieval + reasoning effort (`retrieval.ts`)
Route: NO_RETRIEVAL · LOCAL_RETRIEVAL · USDA_RETRIEVAL · TRAINING_KNOWLEDGE_RETRIEVAL · ATHLETE_STATE · MULTI_SOURCE.
Effort: MINIMAL (a fact lookup) · MEDIUM (multi-constraint recommendation) · DEEP (causal performance analysis,
cross-domain tradeoff). "protein in 100g cod" is never DEEP; "why has my squat been declining despite sleeping more?" is
never MINIMAL.

### Cross-domain relevance
IRRELEVANT / OPTIONAL / MATERIAL / CRITICAL. "I only ate 800 calories, should I deadlift heavy?" → TRAINING primary,
NUTRITION secondary, MATERIAL (CRITICAL when intake ≤300 kcal or nothing eaten *and* a heavy/max effort).

## Food resolution (`food-resolution/`)

`resolveFoodEntity()` is pure with injected deps; `server.ts` wires the curated local table
(`lib/nutrition/coach/ingredients.ts`) and the existing USDA adapter (`lib/nutrition/food-data/usda.ts`).

Source hierarchy with **specificity**: generic query ("cod") → LOCAL_CANONICAL; a more specific one ("Atlantic cod",
"raw cod" when the local entry is cooked) → the matching USDA FoodData Central record; USDA unavailable → local, with
`ESTIMATED` when the basis differs from what was asked; neither → UNRESOLVED (never an invented number). USDA is a
deterministic data source, not an AI provider, server-side only, key never in a prompt or log.

Ranking (not "first result"): all core tokens required, variety tokens boost, requested raw/cooked boosts/penalizes,
dish/branded noise penalized, shorter canonical names preferred, ties broken deterministically (USDA's own ordering varies
between calls). With no preparation stated, USDA candidates follow the basis of the local generic entry so "cod" and
"Atlantic cod" don't silently flip raw↔cooked.

Ambiguity: asked **only** when no local entry exists, a weight is being scaled, and the raw/cooked candidates differ by
>20 % in calories ("Is the weight raw or cooked?"). A per-100 g answer needs no question.

Units (`units.ts`): g/kg/oz/lb convert deterministically; cup/slice/piece/fillet/serving need a verified serving weight and
are otherwise reported as `needs_serving_weight`; ml has no density mapping. Missing nutrients stay `null`.

## Where it is wired

- **Gemma** (`lib/nutrition/coach/chat.ts`, `orchestration/{orchestrate,shared-query,tools,respond}.ts`):
  1. An information request about a food ("give me the macro", "what about 200g?") is no longer read as a meal-build or a
     new craving topic by the keyword layers; it goes to orchestration.
  2. The planner's output is reconciled with the frame when the planner recognises a lookup but lists no foods (observed
     live), and the frame stands in for the planner when it is unavailable.
  3. Each food is verified once through the shared resolver before the synchronous tool run; numbers are scaled
     deterministically; the composer may only format them.
  4. If the composer is down or its reply is rejected (ungrounded number), a deterministic EN/VI reply is built from the
     verified numbers — never an ungrounded chat answer. Not used for fit/remaining/draft questions.
- **Dante** (`app/api/chatbot/route.ts` → `query-understanding/dante-context.ts`): one compact "QUERY UNDERSTANDING"
  block placed right before the client question: domain/intent/effort, resolved references, `follow_up_of`, self-reported
  intake (flagged unverified), cross-domain note, verified food facts with arithmetic already done, and the Gemma boundary.
  Fail-open: any error removes the block, never the turn. Safety, casual and bare turns add no block.

## Failure degradation
USDA down → local · local down → USDA · both down → UNRESOLVED (honest "couldn't verify") · resolver throws → legacy local
lookup · planner down → frame lookup (stage 2) · composer down/rejected → deterministic lookup reply · frame throws → the
pre-existing paths run unchanged.

## Observability
`buildQueryDiagnostics` + `recordQueryDiagnostics` (`QUERY_FRAME_BUILT`, `DOMAIN_CLASSIFIED`, `ENTITY_RESOLVED`,
`REFERENCE_RESOLVED`, `RETRIEVAL_ROUTE_SELECTED`, `AMBIGUITY_DETECTED`, `CROSS_DOMAIN_RELEVANCE`; the resolver adds
`LOCAL_LOOKUP` / `USDA_LOOKUP`): enums, counts, latency only. In-memory; `QUERY_UNDERSTANDING_TELEMETRY=1` prints in
non-production. No message text, Athlete State, keys or reasoning.

## USDA adapter fix (found live)
`fetch(..., { next: { revalidate } })` hung under `next dev` until the 6 s timeout aborted it
(`[USDA] search error: AbortError`), silently turning every external lookup into a local-fallback miss. The adapter now uses
`cache: "no-store"` plus a bounded in-process 30-day cache (same pattern as `open-food-facts.ts`); only non-empty results are
cached. Separately, api.nal.usda.gov latency is highly variable (0.7–14 s measured); the 6 s timeout stays, so a slow
upstream yields the honest "couldn't verify" reply for a food that is not in the local table.

## Known limitations
- Rule/lexicon based: ~28 foods, 8 lifts, 5 muscle groups, EN/VI only. Unknown foods fall to the planner + USDA search by the
  planner's own words; unknown slang is not understood.
- Vietnamese accentless text is only partly supported (`ngu te qua` is handled via sleep-context words; most other
  accentless input is not classified).
- Count units (fillet, slice, cup) have no serving-weight table; ml has no density table.
- Generic "salmon" resolves to a tie-broken Atlantic/farmed record; wild vs farmed differs ~40 % in kcal and the reply names
  the record it used.
- The USDA cache is per server instance (not shared across serverless instances).
- Dante's block is advisory: the LLM can still ignore it (the live "why?" case needed the block placed next to the question).
- Handoff between coaches (R1E.3) is not built.

## Tests
`lib/intelligence/query-understanding/__tests__/{frame,dante-context,live-http}.test.ts`,
`lib/intelligence/food-resolution/__tests__/{resolver,usda-live}.test.ts`,
`lib/nutrition/coach/orchestration/__tests__/shared-query.test.ts`, `lib/nutrition/food-data/__tests__/usda.test.ts`.
Live gates are skipped unless env is set:
`MF_LIVE_USDA=1 USDA_FDC_API_KEY=… npx vitest run …/usda-live.test.ts` and
`MF_LIVE_BASE=http://localhost:3010 npx vitest run lib/intelligence/query-understanding/__tests__/live-http.test.ts --no-file-parallelism`
(second dev server on the local Docker Supabase; see `docs/ai/AI-R1-ARCHITECTURE.md`).
