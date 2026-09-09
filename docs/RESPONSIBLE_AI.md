# Responsible AI — Dante (Muscle Fitness)

This document explains what Dante is, what it is allowed to do, what it is
not allowed to do, and how the system tries to keep AI-generated fitness
guidance safe and honest. It is written for judges, reviewers and users —
not just engineers.

## 1. Purpose of Dante

Dante is the AI coaching feature inside Muscle Fitness. Its job is to turn a
client's real profile, training data, nutrition data and recovery signals
into personalized, actionable guidance — the kind a human coach would give
after reviewing someone's numbers, not a generic fitness article.

Dante is **educational and motivational**. It is not a medical device, not a
diagnostic tool, and not a replacement for a physician, registered
dietitian, physiotherapist or mental-health professional.

## 2. AI models used

Muscle Fitness's AI coach (`lib/ai-coach/provider.ts`) is built against the
OpenAI-compatible Chat/Responses API surface and currently supports three
provider modes, selected via the `AI_PROVIDER` environment variable:

- **OpenRouter** (default) — routes to whichever model is configured in
  `OPENROUTER_MODEL` (a specific OpenRouter-hosted model must be configured
  for production use).
- **OpenAI** — a directly configured OpenAI model (`OPENAI_MODEL`), used
  only when `AI_PROVIDER=openai` is explicitly set.
- **Self-hosted** — any OpenAI-compatible endpoint (for example a local
  vLLM or Ollama server), used only when `AI_PROVIDER=self_hosted` is
  explicitly set.

The exact model in use depends on deployment configuration and is never
hardcoded to a specific vendor claim in the product UI. **We do not name a
specific foundation model as "the" Dante model in marketing copy, because
the underlying model is an environment-level configuration choice, not a
fixed product fact.** See `docs/AI_DISCLOSURE.md` for the full, current
provider configuration.

## 3. External APIs / data sources

Dante can call a small set of server-side tools during a conversation:

| Tool | What it reads/writes |
|---|---|
| `get_client_profile` | The authenticated client's own onboarding/profile/preference data |
| `get_today_workout` | The authenticated client's own scheduled/active workout plan |
| `get_recent_progress` | The authenticated client's own body-weight, adherence and recovery history |
| `get_nutrition_summary` | The authenticated client's own logged calories/macros |
| `search_food_evidence` | **Live call to USDA FoodData Central**, a public external nutrition database |
| `create_workout_reminder` / `create_support_ticket` | Write actions, gated behind an explicit user confirmation phrase |

USDA FoodData Central is the one external evidence API that is actually
wired into Dante today (see `docs/AI_DISCLOSURE.md`). Other sources
mentioned in product messaging (PubMed, wger, Open Food Facts, PubChem,
openFDA) are **roadmap targets, not live integrations**, and the UI is
worded to say so rather than implying they are already connected.

## 4. User data involved

Dante only reads data belonging to the currently authenticated user —
profile/onboarding answers, fitness goals, logged workouts, logged meals,
body-weight history, and recovery/readiness metrics already stored in that
user's own Supabase rows (protected by row-level security). Dante is
explicitly instructed to never request, infer, or act on another user's ID
or data.

## 5. Privacy considerations

- Conversation history is stored per-user in Supabase (`ai_threads`,
  `ai_messages`) and is only ever read back for that same authenticated
  user.
- Users can control conversation memory and reminder/summary behavior in
  Dante's settings.
- No client data is sent to USDA FoodData Central — that tool only sends
  a food name search term, never personal or account data.
- Attachments (images/files) a user sends are limited in size and type and
  are only used for that single conversation turn.

## 6. Hallucination risks

Large language models can generate plausible-sounding but incorrect
information. Mitigations in place:

- Dante is instructed to use tool calls (profile, workout, nutrition,
  progress, and the USDA lookup) instead of inventing numbers, and to
  clearly say when data is missing rather than filling the gap with a
  guess.
- Dante is instructed to never fabricate a scientific citation or claim a
  data source was used when it was not.
- The chat UI includes a standing disclaimer that guidance is general and
  not medical advice.

This does not make hallucination impossible — it reduces it. Users should
treat Dante's answers as a starting point, not a verified medical or
scientific record.

## 7. Nutrition-data limitations

- The local food database (`lib/nutrition/food.ts`) contains a small,
  hand-curated set of common foods with USDA-sourced macro values. It is
  not exhaustive.
- The `search_food_evidence` tool calls USDA FoodData Central live, but
  that API can return multiple near-matches, branded vs. generic entries,
  and values that vary by preparation method. Dante is instructed to
  present these as estimates, not exact truth for every real meal.
- Meal recommendations are generated from calorie/macro targets and
  general food-pairing logic; they are not a substitute for a registered
  dietitian, especially for medical nutrition therapy (e.g. diabetes,
  eating disorders, kidney disease).

## 8. Workout-programming limitations

- Program suggestions are based on general resistance-training principles
  (progressive overload, RIR-based intensity, recovery-aware volume) and
  the client's self-reported profile. They are not a substitute for
  in-person coaching, physical therapy, or supervised return-to-training
  after injury.
- Dante is instructed to avoid large sudden increases in volume, intensity
  or frequency, and to account for logged recovery/adherence before
  proposing changes — but it cannot observe actual movement quality or
  form.

## 9. Health / medical limitations

**Dante is not a physician and does not diagnose medical conditions.**
It will not interpret symptoms as a confirmed diagnosis, will not prescribe
medication, and is instructed to direct users toward a qualified clinician
for persistent pain, injury, eating-disorder concerns, pregnancy-related
questions, or any diagnosed medical condition. For emergency warning signs
(chest pain, fainting, severe breathing difficulty, sudden weakness, severe
allergic reaction, major injury) Dante is instructed to tell the user to
stop training and seek urgent professional medical help.

## 10. Supplement information risks

Dante is instructed not to recommend, design or optimize performance-
enhancing-drug, steroid, SARM, hormone, insulin, growth-hormone or illicit
drug protocols, and not to provide dosing, cycling, stacking or post-cycle
therapy guidance. It may explain general risks and recommend speaking with
a qualified medical professional.

## 11. Mitigations (summary)

- A written system prompt (`lib/ai-coach/server.ts`) enforces the rules
  above on every request.
- Write actions (reminders, support tickets) require an explicit typed
  confirmation phrase before they can execute — Dante cannot silently
  modify account state.
- Per-user, per-day usage limits are enforced server-side.
- All tool access is scoped to the authenticated user's own data via
  Supabase row-level security.
- Minors (under 18, where date of birth is known) receive additional
  guidance against aggressive calorie restriction and are pointed toward
  parental/guardian or professional involvement for significant diet
  changes.

## 12. Human oversight

Dante is a decision-support tool, not an autonomous agent. Plan and profile
changes it proposes are surfaced as suggestions; it does not silently
rewrite an active workout or meal plan. Users remain in control of what
they act on, and are encouraged to involve a qualified professional for
anything medical, clinical or high-risk.

## 13. Appropriate-use statement

Muscle Fitness and Dante are intended for general fitness education,
motivation, and day-to-day training/nutrition/recovery guidance for
generally healthy adults and teens (with the safeguards above). They are
**not** intended for:

- Diagnosing or treating any medical or mental-health condition
- Managing a diagnosed eating disorder
- Replacing prescribed medical, dietetic or physiotherapy care
- Performance-enhancing-drug guidance of any kind

If you are experiencing a medical emergency, contact local emergency
services immediately — do not rely on Dante.
