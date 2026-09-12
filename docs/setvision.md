# SetVision

Computer vision for resistance training — Bench Press, Squat, Deadlift.

## Problem

Turn an uploaded video of one set into structured, interpretable metrics
(reps, ROM, tempo, velocity, technique consistency) that Dante Core can
reason over — without claiming clinical-grade biomechanics or fabricating
precision the underlying method can't support.

## Architecture

```
VIDEO (uploaded file)
  -> <video> element, seek-based sampling (components/setvision/collect-pose-frames.ts)
  -> POSE ESTIMATION (lib/ai.ts::loadPoseDetector — MoveNet, already used by Form Coach)
  -> EXERCISE CLASSIFICATION (lib/setvision/exercise-classifier.ts, if not specified)
  -> REP STATE MACHINE (lib/setvision/rep-state-machine.ts)
  -> ROM / TEMPO / VELOCITY / BAR PATH / TECHNIQUE (lib/setvision/{rom,tempo,velocity,bar-path,technique-consistency}.ts)
  -> SetVisionAnalysis (lib/setvision/types.ts — spec §21 schema)
  -> UI (components/setvision/results-panel.tsx) + optional persistence (app/api/setvision/*) + Dante Core
```

Everything from pose estimation through the final `SetVisionAnalysis` object
runs **entirely client-side, in the browser** — no server-side video
processing, no ffmpeg dependency. This was a deliberate MVP scope decision
(spec §11/§12): it avoids standing up video-processing infrastructure this
pass didn't need, at the cost of analysis speed being bounded by the user's
own device.

## Pose estimation model (spec §12)

**MoveNet (SINGLEPOSE_LIGHTNING)**, via `@tensorflow-models/pose-detection`
+ `@tensorflow/tfjs-backend-webgl` — this was **already** the model used by
the pre-existing Form Coach feature (`lib/ai.ts`), so SetVision reuses it
rather than introducing a second pose model into the app:

| Criterion | MoveNet Lightning (chosen, reused) |
|---|---|
| Browser compatibility | Yes — runs client-side via WebGL, already proven in this codebase (Form Coach). |
| Latency | Fast enough for real-time live coaching already; more than fast enough for offline seek-based sampling here. |
| Licensing | Apache 2.0 (TensorFlow Model Garden) — no licensing blocker. |
| Accuracy | Single-person, COCO-17 keypoints — adequate for gross rep/ROM/tempo signals; not a research-grade multi-person or fine-grained model. |
| Mobile feasibility | Yes — Lightning variant is specifically the smaller/faster MoveNet variant, chosen (by the pre-existing code) for exactly this reason. |
| Integration complexity | Zero additional integration — same loader, same keypoint format, same COCO-17 names as Form Coach. |

BlazePose (33-point, adds some limb-rotation detail) and YOLO-pose were not
adopted **not because they're worse**, but because reusing the model already
shipped, tested, and licensed in this codebase is the right call unless a
specific SetVision requirement needed BlazePose's extra keypoints — none of
ROM/tempo/velocity/bar-path/technique-consistency as implemented here do.

## Exercise classification (spec §13)

Heuristic + pose combination, **not a trained deep network** — there is no
labeled video dataset in this project to train one on
(`lib/setvision/exercise-classifier.ts`):

1. Average torso inclination from vertical (folded onto `[0, 90]` — see the
   code comment explaining why the raw `inclinationFromVertical` output
   isn't symmetric around "vertical") distinguishes bench press (torso
   near-horizontal, ≥55°) from a standing lift.
2. For standing lifts, squat vs. deadlift: first checks whether the sequence
   starts already hip-flexed (a deadlift starts from the floor; a squat
   starts standing) via the hip angle on the first frame; falls back to
   comparing observed knee-angle-range vs. squat's reference range against
   observed hip-angle-range vs. deadlift's reference range, picking whichever
   residual is smaller.

