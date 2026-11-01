# SetVision

Computer vision for resistance training: one pose-based rep engine per
movement family (squat, hinge, horizontal/vertical press, vertical/horizontal
pull, curl, triceps extension, lateral raise) plus a manual review workflow
for every exercise, custom ones included.

## Multi-exercise movement families (2026-11-02)

Every engine follows ONE 2D joint angle through `rest → working end → rest`
(`lib/setvision/exercise-config.ts`). `rest` says which end the rep starts at
(squat/bench/pulls/curl: joint open; overhead press, pushdown, overhead
extension, lateral raise: joint closed — the angle is negated inside the
shared state machine). `outbound` says whether leaving the rest position is
eccentric (squat, bench, hinge) or concentric (pulls, curl, presses from the
rack, extensions, raises), so tempo is labelled per movement and the save
contract validates it in the same direction.

| Engine id (DB value) | Family | Signal | Rep criterion | Views | Capability | Real-pose evidence (clip → counted / visible) |
|---|---|---|---|---|---|---|
| `squat` | Knee-dominant | knee angle, per-frame best side | ≥160° → ≤90° → ≥160° | side (front: no range) | **VERIFIED** (free squat only) | 5 real squat clips (prior sessions) unchanged |
| `deadlift` | Hip hinge | hip angle, per-frame | ≥165° → **≤110°** (was 70°) → ≥165° | side (other: no range) | experimental | real rear-oblique deadlift 2/2 (was 0); rendered side clip 0 (MoveNet loses the lifter 3–4 s) |
| `bench_press` | Horizontal press | elbow, per-clip side | ≥150° → ≤90° → ≥150° | side / raised front-oblique | experimental | rendered flat bench 2/2, rendered incline 2/2; real head-on machine chest press 0 (depth motion) |
| `vertical_press` | Vertical press | elbow, per-clip | ≤90° (rack) → ≥145° overhead → ≤90° | front/back | experimental | real CDC machine OHP 2 of 3 (1 lost to a 1.2 s tracking gap, flagged); rendered DB press 2 |
| `vertical_pull` | Vertical pull | elbow, per-clip | ≥145° hands overhead → ≤90° → ≥145° | front/back | experimental | real pulldown compilation: 1 full + 1 cut-off (flagged); rendered pull-up 2/2 |
| `horizontal_pull` | Horizontal pull | elbow, per-clip | ≥145° → ≤100° → ≥145° | side / front-oblique | experimental | rendered bent-over row 2 of 3 (1 flagged) |
| `elbow_flexion` | Curl | elbow, per-clip | ≥140° → ≤70° → ≥140° | side (front: no range) | experimental | real edited EZ-bar curl clip 7 of 10 (3 flagged uncertain, 0 invented) |
| `triceps_pushdown` | Elbow extension (elbows down) | elbow, per-clip | ≤105° → ≥150° hands down → ≤105° | side | experimental | synthetic only — `REAL_WORLD_EVALUATION_BLOCKED` |
| `overhead_triceps_extension` | Elbow extension (overhead) | elbow, per-clip | ≤90° → ≥145° overhead → ≤90° | side | experimental | synthetic only — `REAL_WORLD_EVALUATION_BLOCKED` |
| `lateral_raise` | Shoulder abduction | hip–shoulder–elbow, per-clip | ≤35° → ≥70° (not overhead) → ≤35° | front/back only (side refused) | experimental | synthetic only — `REAL_WORLD_EVALUATION_BLOCKED` |

Per-clip engines pick ONE side for the whole clip (the most-moving of the
well-tracked sides): per-frame side switching put ±50° jumps into real
oblique-view presses, and a one-arm exercise must follow the working arm.
Before counting they refuse (`abstainReason`, shown as *unsupported input*):
a refused camera view, no clearly tracked limb, or less visible joint travel
than one rep needs. After counting, each rep's **body position** is checked
on the frames around it (e.g. pulls need the hands overhead with the arms
extended; curls need the upper arm down by the body): reps that fail are
`excluded` events, and if none passes the clip is refused — choosing
"Lat Pulldown" does not turn a curl into pulldown reps. Seen-but-uncounted
movements are reported as `partial` (left rest, never reached the working
end), `uncertain` (tracking lost / clip ended mid-rep) or `excluded`.

