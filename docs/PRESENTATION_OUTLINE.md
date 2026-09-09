# Presentation Outline (8–10 slides)

## 1. Muscle Fitness

- Evidence-aware AI fitness coaching platform
- Training + nutrition + recovery in one profile
- Built for the AI Fair as a working, deployable product
- Screenshot/visual: homepage hero
- Speaker note: Open on the tagline — "AI-powered personal training, built
  around you" — and state in one sentence what the product is before
  explaining anything technical.

## 2. The Problem

- Generic workout programs that ignore recovery and schedule
- Contradictory nutrition advice from a dozen sources
- Supplement/"hack" misinformation with no evidence behind it
- Expensive one-on-one coaching most people can't access
- Screenshot/visual: "THE PROBLEM" homepage section
- Speaker note: Make this relatable — most people have experienced at
  least one of these frustrations directly.

## 3. Fitness Advice Is Fragmented

- Training app, nutrition app, and a coach (if you can afford one) rarely
  talk to each other
- No single system connects your real profile to a plan
- Manual tracking across tools means data goes stale fast
- Screenshot/visual: a "three disconnected apps" style diagram
- Speaker note: Set up the contrast for the next slide — fragmentation is
  the disease, one connected system is the cure.

## 4. The Solution

- One profile. One system. One coach.
- Training, Nutrition, Recovery and Dante feed each other instead of
  operating in isolation
- Screenshot/visual: "ONE PROFILE. ONE SYSTEM. ONE COACH." section
- Speaker note: Introduce Dante by name here for the first time as the
  layer that reads all three.

## 5. How Dante Works

- Client profile + training/nutrition/recovery data + trusted external
  sources → Dante → personalized action
- Live today: USDA FoodData Central; more sources on the roadmap
- Explicit rule: never claim a source is connected unless it actually is
- Screenshot/visual: "How Dante Works" architecture diagram
- Speaker note: This is the most important slide for AI Fair judges — it
  shows AI synthesizing multiple real inputs, not just generating text.

## 6. Product Demo / Core Features

- Dante AI Coach — contextual, profile-aware conversation
- Adaptive Workout Builder — custom splits, muscle priorities, RIR,
  substitutions
- Smart Nutrition — targets, meal recommendations, food lookups
- Recovery Intelligence — readiness-aware guidance
- Screenshot/visual: AI Features grid from the homepage, or a live demo cut-in
- Speaker note: Name only features that are actually working — this is a
  cue to switch to the live demo or a short recorded clip.

## 7. Technology + Data Architecture

- Next.js App Router + TypeScript + Tailwind CSS
- Supabase (Postgres, auth, row-level security)
- AI provider layer: OpenRouter / OpenAI / self-hosted, OpenAI-compatible
  API (`lib/ai-coach/provider.ts`)
- USDA FoodData Central for live nutrition evidence
- Screenshot/visual: architecture diagram from `README.md`
- Speaker note: Keep this technical but brief — the audience already
  understands the product; this slide earns credibility.

## 8. Responsible AI

- Dante does not diagnose disease, prescribe medication, or replace a
  clinician
- Write actions require explicit user confirmation
- Uncertainty and missing data are disclosed, not hidden
- Full detail in `docs/RESPONSIBLE_AI.md`
- Screenshot/visual: "Responsible AI" homepage section
- Speaker note: This slide answers the judge's unspoken question — "is
  this safe?" — directly and without over-promising.

## 9. Surprise Features

- Gated write actions with explicit confirmation phrases
- Graceful degradation when an external API or env var is missing
- Onboarding-aware auth routing
- Full list in `docs/SURPRISE_FEATURES.md`
- Screenshot/visual: whichever feature you demoed live
- Speaker note: Pick 1–2 favorites to highlight rather than reading the
  whole list — depth beats breadth here.

## 10. Impact / Future Vision

- Today: a working evidence-aware coaching loop for training, nutrition
  and recovery
- Next: more external evidence sources (PubMed, wger, Open Food Facts),
  deeper recovery/check-in signals, expanded exercise substitution logic
- Closing line: "Today is the youngest you will ever be."
- Screenshot/visual: final CTA section
- Speaker note: End on the brand line — it ties the emotional close back
  to the product's actual purpose.
