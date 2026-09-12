# HawkerLens SG

Computer Vision Nutrition Intelligence for Singapore hawker food.

## Positioning

Not a generic "photo → calories" feature. HawkerLens recognizes a validated
MVP list of 10 common Singapore hawker dishes, decomposes each into its
typical components, and estimates a nutrition RANGE with explicit,
multi-source uncertainty — never a bare number implying precision the method
doesn't have. Anything outside the MVP list falls back to the existing
generic Photo Estimate flow (`lib/nutrition/photo-estimate.ts`), never to a
guessed HawkerLens result.

**MVP dishes** (`lib/hawkerlens/types.ts::HAWKER_DISH_IDS`): Hainanese
Chicken Rice, Cai Png, Nasi Lemak, Laksa, Bak Chor Mee, Ban Mian, Char Kway
Teow, Fish Soup, Mee Goreng, Mala.

## Pipeline (spec §3)

```
PHOTO
  -> IMAGE QUALITY CHECK          (part of the single VLM call — see below)
  -> DISH CLASSIFICATION          (lib/hawkerlens/vision.ts)
  -> COMPONENT SEGMENTATION       (same VLM call, name-based — see limitation below)
  -> PORTION ESTIMATION           (lib/hawkerlens/portion.ts)
  -> NUTRITION DATA LOOKUP        (lib/hawkerlens/nutrition-lookup.ts)
  -> UNCERTAINTY ESTIMATION       (lib/hawkerlens/uncertainty.ts)
  -> USER CONFIRMATION            (components/nutrition/hawkerlens-panel.tsx)
  -> SAVE                         (app/api/hawkerlens/confirm -> food_logs, same path as every other input method)
```

Orchestrated by `lib/hawkerlens/analyze.ts::analyzeHawkerLensPhoto` — each
stage is its own module and the orchestrator only sequences them; it never
computes a nutrition number itself.

## Model (spec §5)

**A general-purpose vision-language model (the same Groq vision model
already configured for Photo Estimate via `GROQ_VISION_MODEL`), constrained
by a closed-set prompt to the 10 MVP dishes** — not a fine-tuned classifier.

| Consideration | Why a VLM + prompt, not a fine-tuned model |
|---|---|
| Dataset | No labeled Singapore-hawker-food image dataset or training pipeline exists in this project. |
| Training approach | None — this is prompt engineering over an existing general vision model, not model training. |
| Licensing | Inherits whatever Groq's hosted vision model's terms are (already accepted for Photo Estimate) — no new licensing surface. |
| Limitations | A VLM has no guarantee of consistent accuracy on a closed set the way a properly fine-tuned classifier trained on real examples would. It is the practical, honest MVP choice given no training data exists — replace with a lightweight fine-tuned classifier once real labeled photos exist (the confirmation flow below is what would generate that data). |

This is a **deliberately separate** function/prompt from
`lib/ai/vision-client.ts::identifyFoodsInImage` (open-ended, any food) —
same env vars and honesty rules (never returns a calorie number itself), but
a different, closed-set prompt.

**Combined single call**: image quality assessment + dish classification +
component segmentation + rough per-component portion are all requested in
ONE VLM call (`lib/hawkerlens/vision.ts`), not three separate round trips —
an explicit "don't overengineer" choice (spec §5).

## Image quality check (spec §4)

Delegated to the same VLM call rather than a separate deterministic
image-processing stage (no blur-detection/lighting-analysis library was
added for this pass). The model reports `visibility`, `obstructed`, `angle`,
`multiplePlates`, `unknownDish` as structured fields; `lib/hawkerlens/
vision.ts::buildImageQuality` turns those into a `qualityScore` and an
`issues[]` list. If unusable, `analyzeHawkerLensPhoto` returns
`status: "low_quality_image"` with a message asking for another photo or
manual entry — **it never proceeds to produce a confident estimate from a
flagged-unusable image.**

## Component segmentation (spec §6) — honest limitation

Segmentation here is **name-based** ("rice", "chicken", "sauce"), not
pixel/spatial. Mixed meals ARE decomposed (a chicken rice photo returns
separate rice/chicken/sauce/cucumber components, each with its own portion
and confidence), matching the spec's example — but there is no bounding
box or segmentation mask. This is why the benchmark module's "segmentation"
metric (below) is explicitly a set-overlap proxy, not real IoU.

## Portion estimation (spec §7)

**Chosen method: food-atlas-comparison-style blending.** A single
uncalibrated photo has no reliable absolute scale (no plate-diameter
reference marker, no depth camera, no user calibration step in this pass).
`lib/hawkerlens/portion.ts` blends the VLM's own visual gram estimate with
the dish's curated "typical portion" for that component
(`lib/hawkerlens/dishes.ts`), weighted by the VLM's own stated confidence:
higher confidence trusts the visual read more; lower confidence leans
toward the typical-serving anchor. The uncertainty RANGE widens as
confidence drops (±15% high / ±30% medium / ±45% low) — **never a bare
gram number**, regardless of confidence.

## Uncertainty (spec §8) — mandatory, implemented as three distinct numbers

`lib/hawkerlens/uncertainty.ts` keeps three uncertainty sources separate
until the very last step:

- `modelConfidence` — how sure the VLM was about WHICH dish this is.
- `portionConfidence` — how sure the portion estimate is.
- `nutritionConfidence` — how good the per-100g data source is per
  component (curated hawker estimate vs. USDA/OFF vs. no match).

`overallConfidence = modelConfidence*0.4 + portionConfidence*0.35 +
nutritionConfidence*0.25` (weighted toward classification/portion, since a
wrong dish or portion invalidates everything downstream regardless of
nutrition-source quality). The UI (`hawkerlens-panel.tsx`) always shows a
calorie/protein **range**, matching the spec's example format exactly
("Estimated calories: 720 kcal / Likely range: 660-790 kcal").

