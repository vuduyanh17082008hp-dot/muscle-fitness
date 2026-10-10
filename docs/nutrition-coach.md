# Nutrition Coach V1

Macro-constrained meal & craving optimizer embedded in `/dashboard/nutrition`
(`components/nutrition/coach/`). A specialist next to Dante, not a second AI
platform: same auth, same shared rate limiter, same OpenAI provider, same
pending-action confirmation, same food-log service.

## Architecture

```
UI (nutrition-coach-panel, meal-draft-card)
  ├─ POST /api/nutrition/coach        deterministic: context | build | suggest | choose | craving | edit   (no LLM, no writes)
  ├─ POST /api/nutrition/coach/log    PROPOSES a log -> pending action (nothing written)
  ├─ POST /api/dante/tools/confirm    existing route: user confirms -> log_meal_draft tool -> createFoodLog
  └─ POST /api/chatbot {coachMode:"nutrition"}   chat; omitted/"dante" = untouched Dante pipeline
lib/nutrition/coach/   pure engine (ingredients, macros, optimizer, gaps, draft, craving, fingerprint, intent, service)
                       + context.ts / chat.ts (server)
```

* **Context** comes from the same loaders as Athlete State's `nutrition` section and
  Dante's `get_nutrition_state` (`loadNutritionContext` + `loadFoodLogForDate` +
  `compareToTargets`). No nutrition-specific profile/memory table. Allergies,
  exclusions and preferences are always re-read server-side, never trusted from the client.
* **The model never computes a number.** Totals are recomputed from `ingredientId + grams`
  against `ingredients.ts` on every request (drafts round-trip as ids + grams; totals,
  confidence, suggestions, craving claims are rebuilt server-side). The LLM only converses over
  structured context in `chat` intents; safety/training intents are routed deterministically first.
* **Optimizer** — template candidates (savory bowl, yogurt bowl) or subsets of the user's selected foods,
  scaled with `AUTO` scaling, ranked by tier (hard > medium > soft violations) then a weighted score
  (`BALANCED` implemented; `LEANEST`/`BUDGET` are weight sets only). Relaxation: allergies/exclusions never;
  strict calorie ceiling (user-declared) is hard; protein medium; budget/time soft. Each relaxed constraint is
  stated exactly (`Closest match costs approximately S$2.21 rather than S$2.00.`).
* **Draft lifecycle** — `DRAFT | STALE_CONTEXT | READY | CONFIRMED | LOGGED`. `sessionContextSnapshot`
  records what the meal was optimized against; stale if local date/goal/targets change or remaining
  calories ≥75 kcal / protein ≥10 g differ. Undo/redo/restore live in `draft.history` (session-level only).
* **Logging** — one meal = one `food_logs` row (`source: "local"`, `source_id: mfmeal:<fingerprint>`).
  Idempotency key = the confirmed `dante_tool_actions.id`. The fingerprint is **similarity only**
  ("You logged a similar meal earlier today. Log again?"); it never blocks a deliberate second log.
  Similarity lookup is scoped to the local source, and current allergy/exclusion guards are checked
  both when proposing and when confirming the log.
* `log_meal_draft` is in `SPECIALIST_COACH_TOOLS`, **not** `DANTE_TOOLS`: Dante's model cannot select it
  (`orchestrate.ts` checks membership), but the shared confirm path can still execute it.

## Known limits (V1)

* 40-ingredient table; values hand-curated from USDA reference data, with an explicit raw/cooked/as-served
  basis and provenance on every item; `ESTIMATED` where brand/cut varies. Prices are rough SGD estimates.
  Unknown foods are left out, never guessed.
* Craving "original" values are ranges labelled `ESTIMATED`; claims are range-based by design
  (`claims.ts`), never ratios/percentages.
* "Make this N calories" lands within ±25 kcal (5 g portion rounding).
* The deterministic coach routes (`/api/nutrition/coach*`) are not rate-limited; only the chat entry
  point shares Dante's limiter (they make no LLM calls). Deterministic request bodies are capped at 64 KiB.
* No hosted Supabase changes, no migrations.

## N1.5.6 — Conversational continuity & safe follow-up resolution

