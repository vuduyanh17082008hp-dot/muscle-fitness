# Muscle Fitness — Competition Command Mode

An 8-step walkthrough of the full Human Performance Intelligence
Platform. Everything below runs against a real account; the ONLY
fixture data used is the explicitly-labeled demo wearable scenario
(step 2) — turned on for that one account via `/admin/ai-evaluation`
→ "Demo Data Control," and clearly marked `isDemo: true` everywhere it
surfaces. No other step uses fabricated data.

## Before you start

1. Prepare a real demo account using `docs/DEMO_ACCOUNT.md` (completed
   onboarding plus training, recovery, nutrition and progress history).
   Never commit that account’s credentials.
2. As an admin, open `/admin/ai-evaluation` and turn on a demo
   wearable scenario (e.g. "Recovery Warning") for the demo account —
   this is what step 2 shows.

## 1. Athlete Digital Twin

Open `/dashboard/training-intelligence`.

Show the Digital Twin panel: current state across training, nutrition,
recovery, SetVision, and wearable, each with its own confidence and
"still building a full picture" honesty where data is thin. Open the
Muscle Recovery Map disclosure.

## 2. Wearable Scenario (clearly labeled demo)

Point out `AthleteState.wearable` on the same panel — resting HR, HRV,
sleep from the demo provider, and the visible **demo** label. Explain:
*"This account has a demo wearable scenario turned on so you can see
the full pipeline — Muscle Fitness has no real device integration yet;
that's an explicit, documented next step, not something we're
pretending already works."*

## 3. Dante Recommendation

Go to the dashboard home. Show the Dante panel's "what should I do
today" recommendation, its Why disclosure, and — if a proposed action
is showing — the Action Preview diff (before → after, Apply/Keep
buttons). Confirm or dismiss one live.

## 4. SetVision

Open `/dashboard/workouts/setvision`. Upload a lift video (or use a
previously analyzed one). Show rep count, ROM/tempo consistency, and
the confidence + limitations text — never a bare "accuracy: 94%" claim.

## 5. HawkerLens

Open the nutrition tracker's photo-scan flow. If a live vision model
is configured, scan a real hawker-dish photo. If not, trigger the demo
adapter and explicitly call out the "Demo mode — not a real analysis"
banner and the disabled Confirm button — this is the same honesty
principle as step 2, applied to a different subsystem.

## 6. Adaptive Action

Back on `/dashboard/recovery`, show the Performance/Recovery Radar
card — NORMAL / WATCH / SIGNIFICANT DEVIATION, with its signals and
"unusual recovery pattern" language (never "you are sick"). If status
is elevated, connect it back to a Dante proposed action from step 3
(e.g. a volume reduction) — the same underlying signal driving two
coordinated surfaces.

## 7. Experiment Insight

Open `/dashboard/experiments`. Show an existing experiment's result
card (or create one live — "Does late caffeine affect my sleep?").
Read the Why/Data Used/Confidence/Limitations aloud, emphasizing the
association-not-causation line.

## 8. Evaluation Evidence

Return to `/admin/ai-evaluation`. Walk through the Real vs. Demo Data
badges on every metric — this is the credibility payoff: nothing on
this page claims a result that wasn't actually computed, and several
rows (Dante's determinism, safety layer, action validation,
missing-data behavior) are live-executed against production code on
that very page load.

## Closing

Return to `/responsible-ai`. Read one safeguard card aloud —
"Predictions are estimates, not facts" or "Sensor & vision
limitations" — to land the point: *"Every intelligent feature you just
saw explains itself, states its own confidence, and knows the
difference between a pattern and a diagnosis."*

## API Failure Backup

If an external API fails:

1. Continue the demo.
2. Use local profile, workout, and demo-wearable features.
3. Explain that external retrieval (USDA, Open Food Facts, PubMed,
   Groq vision) is additive — the deterministic engines underneath
   keep working without it.
4. Never fake a source response, a benchmark number, or a "live"
   wearable connection that isn't real.