## User confirmation (spec §9)

Every component is editable (name shown, grams editable, can be excluded)
before saving. **The original AI prediction is stored separately from the
user's confirmed version**: `hawkerlens_scans.components_predicted` (written
at scan time, never modified) vs. `hawkerlens_scans.components_confirmed`
(written only on confirm). The diff between the two is exactly what future
model evaluation needs — this is the intended source of a real labeled
dataset over time, alongside a real ground-truth tool if one is added later.

Confirmed components save through the **exact same path every other input
method uses** — `lib/nutrition/food-log/mutations.ts::createFoodLog`,
`source: "ai_estimate"` (already a valid `food_logs_source_check` value, no
schema change needed). HawkerLens does not have its own separate "food
entry" concept.

## Data sources (spec §10)

Provider priority, decided entirely in `lib/hawkerlens/nutrition-lookup.ts`
(never in a UI component):

1. **The dish's own curated component template** (`dishes.ts`) — used when
   a detected component matches one of the dish's known parts
   (`lib/hawkerlens/component-matching.ts`, token-overlap matching since the
   VLM's wording varies). This is the most relevant data for hawker-style
   preparation, which generic databases don't model (plain USDA "chicken
   breast" is not hawker-style oily poached chicken).
2. **The existing generic `searchFood()` cascade** (USDA → Open Food Facts
   → local fallback) — used when no dish-template match exists.
3. If neither matches: the component contributes zero, flagged with
   `sourceLabel: "No nutrition match found"` — **never a fabricated
   macro profile.**

**HONESTY NOTE on the curated dish data itself** (`dishes.ts`): every
per100g figure is an *internal estimate* built from typical hawker-stall
recipe composition, cross-referenced against generic USDA-equivalent
ingredients — **not sourced from a verified, published Singapore-specific
database** (e.g. Singapore HPB's Energy & Nutrient Composition of Food
database was not available to consult in this environment). Treated the
same way `lib/nutrition/food-data/local-fallback.ts` treats its own
entries: a reasonable placeholder pending a verified source, not a claim of
lab-tested accuracy. Every attribution string says so
(`"Locally curated — <dish> (Singapore hawker estimate)"`).

## Output schema (spec §11)

`lib/hawkerlens/types.ts::HawkerLensResult` matches the spec's example
shape (`dish`, `components[]` with `estimatedGrams`/`confidence`,
`nutrition.calories/protein` as `{estimate, lower, upper}`,
`overallConfidence`), plus `componentDetail` (full per-component breakdown
for the UI), `imageQuality`, `uncertainty` (the three separate confidence
dimensions), and `status`/`message` for the non-`"ok"` cases.

## Benchmarking (spec §12) — framework only, no claimed results

`lib/hawkerlens/benchmark/` — `compareDishClassification` + confusion
matrix, `compareSegmentation` (documented set-overlap proxy, not pixel IoU
— see the module's own docstring), `comparePortion` (MAE), `compareCalories`
/`compareProtein` (MAE + MAPE), `computeCalibration` (Expected Calibration
Error over confidence buckets). Tested against **synthetic** data only
(`lib/hawkerlens/__tests__/benchmark-compare.test.ts`).

**No real labeled Singapore-hawker-food photo dataset exists in this
project.** Nothing here is, or should be read as, an accuracy claim for
HawkerLens. This framework is ready to run once real annotated photos exist
— building that dataset (via the confirm-flow's prediction/confirmation
diff, or a dedicated annotation tool analogous to SetVision's) is future
work, not done in this pass.

## API boundaries

- `POST /api/hawkerlens/scan` — runs the pipeline, records the original
  prediction in `hawkerlens_scans`, never writes to `food_logs`.
- `POST /api/hawkerlens/confirm` — saves the user's confirmed components to
  `food_logs`, updates the scan row's `components_confirmed`.

## Database

`supabase/migrations/20260917090000_hawkerlens.sql` — `hawkerlens_scans`
table (prediction + confirmation, RLS owner-only) + a private
`hawkerlens-photos` storage bucket (photo saving is optional, same pattern
as SetVision's video storage). **Not applied to any live database in this
pass** — review and run before using HawkerLens in production, same caveat
as the SetVision migration.

## Tests

31 tests (`lib/hawkerlens/__tests__/`): component matching (token-overlap
correctness), portion estimation (range always present, confidence-weighted
blending, no negative bounds), uncertainty (three dimensions kept separate,
zero-division safety), and the benchmark framework (classification,
confusion matrix, segmentation proxy, portion/calorie/protein error,
calibration) against synthetic fixtures.

## Known limitations

- No real accuracy numbers — see Benchmarking above.
- Segmentation is name-based, not pixel-level (see §6).
- Curated dish nutrition data is an internal estimate, not from a verified
  Singapore-specific source (see Data sources).
- Portion estimation has no calibration reference (known object, user
  measurement) — purely a visual-read + typical-serving blend.
- 10-dish MVP scope — anything else correctly falls back to generic Photo
  Estimate, never a wrong HawkerLens guess.

## Future improvements

- Replace the curated dish dataset with a verified Singapore-specific
  nutrition source if one becomes accessible.
- A calibration reference (plate-size prompt, common object in frame) for
  real portion accuracy.
- A dedicated ground-truth annotation tool (mirroring SetVision's) to build
  a real benchmark dataset from confirmed scans.
- Once real labeled data exists, replace the VLM-prompt classifier with a
  small fine-tuned model — not before, per the spec's own "do not
  overengineer" and "do not build an oversized network without sufficient
  dataset" guidance.