Only `squat` and `deadlift` keep a bar proxy; every other engine reports no
speed, velocity loss or bar path (null — no bar, dumbbell, cable or machine
part is tracked). Joint range is reported only from the engine's
`rangeViews`.

**What pose alone cannot separate** (so Auto-detect lists candidates and
the user's choice decides): overhead press ≈ pulldown/pull-up ≈ overhead
triceps extension ≈ an incline press (all: arms overhead at extension);
curl ≈ pushdown ≈ a front-oblique bent-over row (arms down, elbow
flexing); squat ≈ lunge ≈ leg press (knee flexion); lateral ≈ front raise
from the side. Position checks catch *clearly* wrong choices (a curl as a
pulldown, a bench press as an overhead press, an overhead press as a row),
not every mislabel.

**Catalogue coverage** (`exercise-selection.ts::CATALOGUE_COVERAGE`, a test
fails if the catalogue gains an unlisted exercise): 66 catalogue exercises +
7 SetVision-only movements = 73 options. Catalogue: 1 verified (Barbell Back
Squat), 38 experimental, 27 manual review (SetVision-only: 1 verified, 5
experimental, 1 manual — Lunge). Manual review, with the reason
shown in the selector: cable/seated fly, reverse pec deck, rear-delt flies
(arc across the body), leg press, leg extension, seated/lying/standing leg
curls, split squats, step-up, calf raises (no heel/toe keypoints), hip
thrust, glute bridge, crunches, leg/knee raises, plank (no reps), landmine
press. Hack squat and Smith squat use the squat engine but are experimental.

**Auto-detect** (`analyze.ts::suggestExercise`): the squat/deadlift/lying
press classifier runs first, unchanged. If it abstains and the squat/hinge
engines count no leg reps, every arm engine is tried; engines that count
position-checked reps become candidates — one → a suggestion, several → "Could
be: A, B, C", none → abstain. Arm suggestions carry no score (nothing to
calibrate against). On the real/rendered clips it never produced a single
wrong guess: every arm clip returned a candidate list containing the true
movement, the head-on chest press and all squat clips abstained.

**Manual review and persistence.** Every exercise — custom included — gets:
play/seek, *Mark rep start/end* at the video time, *Not a rep* on automated
reps, notes (≤ 1000 chars), "I'm not sure" flag, Save, and reload under Saved
analyses. The review is stored in `per_rep.review` apart from the engine's
numbers. A save with no engine stores `exercise = 'manual_review'` with
`reps`/`confidence` NULL — migration
`20261102090000_setvision_multi_exercise.sql` (additive: widens the exercise
CHECK, drops NOT NULL on those two columns; RLS unchanged; **not applied to
hosted** — review before running). A custom name is re-validated by the
server and kept on that row only; nothing is written to the catalogue,
workout sets or performance history. Dante's SetVision context
(`load-setvision-context.ts`) keeps only VERIFIED-engine rows.

**Real-pose regression fixtures**: `lib/setvision/__tests__/real-pose/`
(MoveNet keypoints only, CC BY 3.0 / public-domain sources and attribution
in its README; several are rendered animations and say so). The counts in
`real-pose.test.ts` were checked by eye against frame sheets — behaviour
pins, not accuracy figures. No labelled multi-exercise benchmark exists, so
no accuracy number may be quoted for any engine.

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
   Below 0.15× the hips overlap → side-on. Between the two bands the view is
   **"uncertain"** (e.g. an angled camera), and with too few frames showing
   both hips and shoulders it is **"unknown"** — both abstain too. The 0.15
   band is a-priori (real side-view clips measured 0.02–0.04, a rear-angled
   squat 0.30); it is **not a validated oblique-view detector**.
3. Verified side-on view only: squat vs. deadlift by the ratio of robust
   (p95 − p5) knee-flexion range to hip-flexion range. ≥ 0.8 → squat (knee
   and hip bend together); ≤ 0.55 → deadlift (hip-dominant hinge); between
   → abstain. Under 30° of movement on both joints → abstain.
4. A squat pattern whose hands are at or below the knees in ≥ half of the
   deep frames (clearly tracked wrist + same-side knee) → abstain: pose
   alone cannot tell a squat-depth equipment pickup from a squat holding
   weights low (or a hinge).

