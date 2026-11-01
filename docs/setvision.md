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
2. Camera view gate: when the two hips sit more than 0.35× torso length
   apart (median over clearly tracked frames), the camera faces the lifter.
   Sagittal knee/hip angles are then 2D projections (a front-view squat's
   thigh foreshortens and its "hip angle" collapses like a hinge), so the
   classifier **abstains** (`exercise: null`) and asks the user to choose.
3. Side-on (or unknown) view: squat vs. deadlift by the ratio of robust
   (p95 − p5) knee-flexion range to hip-flexion range. ≥ 0.8 → squat (knee
   and hip bend together); ≤ 0.55 → deadlift (hip-dominant hinge); between
   → abstain. Under 30° of movement on both joints → abstain.

All joint angles take every point from **one body side** — the side whose
weakest keypoint scores higher — and only when that score is ≥ 0.4
(`exercise-config.ts::sameSidePoints`).

**Correction 2026-11-01.** Until then each joint's side was chosen
independently (`getBestSide` per joint) with no score floor, and squat vs.
deadlift was decided by (a) "the FIRST frame's hip angle < 110° → deadlift,
0.75" and (b) which observed range sat closer to an arbitrary reference
range. On a real front-view bodyweight squat with an ~8 s bottom hold, the
side mixing made a standing knee read 107° one sample and 178° the next and
the mid-hold hip angle 52°, so the clip came out as "deadlift — 1 rep" with
6–7 s eccentric/concentric phases (the 75% vs 76% shown depended on which of
the two wrong branches a run hit). Replaying real MoveNet frames from eight
clips through the old code: all five squat clips (including two side-on
kettlebell squats) were labelled deadlift, and a real deadlift demo was
labelled squat. Rule (b) also penalised deep squats for exceeding the
reference range.

Results of the corrected classifier on those same real frames (author's
visual labels, not independent annotation; MoveNet output varies slightly
run to run):

| Clip (view) | Visual label | Old | New |
|---|---|---|---|
| 10-count squat (front, 35 s) | squat, 1 rep, ~8 s hold | deadlift, 1 rep | abstain (front view) |
| kettlebell squat A (side) | squat, 3 reps + pickup + cut final rep | deadlift, 4 reps | squat, 3 reps |
| kettlebell squat B (side) | squat, 4 reps (1st starts in the hole) + put-down | deadlift, 4 reps | squat, 4 reps (1st: descent not observed) |
| barbell back squat (rear-oblique, 7 s) | squat, 2 reps | deadlift, 1 rep | squat, 2 reps |
| CDC half squat (front/oblique) | squat | deadlift | abstain (front view) |
| goblet squat (front/oblique) | squat | deadlift | abstain (front view) |
| deadlift demo (rear-oblique, real person) | deadlift | squat | abstain (front/rear view) |
| deadlift (side, rendered mannequin) | deadlift | deadlift | abstain (knee/hip ratio 0.70) |

**No real clip was recognised as deadlift by the corrected classifier**;
deadlift recognition is exercised only by synthetic side-view poses. Eight
clips cannot establish accuracy for either class. The score in
`confidence` is an uncalibrated margin, never shown as a percentage.

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

Observation rules (2026-11-01):

- **Arming.** Counting starts only once the lifter is clearly seen at the
  top (angle ≥ top threshold) or the bottom (≤ bottom threshold). A clip
  that starts at the bottom (deadlift from the floor, clip cut mid-rep)
  still counts the observed ascent, but that rep's eccentric and hold are
  `null` ("not observed"), never measured from the first frame.
- **Tracking loss.** A gap > 1 s between clearly tracked frames drops the
  rep in progress (listed in `limitations`) and re-arms; reps are never
  stitched across unobserved time.
- **Bottom hold.** Sinking back to ≤ bottom threshold during the ascent
  returns to BOTTOM, so a wobble mid-hold neither adds a rep nor starts the
  concentric clock early.
- **Clip ends mid-movement.** Not counted; noted in `limitations`.
- A completed rep is an observed down-and-up cycle — not a judgement of
  depth standard, form or safety. Picking up equipment with a hip hinge
  does not reach the squat's 90° knee threshold and is not counted; a
  squat-depth pickup would be (no object awareness).
