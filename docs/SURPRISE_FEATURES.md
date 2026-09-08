# Surprise / Standout Features

These are implemented, working features — not a wishlist. Each one is
something a judge can click through in a live demo.

## 1. Dante — profile-aware AI coach (not generic prompting)

Dante's system prompt (`lib/ai-coach/server.ts`) instructs the model to
call real data tools (`get_client_profile`, `get_today_workout`,
`get_recent_progress`, `get_nutrition_summary`) before answering, instead
of answering from general knowledge alone. It's why the same question gets
a different, personalized answer for two different clients.

**Demo:** Ask Dante "what should I focus on this week?" from an account
with a filled-in profile and recent workout logs — watch it reference your
actual goal and recent training instead of giving a generic answer.

## 2. Evidence-aware nutrition answers (USDA FoodData Central)

Dante can call `search_food_evidence`, a live tool that queries USDA
FoodData Central for verified macro-nutrient data, instead of guessing a
food's calories/protein/carbs/fat from memory. If the API key isn't
configured, it degrades gracefully to the local food database rather than
crashing or silently making numbers up.

**Demo:** Ask Dante for the macros of a less common food (e.g. "how much
protein is in raw almonds?") and see it cite USDA FoodData Central.

## 3. Gated write actions with explicit confirmation

Dante can propose creating a workout reminder or a support ticket, but the
underlying tools (`create_workout_reminder`, `create_support_ticket`)
refuse to execute unless the user's latest message contains an exact
confirmation phrase. This prevents an AI response from silently mutating
account state.

**Demo:** Ask Dante to set a reminder — it will show the proposed action
and ask you to type the confirmation phrase before it's actually created.

## 4. Adaptive + fully custom workout builder

The workout system (`app/dashboard/workouts/**`, `features/workouts/`)
supports both AI/rule-recommended splits and a fully custom multi-day plan
builder, with muscle-priority weighting (`priority_muscles`), per-set RIR,
and exercise substitution when a client can't do a prescribed movement.

**Demo:** Open `/dashboard/workouts/plans/new` and build a custom split,
then swap an exercise for an alternative.

## 5. Recovery-aware coaching signals

`get_recent_progress` reads logged body-weight, workout adherence and
`daily_metrics` readiness/recovery scores together, so Dante's guidance can
account for a client's actual recent training load rather than only their
stated goal.

**Demo:** Ask Dante "should I push harder this week or ease off?" after
logging a few low-readiness days.

## 6. Graceful degradation, not hard crashes

The app is built to keep working when optional configuration is missing,
rather than throwing an unhandled error page:

- Missing Supabase env vars in development log a warning and let public
  pages render, instead of crashing the whole app (`lib/supabase/proxy.ts`).
- A missing `USDA_FDC_API_KEY` makes `search_food_evidence` return an
  "unavailable" result instead of throwing, so Dante keeps answering with
  the local food database.

**Demo:** This is best shown by pointing at the code (`lib/supabase/proxy.ts`,
`lib/evidence/usda-food-data.ts`) since it's a resilience property, not a
visible UI moment — but it's what keeps the live demo from breaking if one
external dependency is unavailable.

## 7. Onboarding-aware auth routing

After login, signup, or Google OAuth callback, the app looks up whether
the user has completed onboarding (`lib/auth/post-auth-redirect.ts`) and
routes them to `/onboarding` or `/dashboard` accordingly, instead of always
dropping every user on the same landing page regardless of profile state.

**Demo:** Log in with a brand-new account vs. one that already completed
onboarding and see the different landing destination.