Every Auto-detect result is only a **suggestion**: the UI shows it as
unverified and nothing exercise-specific is displayed until the user
confirms it or picks another exercise (see UI below).

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
| barbell back squat (rear-oblique, 7 s) | squat, 2 reps | deadlift, 1 rep | squat, 2 reps → R2: abstain (view uncertain, 0.30) |
| CDC half squat (front/oblique) | squat | deadlift | abstain (front view) |
| goblet squat (front/oblique) | squat | deadlift | abstain (front view) |
| deadlift demo (rear-oblique, real person) | deadlift | squat | abstain (front/rear view) |
| deadlift (side, rendered mannequin) | deadlift | deadlift | abstain (knee/hip ratio 0.70) |

Correction round 2 (same day, independent review): the rear-oblique clip
now abstains instead of being labelled from projected angles; the two side
kettlebell clips are still suggested as squat and no real clip produced a
false pickup flag.

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

Each rep reports `rangeDeg`: the observed 2D change of the primary joint
angle from the standing/lockout angle just before the descent to the
deepest angle. It is reported **only when the camera is verified side-on**
(a front or angled view projects the angle), and a rep whose range is not
a possible joint range (non-finite, ≤ 0° or > 180°) gets **no entry**, never
a made-up value. The UI shows degrees.

`romPercent` (range ÷ a rough per-exercise reference, `exercise-config.ts`)
is still computed for benchmarks and old rows, but **not shown**: the
reference ranges are uncalibrated ballpark figures and full-depth reps on
real side-view squats read 169–191% — the >100% values were systematic, not
"very mobile lifters". (Before R2 the range also started at the descent
threshold, ~155°, not the true standing angle.)

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

1. **Exercise** (`exercise-picker.tsx`): ONE searchable combobox (ARIA 1.2
   combobox + listbox; ↑/↓/Enter/Escape, focus stays in the input). Empty
   query lists all 73 options grouped by category with capability badges;
   typing searches names + aliases (accent/case-insensitive) and offers
   "Use “…” as a custom exercise" (≤ 80 chars, validated, rendered as text,
   never added to the catalogue). *Auto-detect (Experimental)* is one entry
   in the same list. No recent-selection list: no selection history is
   persisted.
2. **Capability** — `ANALYSIS_VERIFIED` (squat), `ANALYSIS_EXPERIMENTAL`
   (every other engine; not sent to Dante), `MANUAL_REVIEW_SUPPORTED`
   (no engine, with the reason). The selected-exercise card states the
   engine's rep criterion and supported views.
3. **Video** → Analyze → pose frames (live overlay via
   `components/form-coach/pose-overlay-canvas.tsx`). The analysis is
   **derived** from the current video's frames + the current pick, so
   switching exercise re-derives it (or removes it for a label-only pick)
   and can never show another movement's numbers; save/Dante state is tied
   to the analysis it was produced for. The video and its frames are kept
   across mode switches. States: invalid video, processing, insufficient
   evidence (0 reps), save failure (retry), saved.
4. Results panel: identity provenance (catalogue / SetVision list / custom /
   confirmed suggestion) shown separately from **analysis quality** (from
   tracking visibility, rep count, torso visibility only — choosing the
   exercise cannot raise it; uncalibrated band, never a %).
5. **Saved analyses** (`saved-analyses.tsx`): the caller's latest saves,
   each restorable from the DB — rep timeline included — with the video
   from private storage (signed URL) for seeking.

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