This is deliberately simple and inspectable — every classification returns
its own `signals: string[]` explaining what drove it. **It has not been
validated against any real labeled video** (see Benchmarking below); replace
it with a lightweight classifier trained on real annotated data once that
exists, rather than trusting this heuristic indefinitely.

## Rep counting (spec §14)

`lib/setvision/rep-state-machine.ts` generalizes the SAME hysteresis pattern
already proven in the pre-existing `lib/form-coach/squat-analyzer.ts`
(moving-average smoothing over 3 samples, a minimum hold time per phase
transition, a refractory period between completed reps) into one state
machine parameterized per exercise (`lib/setvision/exercise-config.ts`):

```
TOP -> DESCENT -> BOTTOM -> ASCENT -> TOP (+1 rep)
```

The one change from the live-camera version: transitions are gated by
**elapsed time** (`MIN_TRANSITION_HOLD_MS`), not a frame count, since
uploaded-video sampling isn't tied to a live camera's frame rate.

| Exercise | Primary angle | Top / bottom thresholds |
|---|---|---|
| Bench Press | Elbow (shoulder-elbow-wrist) | 160° / 80° |
| Squat | Knee (hip-knee-ankle) | 160° / 90° |
| Deadlift | Hip (shoulder-hip-knee) | 165° / 70° |

An aborted rep (stood back up without reaching the bottom threshold) is
explicitly detected and not counted — same principle as the live Form Coach
squat analyzer.

## Range of motion (spec §15)

`romPercent = (observed angle range this rep) / (per-exercise reference
range) * 100` — reference ranges (`exercise-config.ts`) are rough, commonly
cited ballpark figures, **not a clinical/biomechanical measurement**.
Deliberately left unclamped above 100%: a more mobile lifter shouldn't have
that silently hidden by a cap.

## Tempo (spec §16)

Directly derived from the rep state machine's own phase-transition
timestamps — eccentric = descent duration, pause = bottom-hold duration,
concentric = ascent duration. Cannot disagree with the rep boundaries shown
elsewhere, because there is no separate estimation step.

## Bar path (spec §17) — explicitly labeled MVP method

**There is no real barbell detection.** `lib/setvision/bar-path.ts` tracks a
body-relative proxy landmark per exercise (wrist midpoint for bench/deadlift,
shoulder midpoint for squat) — chosen because the lifter's hands/shoulders
move with the bar, not because it *is* the bar. This is stated in the code
and here, not hidden behind a "bar path" label that implies more than it is.
What it measures — how far the proxy drifts horizontally from its own
rep-start position — is a genuinely useful signal (a wandering path usually
does indicate a real technique/balance issue) even though the absolute
position isn't the true bar.

## Velocity (spec §18-19) — the one section treated most carefully

Monocular video has no inherent scale. `lib/setvision/velocity.ts` computes
speed as **torso-lengths per second** by default — bar-proxy path length
during the concentric phase, divided by the lifter's own torso length
(shoulder-midpoint to hip-midpoint distance) in that frame, divided by time.
This is `calibrated: false`, `unit: "torso-lengths/s"` — explicitly NOT
m/s, and the UI (`results-panel.tsx`) never labels it as such.

If a caller supplies `metersPerTorsoLength` (the user measured their own
torso length once, or a known reference like plate diameter was used to
derive the conversion factor externally), speeds convert to real m/s and the
result flips to `calibrated: true`, `unit: "m/s"`. There is no calibration
*UI* in this pass — the API (`analyzeWorkoutVideo(frames, {
metersPerTorsoLength })`) supports it, but nothing in the product surface
collects that input yet (see Limitations).

**Velocity loss**: `(firstRep - finalRep) / firstRep`, `null` with fewer
than 2 reps or a zero/negative first-rep speed — never divides by something
that could produce a nonsensical result silently.

## Technique consistency (spec §20)