Short follow-ups ("detailed ingredients", "macros?", "cheaper không?", "second one", "no, I meant the
chicken bowl") are resolved against **structured** state, not against assistant prose.

```
message → safety/training gate → normalize (EN/VI) → proposal yes/no → explicit new topic
        → clarification answer → fast follow-up classifier → reference resolver
        → read-only | explain | visible proposal | clarify → state update
```

* `lib/nutrition/coach/followup.ts` — pure types, zod wire schemas, normalization, classifier, reference
  priority (`explicit > clarification > last assistant referent > current topic > active draft (ask)`),
  TTL (8 turns / 20 min idle), state transitions. `followup-actions.ts` — execution (read-only,
  proposals, safety pre-gate, option selection, correction, undo). `followup-telemetry.ts` — enum-only
  counters. `chat.ts` wires them in and owns the single bounded model fallback
  (`resolveFollowUpWithModel`: strict JSON, candidate by *index*, intent from a closed enum; it never
  sees numbers, cannot call tools, mutate, log or name an id — malformed output is rejected).
* State (`conversation.followUp`) is **ephemeral and client-echoed**, so it is treated as untrusted: only
  ids + grams are accepted, every number is recomputed by `totalsFor`, proposal ops are re-validated by
  `opSchema`, re-checked against allergies/exclusions on accept, and rejected when the meal changed or
  the proposal expired. No migration, nothing persisted.
* A modification follow-up never mutates: it returns `modificationProposal` (+ `MODIFICATION_PROPOSAL`
  block) and stores a pending proposal; "yes" applies it through the existing `applyDraftOp` (in place
  for the Active Draft, as a successor draft otherwise), "no" drops it. Explicit commands the legacy
  parser already owned ("make this bowl under 400 calories") are untouched — the fast path steps aside.
* The old "Tell me what you want…" is gone as a normal reply; `lastResortReply` (greeting / meal in view
  / remaining macros) is used only when no model reply exists, and is counted as `genericFallbacks`.
* Structured blocks (`INGREDIENT_LIST`, `MACRO_SUMMARY`, `OPTION_LIST`, `MEAL_COMPARISON`,
  `MODIFICATION_PROPOSAL`, `CLARIFICATION`) are rendered compactly by `NutritionBlocks`; the UI never
  parses prose to rebuild state.

Known limits: the fast path is a deliberately small vocabulary (new phrasings reach the model fallback,
or the ordinary conversation path when no model is configured); `ADJUST_QUANTITY` needs a multiplier
(a bare "more rice" = ×1.25); the Vietnamese layer is a short phrase map, not a translator; follow-up
state does not survive a page refresh by design (the coach asks instead of pretending to remember).

Tests: `app/api/chatbot/__tests__/nutrition-followup.test.ts` (route level, incl. the exact observed
"detailed ingredients" bug), `lib/nutrition/coach/__tests__/followup.test.ts`, `blocks-render.test.ts`.
Retrieval evaluation and tuning (N1.6.3): `docs/nutrition-knowledge-eval.md`.

## N1.6 — Curated knowledge retrieval (status: NOT frozen)

`lib/nutrition/knowledge/` retrieves from the 15-document corpus in `knowledge/nutrition/` (lexical, local, no
embeddings) and passes bounded chunks to the chat model as context. The corpus is shipped in the
`/api/chatbot` serverless bundle via `outputFileTracingIncludes` in `next.config.ts` (verified in the N1.6.3-R1
build: 15 / 15 documents in the `/api/chatbot` trace).

Need detection is layered: regex Layer 1 → uncertain band → bounded semantic gate (one OpenAI call, 4 s
timeout, falls back to Layer 1 on any failure). In N1.6.3-R3 the single call returns a compact **retrieval intent** in closed
vocabularies: category (incl. `general_nutrition`), up to 3 `topics` (the corpus's own section-purpose words, language-neutral), the
goal the message states, and `sensory` / `cuisine` / `food` ids; `category` / `needsKnowledge` are strict, the facet lists are
reduced to their vocabularies (one hallucinated value no longer discards the reply). These are retrieval query-enrichment hints only: not Athlete State, not
preferences, not memory, not nutrition truth; they cannot select or force a document (normal scoring and
filtering still apply), unsupported ids are rejected, and they carry no mutation or tool authority. The
knowledge layer never supplies or alters a number — macros still come from the deterministic engine.

**N1.6.3 is not ready to freeze:** v2 retrieval is Recall@3 0.83, wrong-document 0.24, Section Top-3 0.56
against targets of ≥ 0.95 / ≤ 0.10 / ≥ 0.90, and there is no valid live answer-quality result for R1. Details,
caveats and rejected experiments: `docs/nutrition-knowledge-eval.md`.

## Tests

`lib/nutrition/coach/__tests__/engine.test.ts`, `app/api/chatbot/__tests__/nutrition-coach.test.ts`,
`app/api/nutrition/coach/__tests__/log.test.ts`, and the opt-in local E2E:
`NUTRITION_COACH_LOCAL_E2E=1 npx vitest run app/api/nutrition/coach/__tests__/local-e2e.test.ts`
(loopback Supabase only, default `127.0.0.1:54331`).