**Save contract (R2).** `per_rep` = `{ rom, tempo, videoDurationMs,
identity }`. Before R2 the route's nested zod schema listed only
`repNumber/eccentricSec/pauseSec/concentricSec` for tempo, and zod strips
unknown keys — so every phase timestamp was silently dropped while the save
returned `ok`. `lib/setvision/saved-analysis.ts` is now the one schema:
finite, ranged numbers; per rep the descent/bottom times and eccentric/hold
durations are all present or all null; phase times in order; each duration
within 0.011 s of its own timestamps; reps don't overlap; nothing past the
declared video duration (+100 ms sampling slack); `reps` = timeline length.
Inconsistent → 400, nothing stored. The exercise identity is re-resolved
server-side from the option key (label/catalogue id never taken from the
client); label-only/custom picks are refused. Linked workout rows and the
video path must be the caller's own. No migration was needed (identity and
duration ride in `per_rep`). `restoreSavedAnalysis` reads every historical
shape (null `per_rep`, timestamp-less tempo, %-only ROM) without inventing
values; such rows show "saved before phase times were stored".

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
- `app/api/setvision/results` (POST/GET) — persist / list analyses;
  `GET ?id=` restores one of the caller's analyses in full (another user's
  id is a 404).

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
them fail against the pre-correction code. R2 adds (same file):
uncertain/unknown-view abstention, squat-depth pickup (auto abstains;
manual sets it aside only as an outlier among hands-high reps; an
all-hands-low set is counted and flagged, never suppressed), low-score /
NaN auxiliary keypoints, no NaN/Infinity in output, joint range in degrees
and impossible ranges, manual choice not raising the quality score.
`exercise-selection.test.ts` (catalogue ids, no duplicates, search/aliases,
capability routing, custom-name validation), `saved-analysis.test.ts`
(timeline kept, inconsistent timelines rejected, historical rows) and
`app/api/setvision/results/__tests__/results.db.test.ts` (real local DB:
save → DB jsonb → reload, cross-tenant 404, foreign workout/video refused,
legacy row restore, no workout-history writes). The real clips stay out of the
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
  benchmarked. Auto-detect is therefore suggestion-only.
- **Only squat is a supported analysis.** Deadlift is experimental (no real
  clip counted); bench press and every other exercise are label-only.
- **Squat-depth pickup handling is a heuristic** (hands vs knees at the
  deepest frame): it can miss a pickup filmed with the hands occluded and
  cannot separate a genuine hands-low set from repeated pickups.
- **View bands are a-priori**: "uncertain" is not an oblique-view detector.

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

## Live adapter

Implemented as Form Coach P1A (below). It follows the requirements this
section used to list, with one change: timestamps come from the performance
clock, not `mediaTime` (see "Timestamps").

# Form Coach P1A — live camera rep counting (pilot)

Route `/dashboard/workouts/form-coach/live`, linked from Form Coach and from
the P0 squat page. **Scope: bodyweight squat, side-on fixed camera, one
person, set ≤ 180 s.** Technical pilot: counts movement cycles live with the
P0 engine, then the user reviews and corrects them. No recording, upload or
persistence; no workout, set or PR mutation. The older MoveNet Form Coach
(`/dashboard/workouts/form-coach`, squat/push-up/plank cues) is untouched.

## Pipeline

```
Start camera (click) → getUserMedia {audio:false}       lib/form-coach/live-camera.ts
  → <video> → requestVideoFrameCallback (rAF fallback)   components/form-coach/live/live-squat-coach.tsx
  → createFrameScheduler: ≥ ~100 ms apart, never queued  lib/setvision/squat-p0/live.ts
  → MediaPipe detectForVideo (sync → one inference at a time; P0 createPoseLandmarker, numPoses 2)
  → PoseObservation { timestampSource: "clock" }
  → setup: assessReadiness (last 1 s)                     live.ts
  → set:   createLiveSquatSession(side locked at setup)
           createFrameAssessor (P0 frame gate) → median-of-3 one sample late
           → createSquatRepCounter().push / interrupt
  → End Set: finish() → assembleSquatAnalysis (P0 clip-level gate) → review
```

The live session is the clip engine driven one frame at a time. On an
uninterrupted stream its events equal `analyzeSquatObservations` on the same
observations and side (unit-tested, including a short gap and a recovered
tracking loss). Shared, not copied: `createFrameAssessor` (quality-gate.ts),
`assembleSquatAnalysis` (analyze.ts), the counter, `applyCorrections`,
`createPoseLandmarker`/`toObservationParts`, the P0 review rows and the
SetVision exercise picker (Auto-detect hidden for live).

**Timestamps.** `captureTime ?? presentationTime` of the rVFC metadata —
both on the monotonic `performance.now()` clock — minus the Start Set time,
rounded to ms. Chrome reported `captureTime` for the fake camera; the basis
on the physical camera was not recorded (no set was run on it). `mediaTime` is not used: a timer tick (below) has to compare
"now" with frame times, and that only works if both are on one clock.
Wall-clock time is never used. Dropped frames are not movement evidence: they
only widen the gap between valid samples, which the P0 bridge/gap/lost rules
already handle.