- Camera facing the lifter + exercise chosen manually: reps and timing still
  come from the projected angle trace, ROM % is withheld.

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
elsewhere, because there is no separate estimation step. Each rep also
carries its video-relative boundaries (`descentStartMs`, `bottomReachedMs`,
`ascentStartMs`, `repEndMs`), shown as a seekable rep timeline.

Boundaries are threshold crossings of a 3-sample smoothed angle at 10 Hz, so
they trail the visible start of a movement. On the 10-count squat (squat
selected manually) they were 17.4 / 18.2 / 26.7 / 27.3 s against the
author's frame-by-frame reading (5 fps) of ≈17.0 / 18.1 / 26.3 / 27.1 s
(±0.2 s): within +0.4 s. Treat ±0.5 s as the expected tolerance; this
single comparison is not an evaluation.

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

`legacy-regression.test.ts` (2026-11-01, 21 tests, synthetic poses) pins
the misclassification correction: one-side angles, front-view abstention,
side-view squat/deadlift/ambiguous, hip-flexed or low-score first frame,
long bottom hold + mid-hold wobble, slow/partial reps, equipment pickup,
clip starting/ending mid-rep, tracking loss, single-rep consistency,
unusable video, and P0's duration rejection of the regression clip. 14 of
them fail against the pre-correction code. The real clips stay out of the
repo (third-party media); replays of their pose frames are summarised in
the classification section.

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

---

# P0 — evidence-grounded squat clip review (MediaPipe)

Experimental spike, separate from the MoveNet analyzer above (which is
untouched). Route `/dashboard/workouts/setvision/squat`, linked from the
SetVision page. **Scope: bodyweight squat, side-on fixed camera, one person,
uploaded clip ≤ 30 s / ≤ 150 MB.** It answers "which movement cycles happened
and where in the video", with traceable evidence — not "was the squat good".

## Pipeline

```
File → validateVideoFile (type/size)            lib/setvision/squat-p0/extract.ts
     → openDecodedVideo + validateDecodedMedia  components/setvision/squat-p0/browser-media.ts
       (first frame must decode; duration finite and ≤ 30 s)
     → sampleObservations: seek → detect → yield, 10 Hz, one frame in flight
       (seek reports whether a NEW frame was decoded; stale frames skip pose)
     → MediaPipe Pose Landmarker (VIDEO mode, numPoses 2, GPU → CPU fallback)
     → PoseObservation[]                         lib/setvision/squat-p0/types.ts
     → quality gate (per frame + clip)           quality-gate.ts
     → 2D knee angle → median-of-3               rep-counter.ts
     → streaming state machine → RepEvent[]      rep-counter.ts
     → SquatAnalysis (ANALYZED | INSUFFICIENT_EVIDENCE)   analyze.ts
     → review UI                                 components/setvision/squat-p0/squat-p0-analyzer.tsx
```

The engine (`lib/setvision/squat-p0`) is DOM-free and deterministic: it only
accepts `PoseObservation { timestampMs, timestampSource, frameStatus?,
frameWidth, frameHeight, poseCount, landmarks }`. Timestamps are media time
(the seek target the decoder settled on), never wall-clock. Coordinates are
MediaPipe normalized image coordinates; all angles are 2D image-plane angles
in pixel space — not 3D joint angles. `z`/world landmarks are unused.

**Dependency.** `@mediapipe/tasks-vision@0.10.17` is resolved from
node_modules, where it is pinned exactly by `@react-three/drei`. It is **not
yet a direct dependency** because package.json / package-lock.json carry
unowned uncommitted changes; declare it directly (exact `0.10.17`) once those
are resolved. The WASM runtime is loaded from jsDelivr at the same pinned
version and the `pose_landmarker_full` model from Google's model bucket. Only
those two downloads leave the browser; video frames and landmarks never do.
Nothing is persisted, no workout/database write exists, Dante is not involved.

## Operational counting criterion

A cycle starts when the knee angle leaves the standing band (< 150°, held
≥ 100 ms) and ends when it is back (≥ 155°, held ≥ 100 ms). Boundaries follow
the monotonic run around each crossing (start: walk back while the angle was
still falling ≥ 1°/sample; end: walk forward while it still rises).

