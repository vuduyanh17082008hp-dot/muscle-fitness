# AI Evaluation Dashboard

`/admin/ai-evaluation` — admin-only (`requireAdmin()`), not exposed to
normal clients per spec Part C §17's explicit instruction.

## Purpose

A single page surfacing measurable signal across all three AI subsystems
(SetVision, HawkerLens, Dante) plus basic system health — built specifically
so nothing on it can be mistaken for a validated accuracy claim without
checking its label first (spec §18: "Never present seeded values as
measured results").

## How to read every metric

Every metric on the page (`lib/ai-evaluation/types.ts::Metric<T>`) carries:

- a **value**
- a **source** badge: <span style="color:#10b981">**Real**</span> (live-
  computed on this page load, or a genuinely observed result) or
  <span style="color:#f59e0b">**Demo Data**</span> (synthetic fixtures,
  because no real labeled dataset exists yet for that system)
- a **note** explaining exactly where the number came from

## What's REAL right now

- **Dante — recommendation consistency**: `lib/ai-evaluation/dante-checks.ts`
  calls the actual production `generateRecommendation()` twice with
  identical input and checks for exact equality, live, on every page load.
  This validates determinism (a core Dante Core design requirement), not
  answer quality.
- **Dante — safety layer test status**: runs `checkSafety()` (the real,
  production safety layer) against 10 known boundary-case messages (5
  red-flag, 5 ordinary), live, on every page load, and reports pass/fail —
  mirrors `lib/dante-core/__tests__/safety-layer.test.ts`.
- **System — API latency / healthy**: a real, live-measured Supabase
  round-trip on this page load.
- **System — SetVision analyses / HawkerLens scans logged**: real row
  counts from `setvision_analyses`/`hawkerlens_scans` — but see the scope
  limit below.
- **System — build/test status**: a real, actually-observed result from
  the last local validation run in this development session (174/174
  tests, 0 lint errors, clean build) — NOT re-executed live on page load
  (running the full suite per web request would be far too slow), so this
  is a static snapshot, not a live check. Labeled "Real" because the
  numbers themselves are genuine, not fabricated — the note says exactly
  this.

**Known scope limit**: the SetVision/HawkerLens "logged" counts are
RLS-scoped to the requesting admin's OWN rows, not a system-wide total —
this codebase deliberately has no service-role Supabase client (see
CLAUDE.md), and adding the first one just for a dashboard aggregate was
judged out of scope for this pass (a new secret and a new privilege
boundary deserve their own review, not a side effect of a dashboard
feature).

## What's DEMO DATA right now, and why

**SetVision and HawkerLens accuracy metrics** (rep-count accuracy,
exercise-classification accuracy, ROM/velocity MAE, dish-classification
accuracy, segmentation Dice, portion/calorie/protein MAE): computed by
calling the REAL production benchmark comparison code
(`lib/setvision/benchmark/compare.ts`,
`lib/hawkerlens/benchmark/compare.ts`) against hand-constructed synthetic
`(analysis, groundTruth)` pairs (`lib/ai-evaluation/setvision-demo.ts`,
`lib/ai-evaluation/hawkerlens-demo.ts`) — because **no real annotated video
or photo dataset exists in this project yet**. The computation is real; the
input data is fabricated for demonstration. The moment a real labeled
dataset exists (via the SetVision ground-truth tool at
`/dashboard/workouts/setvision/annotate`, or a HawkerLens equivalent — see
docs/hawkerlens.md's future work), swap the fixture arrays in those two
files for real data and the exact same code produces real numbers.

**Dante — retrieval accuracy, citation accuracy, hallucination test
status**: reported as `null` / "Not measured," not a fabricated percentage.
Grading these requires a held-out, human-graded question/answer evaluation
set that does not exist. Inventing a number here would be exactly what
spec §12/§18 forbid.

**System — recent failures (24h)**: shown as 0, explicitly labeled "not
tracked" — there is no error-rate logging table in this codebase. Zero
means "nothing is measured," not "zero failures occurred."

## How to upgrade a demo metric to real

1. Collect real labeled data (annotated SetVision videos via
   `/dashboard/workouts/setvision/annotate`; HawkerLens photos would need
   an equivalent tool, not yet built — see docs/hawkerlens.md).
2. Replace the fixture arrays in `lib/ai-evaluation/setvision-demo.ts` /
   `hawkerlens-demo.ts` with real `(analysis, groundTruth)` pairs loaded
   from that data.
3. Change the metric's `source` from `"demo"` to `"real"` and update its
   `note` to describe the real dataset (size, collection method, date).
4. Nothing else changes — the same benchmark functions, the same page.

## Testing performed

`npm run type-check`, `npm run lint`, `npm test`, `npm run build` all pass
with this page included. The underlying benchmark comparison functions
have their own dedicated unit tests (`lib/setvision/__tests__/benchmark-
compare.test.ts`, `lib/hawkerlens/__tests__/benchmark-compare.test.ts`).
The page itself (a server component behind `requireAdmin()`) was not
manually clicked through in a browser — no browser available in this
environment; verified via successful build + type-check + reasoning about
the render tree instead.

## Known limitations

- No real accuracy data for SetVision or HawkerLens yet (see above).
- No system-wide usage counts (RLS scope limit, see above).
- Dante retrieval/citation/hallucination testing not implemented.
- No historical trend (this page always shows "right now," no time series).