**Scheduling.** A frame is analysed only if ≥ 98 ms after the last analysed
one, and never while an inference is running (structurally impossible today,
since `detectForVideo` is synchronous, but the guard stays for a worker).
Skipped frames are discarded, not queued. A 250 ms timer calls `tick()`, so
a camera that stops sending frames still pauses counting and closes the open
cycle. The first inference (GPU warm-up, ~4.8–5.0 s blocking) runs once
behind a "warming up" overlay before setup.

## Live states and interruption rules

| State | Rule |
|---|---|
| Ready / Adjust camera / Cannot verify | Last 1 s (≥ 6 analysed frames): > 20 % two-person frames → Adjust; > 50 % no person, or no person as the dominant issue → Cannot verify; < 80 % frames pass the P0 gate → Adjust (dominant issue); P0 side-view check fails → Adjust; latest knee < 155° → "stand tall"; knee swing > 13° → "hold still". Framing only, HEURISTIC_ONLY, not technique. |
| Counting | a valid frame within the last 250 ms |
| Counting paused | no valid frame for > 250 ms (shows the frame issue) |
| Tracking lost | > 1000 ms: the open cycle closes UNCERTAIN `tracking_lost` **immediately**, state → unknown |
| Paused (user / page hidden) | `interrupt("session_interrupted")`; frames ignored; Resume restarts from "unknown" and needs a standing frame. The ascent seen after Resume is its own UNCERTAIN `onset_not_observed` fragment and is never joined to the descent before the pause |
| Frame size change (rotation) | treated as an interruption |
| Camera track `ended` mid-set | the set ends into review with a notice |
| Live view warning | every ~1 s the set-so-far is re-checked with the clip side-view rule; failing → "this set will probably not be confirmed" |
| End Set | open cycle → UNCERTAIN `video_ended_mid_cycle`; clip-level gate; on INSUFFICIENT_EVIDENCE the live cycles are still listed, marked unconfirmed |

Review: completed / partial / uncertain, tracking-loss intervals and
interruptions, per-cycle relabel and "add a rep the camera missed"
(`RepCorrection`, `by: "user"`; detected events never mutated), JSON
download, Discard. There is no recording, so there is nothing to seek to.

## Movement-family live compatibility

| Family / engine | Live status | Why |
|---|---|---|
| Bodyweight squat — P0 MediaPipe engine | **LIVE_PILOT_TESTED** (camera-like input only) | Streaming counter + frame gate exist. Run on real footage through Chrome's fake camera and a lifecycle check on a physical camera. No independent accuracy data. |
| Squat (MoveNet `exercise-config` engine, "Verified" for uploads) | TECHNICALLY_COMPATIBLE_UNVERIFIED | Different pose model (MoveNet COCO-17), per-frame side, clip-level abstention. A live port would need a second pose model or a MediaPipe→COCO keypoint map. Not wired. |
| Hip hinge (deadlift) | TECHNICALLY_COMPATIBLE_UNVERIFIED | Same push-based `createRepStateMachine`, per-frame side. Unvalidated even for uploads. |
| Horizontal / vertical press, vertical / horizontal pull, curl, triceps pushdown, overhead extension, lateral raise | INSUFFICIENT_EVIDENCE | Per-clip side choice and the body-position check are computed over the whole clip. Live would need both locked at setup, and none of these engines has been validated even on uploads. |
| Every manual-review exercise | NOT_COMPATIBLE | No movement model. |

Adapter design for the next family: map MediaPipe landmarks to the COCO
names `exercise-config` uses (`left_shoulder` = 11 …), lock the side and run
the `PositionCheck` on the setup window, then feed the push-based
`createRepStateMachine` per frame. No second family is exposed in the live
UI; the picker sends every non-squat exercise to SetVision upload.

## Measured (2026-11-02, dev laptop, Chrome stable via Playwright, GPU delegate)

Camera-like input = Chrome `--use-fake-device-for-media-stream
--use-file-for-fake-video-capture` with MJPEG transcodes of the openly
licensed Wikimedia `kb-side-A` clip (640×480, 30 fps, looped by Chrome).
**This is not a physical-camera or mobile-device benchmark.**