Deliberately **not** a single arbitrary "form score". Three independently
interpretable sub-metrics (`lib/setvision/technique-consistency.ts`), each
`1 - coefficient_of_variation` of its own already-computed per-rep value,
clamped to `[0, 1]`, `null` with fewer than 2 reps:

- ROM consistency (`rom.ts`)
- Tempo consistency (`tempo.ts`)
- Bar-path consistency (`bar-path.ts`)
- Left/right knee-angle asymmetry, **squat only** — bench/deadlift would
  need different joint pairs and camera-angle assumptions this pass didn't
  validate; returns `null` rather than a fabricated 0 for those exercises.

## Output schema (spec §21)

`lib/setvision/types.ts::SetVisionAnalysis` — matches the spec's example
shape (`exercise`, `reps`, `romConsistency`, `averageEccentricTime`,
`averageConcentricTime`, `velocity`, `technique`, `confidence`), plus
`perRep` (rom/tempo detail for the UI and benchmark tool) and `limitations`
(honest, run-specific caveats — e.g. "only 43% of frames had clear
visibility", "only 1 rep detected").

Overall `confidence` is itself a composite (`analyze.ts`) of classification
confidence, frame-visibility ratio, rep-count sufficiency, and whether a
torso length could be estimated — documented, not a single opaque number.

## UI (spec §22)

`/dashboard/workouts/setvision` (`components/setvision/video-analyzer.tsx`):
upload → optional exercise override → Analyze (shows a live skeleton overlay
via the pre-existing `components/form-coach/pose-overlay-canvas.tsx`,
reused as-is) → results panel (Reps/ROM/Tempo/Velocity/Velocity
Loss/Consistency, per-rep table, limitations) → optional save (uploads video
+ persists metrics) → "Ask Dante" (calls `/api/dante/recommendation` with
the SetVision signal and renders the resulting `DecisionCard`).

## Benchmarking (spec §23) — framework only, no claimed results

`lib/setvision/benchmark/` provides the measurement framework
(`GroundTruthAnnotation`, `compareRepCount`, `compareClassification` +
confusion matrix, `compareRom`, `compareVelocity`, `measureLatency`,
`summarizeBenchmark`) and is unit-tested against **synthetic** data
(`lib/setvision/__tests__/benchmark-compare.test.ts`) to prove the
comparison logic itself is correct.

**No real labeled video dataset exists in this project.** Nothing anywhere
in this codebase should be read as an accuracy claim for SetVision. Running
this framework against a real dataset — starting with the ground-truth tool
below — is the necessary next step before any accuracy number is quoted
anywhere (a demo, a pitch, a README).

## Manual ground-truth annotation tool (spec §24)

`/dashboard/workouts/setvision/annotate` — an internal tool (not part of the
end-user product surface): upload a video, scrub to each rep's start/end and
mark it, label the exercise, export as a `GroundTruthAnnotation` JSON file
matching the benchmark framework's input type exactly. This is intentionally
the entire scope of "ground truth collection" in this pass — no bulk-review
workflow, no server-side storage of annotations. It exists to make starting
a real dataset possible, not to be a full labeling platform.

## Dante Core integration (spec §25)

```
VIDEO -> SETVISION -> SetVisionAnalysis -> DANTE CORE -> AutoregulationDecision -> EXPLANATION
```

Implemented end-to-end in `components/setvision/video-analyzer.tsx`: after
an analysis completes, "Ask Dante" sends `{velocityLoss, velocityCalibrated,
romConsistency, confidence}` from the `SetVisionAnalysis` as the
`setVision` field of a `/api/dante/recommendation` request, alongside a
user-entered planned load/sets. Dante Core's severity scoring
(`lib/dante-core/autoregulation-engine.ts`) weighs the velocity-loss signal
exactly as documented in `docs/dante-core.md`, and the resulting
`TraceableDecision` renders via the same generic `DecisionCard` component
Dante Core itself uses — one traceability UI for both systems, not two.

## Database (spec §26)

`supabase/migrations/20260916090000_setvision.sql`:

- `public.setvision_analyses` — structured metrics only (reps, consistency
  scores, velocity numbers, `per_rep` jsonb, `limitations` jsonb), a nullable
  `video_storage_path`, and optional FKs to `workout_sessions` /
  `workout_session_exercises`. RLS: owner-only select/insert/update/delete.
- `storage.buckets` entry `setvision-videos` (private, 500MB file limit) +
  `storage.objects` policies enforcing every object path be scoped
  `"<user_id>/..."` — no cross-user access, no public bucket.

**This migration has not been applied to any live database in this pass** —
migrations in this repo are checked in as SQL files and applied separately
(the existing convention here, e.g. via `supabase db push` or the Supabase
dashboard); applying schema changes to a real project without the user's
explicit review was treated as out of scope for an autonomous session. Run
it before using the persistence features.

## API boundaries (spec §27)

- `setvision.analyzeWorkoutVideo()` → `analyzeFrameSequence`
  (`lib/setvision/analyze.ts`), exported under that name from
  `lib/setvision/index.ts`. Pure function: array of `{timestampMs, frame}`
  in, `SetVisionAnalysis` out — no DOM, no video element, no network call.
  The DOM/video/pose-detector plumbing lives entirely in
  `components/setvision/collect-pose-frames.ts`, kept separate specifically
  so the algorithmic core stays testable with plain synthetic data (see the
  41 tests in `lib/setvision/__tests__/`).
- `app/api/setvision/upload-url` (POST) — signed Storage upload URL.
- `app/api/setvision/results` (POST/GET) — persist / list analyses.

No circular dependency with Dante Core: SetVision exports plain data types
(`SetVisionSessionSignal`-shaped data); Dante Core's `types.ts` defines that
shape independently and nothing in `lib/setvision/` imports from
`lib/dante-core/`.

## Tests

`lib/setvision/__tests__/` — 52 tests across rep-state-machine (clean
counting, aborted-rep rejection, reset, occlusion handling, per-rep timing),
rom-tempo (reference-range math, unclamped >100%, consistency scoring),
velocity-barpath (calibration on/off, velocity-loss math verified against a
known 4x-slowdown case, graceful degradation with no torso length),
exercise-classifier (all three exercises, too-few-frames degradation), full
`analyzeFrameSequence` integration (schema shape, explicit-exercise
override, empty-input handling), and the benchmark framework itself.

## Known limitations

- **No real accuracy numbers** — see Benchmarking above. This is the single
  most important limitation in this document.
- **Bar path is a body-relative proxy**, not real bar detection.
- **Velocity defaults to a normalized unit**; real m/s requires a
  calibration input the product UI doesn't yet collect (the API supports
  it).
- **Asymmetry is squat-only.**
- **Single-lifter assumption** (MoveNet's single-pose mode) — a second
  person in frame (spotter, trainer) is not handled specially and could
  degrade tracking if they're closer to the camera than the lifter.
- **Client-side-only processing** means analysis speed depends on the
  user's device; no server-side fallback exists for very long videos or
  low-power devices.
- **Exercise classifier is heuristic**, unvalidated against real data (see
  above) — treat its output as a reasonable guess, not ground truth, until
  benchmarked.

## Future improvements

- Run the benchmark framework against a real annotated dataset collected via
  the ground-truth tool; only then state an accuracy number anywhere.
- A calibration UI (known object in frame, or user-entered torso length) so
  more analyses can report real m/s.
- Object-detection-based bar tracking, once there's a labeled dataset to
  validate it against — do not ship a "bar tracking" claim before that.
- Replace the heuristic exercise classifier with a lightweight trained model
  once real labeled data exists (spec explicitly cautions against an
  oversized network without sufficient data — a small model trained on a
  real dataset, not a deep network trained on nothing).