| Outcome | Rule |
|---|---|
| COMPLETED | onset and end observed, no gap > 250 ms inside, min knee angle ≤ 120°, duration ≥ 400 ms |
| PARTIAL | as above but min knee angle stayed > 120° |
| UNCERTAIN | onset before first usable frame, gap 250–1000 ms inside, tracking lost (> 1000 ms, state resets), video ended mid-cycle, or < 400 ms |
| INSUFFICIENT_EVIDENCE (clip) | < 10 usable frames or < 50 % usable, > 20 % multi-person frames, > 5 % bad timestamps, > 10 % stale (undecoded) frames, not side-on, or never seen standing — no count is shown |

COMPLETED certifies none of: depth, technique, safety, competition validity,
prescribed ROM, injury risk. A pause changes no condition; a bounce inside a
cycle is a `reversal`, not a new rep. Every threshold lives in
`lib/setvision/squat-p0/config.ts`; **none has been empirically evaluated**.
The onset rule was revised once after the first real clip showed the
original "within 3° of the standing peak" rule anchoring starts 1.6–3.6 s
early (knees drift while standing) — that clip is therefore not an
independent test of boundary timing.

## Quality checks and their status

| Check | Status |
|---|---|
| Frame timestamps (finite, increasing) | IMPLEMENTED_AND_MEASURED (deterministic, unit-tested) |
| Every sampled position decoded (stale-frame detection via `getVideoPlaybackQuality`) | HEURISTIC_ONLY (browser-dependent) |
| Single person (detector returns > 1 pose → frame discarded) | HEURISTIC_ONLY |
| Hip/knee/ankle/shoulder visibility ≥ 0.5 on one locked side | HEURISTIC_ONLY |
| Joints inside frame | HEURISTIC_ONLY |
| Tracking continuity (hip jump > 0.5 × leg length) | HEURISTIC_ONLY |
| Side-on view (median hip separation ≤ 0.35 × torso) | HEURISTIC_ONLY |
| Feet/camera stayed put (ankle drift, warn only) | HEURISTIC_ONLY |
| Camera stability | NOT_IMPLEMENTED — fixed camera required |
| Lighting | NOT_IMPLEMENTED — shows up only as low visibility |

No athlete lock: frames with two detected people are discarded, never
re-assigned. Stale landmarks are never reused across a gap.

## Evaluation status

`lib/setvision/__tests__/squat-p0.test.ts` is **synthetic** (logic only).
Real-world counting accuracy is **not established**
(REAL_WORLD_COUNTING_EVALUATION = BLOCKED): no independently annotated
bodyweight side-view clips exist. A local spot check on openly licensed
Wikimedia Commons clips (not committed; author-annotated, not independent)
is recorded in the P0 hand-off only. Known failure modes seen there: a hip
hinge to pick up equipment counts as COMPLETED (any knee-flexion cycle
matches the criterion); a rear-oblique barbell clip passed the side-view
check (0.29).

Protocol for a real evaluation: ≥ 30 consenting clips (varied people, light,
phones), two independent annotators marking each rep's start / turning point
/ end and partial vs full, CVAT offline if needed; report count absolute
error, boundary error, partial-rep confusion, false positives per clip,
abstention precision/recall on deliberately bad clips, processing time per
device class. Thresholds may only be tuned on a split that is not then used
to report accuracy.

## Performance and limits

Desktop Chrome (GPU delegate): ~35 ms mean inference, ~17 s for a 30 s clip.
The **first inference blocks the main thread ~3 s** (GPU warm-up) — the one
measured long task; every later frame yields. A Web Worker (ImageBitmap
transfer, classic worker for tasks-vision 0.10.17) is the upgrade path.
Mobile devices are unmeasured. `requestVideoFrameCallback` does not fire on
the detached analysis video, so timestamps are seek targets (true frame PTS
≤ target by < 1 frame).

## Future live adapter (Form Coach) requirements

A camera adapter must emit the same `PoseObservation`s with
`timestampSource: "frame"` from `requestVideoFrameCallback` media time, feed
`createSquatRepCounter().push()` with a 1-sample smoothing delay, lock the
side from the first ~1 s instead of the whole clip, and never call
`finish()` until the session ends. Live cues, athlete-follow framing and form
grading are out of scope until counting has been evaluated.
