# Demo Script (Target: 3–5 minutes)

Prep before the demo: have one account with onboarding already completed
and a few workout/nutrition logs in place, so Dante's answers have real
data to draw from. Have the homepage open in one tab and be logged in on
another.

## 00:00 – 00:20 — Problem + homepage

Open `/`. Say the problem out loud while scrolling past the hero into "THE
PROBLEM" section: *"Fitness advice is everywhere. Personalized guidance
isn't."* Point at the six problem cards briefly — generic programs,
contradictory nutrition advice, fragmented apps.

## 00:20 – 00:50 — The solution + client profile

Scroll to "ONE PROFILE. ONE SYSTEM. ONE COACH." and the "How Dante Works"
diagram. Explain in one sentence: *client data + real evidence go into
Dante, personalized action comes out.* Then open the dashboard
(`/dashboard`) on the logged-in tab to show the real profile driving
everything downstream.

## 00:50 – 01:40 — Workout split recommendation / customization

Go to `/dashboard/workouts`. Show an existing plan, then open
`/dashboard/workouts/plans/new` and build (or edit) a day: set a muscle
priority, adjust RIR on a set, and swap one exercise for an alternative.
This proves the "Adaptive Workout Builder" claim from the homepage isn't
just copy.

## 01:40 – 02:20 — Nutrition / client targets

Go to the nutrition dashboard section. Show calorie/macro targets pulled
from the client's profile, and a logged meal. Mention the local food
database and that Dante can pull live data from USDA FoodData Central when
asked about a food that isn't already logged.

## 02:20 – 03:30 — Ask Dante a contextual question

Open Dante (`/ai-coach` or the "Ask Dante" quick action on the dashboard).
Ask a question that requires real context, for example:

> "Based on my profile and current goal, should I prioritize more chest
> volume or recovery this week?"

or a food question:

> "How much protein is in raw almonds?"

Narrate what's happening: Dante is calling a tool to read your actual
recent workouts/recovery (or calling USDA FoodData Central for the food
question) instead of answering from memory alone.

## 03:30 – 04:00 — External sources / Responsible AI

Scroll the homepage to "How Dante Works" and "Responsible AI," or open
`/ai-fair`. Point out: USDA FoodData Central is live today; other sources
(PubMed, wger, Open Food Facts) are explicitly labeled as roadmap, not
live — because the product doesn't claim integrations it doesn't have.
Mention that Dante does not diagnose medical conditions and gates write
actions behind explicit confirmation.

## 04:00 – 04:30 — Dashboard integration

Quickly show the dashboard overview tying training, nutrition and the
Dante card together in one screen, reinforcing "one profile, one system."

## 04:30 – 05:00 — Closing

Close on the homepage final CTA: *"Today is the youngest you will ever
be."* One sentence: Muscle Fitness connects training, nutrition and
recovery, and Dante is the layer that reads all three and adapts to the
individual — grounded in real data, not generic text.

## Fallback if an external API fails mid-demo

- **USDA FoodData Central is down/rate-limited:** `search_food_evidence`
  returns an "unavailable" result instead of erroring; Dante will say the
  figures are general estimates and keep answering from the local food
  database. Narrate this as the graceful-degradation feature rather than
  treating it as a bug.
- **AI provider (OpenRouter/OpenAI/self-hosted) is unreachable:** the chat
  UI surfaces a clear "Dante isn't available right now" message instead of
  a raw error. Have a fallback: show a previous conversation in
  `/ai-coach/history` and narrate what it would have said.
- **Supabase/session issue:** public marketing pages (homepage, `/story`,
  `/coach`, `/ai-fair`) still render without a valid Supabase session, so
  you can keep the narrative going on those pages while switching accounts
  or refreshing.