| Metric | 32 s set @390 px | 14 s sets @320/768/1440 |
|---|---|---|
| Analysed frames / s | 8.4 (target 10) | 8.4–8.5 |
| Inference mean / p95 / max | 42 / 54 / 65 ms | 43–47 / 54–58 / 59–65 ms |
| Frame → result mean / p95 | 46 / 59 ms | 48–52 / 60–64 ms |
| Rep confirmed → on screen | mean 52, max 63 ms (5 reps) | 47–57 ms |
| Long tasks during the set | ~2 / s, 50–65 ms each (each inference + render) | same |
| GPU warm-up (first inference) | 4.8–5.0 s, blocking, before setup | same |
| JS heap | ~105 MB | 103–105 MB |

Same-input consistency (not accuracy): two 32 s live sets on the looped clip
both gave C, C, U, C, C. That is the same cycle sequence the upload path finds
on the same footage, with boundaries within ~0.2 s. The U is the clip's loop
point, which "teleports" the person (tracking jump). On the physical
Integrated Camera (1280×720) only the lifecycle was checked: permission,
preview, readiness verdicts from real frames, Turn off, restart, and tracks
stopped on route change. No squats were performed in front of it, so it gives
no counting or performance evidence.

**Worker execution — investigated, not done.** Steady state blocks the main
thread ~50 ms per analysed frame (~40 % duty at 8.4 Hz). The UI stayed
operable in every journey (Pause/End/keyboard), but input can wait up to one
inference. Moving `detectForVideo` to a worker (ImageBitmap transfer;
tasks-vision 0.10.17 needs a classic worker) would remove both that and the
warm-up freeze. It is the first P1B performance item.

## Known limitations (measured)

- **Second person — multi-person abstention FAILS on the test input.** In
  VIDEO (tracking) mode MediaPipe does not reliably report a person who walks
  in. Composite test (second real squatter visible for 2.5 s beside the
  athlete): in one run it returned 2 poses for ~0.4 s and the overlapping
  cycle was UNCERTAIN; in the rerun it never returned 2 poses, so nothing was
  discarded for that reason. A second person, or one tracked *instead of*
  the athlete, is not reliably detected. The only other guard is the
  hip-discontinuity rule. No identity tracking is claimed. Candidate fixes
  for P1B: periodic IMAGE-mode re-detection, or a person-count check on a
  separate detector.
- A borderline oblique view passes the 1 s setup check; the live view
  warning and End Set abstention catch it (real goblet clip).
- Effective rate is ~8.4 Hz, not 10: rVFC drops frames while the main
  thread is busy (~220 per 32 s not delivered).
- Mobile devices, Safari and Firefox are unmeasured.

## P1A accuracy-evaluation criteria (proposed, not run)

≥ 30 consenting live sessions recorded *alongside* the live run (the
recording is for annotation only and is never part of the product), ≥ 10
people, ≥ 3 phone models + 1 laptop, varied light, side view; two independent
annotators mark each rep's start / turning point / end and full vs partial.
Report: per-set count absolute error (target median 0, ≤ 1 in ≥ 90 % of sets),
false COMPLETED per set (target ≤ 0.1), boundary error vs annotation (median
≤ 200 ms), UNCERTAIN rate on clean sets, abstention precision/recall on
deliberately bad setups (frontal, two people, partial body, hand-held),
pause/loss behaviour (no joined phases), and live-vs-upload agreement on the
same recording. Device metrics per class: analysed fps, inference p95,
rep-to-screen p95, warm-up time, heap after 3 sets. Thresholds may only be
tuned on a split that is not then used to report.

## Tests

`lib/setvision/__tests__/form-coach-live.test.ts` (24, synthetic): scheduler,
live == clip equivalence, unique emission, phases, pause/loss/stall/
mid-rep start/two people/frame size, live view warning, End-Set abstention,
corrections provenance, readiness, camera error mapping, no-network/DB source
guard. Browser harness (session scratchpad, not committed): main journey at
320/390/768/1440, tracking loss, second person, oblique, pause + route
change, denied, simulated device errors, unsupported exercise, keyboard, and
the physical-camera lifecycle.
