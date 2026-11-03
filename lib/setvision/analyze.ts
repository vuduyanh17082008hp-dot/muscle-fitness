import {
  classifyExercise,
  estimateCameraView,
  handsAtOrBelowKnees,
  percentile,
  robustRange,
  type CameraView,
} from "@/lib/setvision/exercise-classifier";
import { confidentPoint, getExerciseConfig, sideAngle, type ExerciseConfig, type Side } from "@/lib/setvision/exercise-config";
import { averageTorsoLength } from "@/lib/setvision/normalization";
import { checkPersonAttribution, classifySceneChanges, credible } from "@/lib/setvision/person-check";
import {
  assessableLength,
  describeBoundaries,
  findBoundaries,
  IDENTITY_BREAKING,
  MIN_SEGMENT_MS,
  partition,
  sanitizeFrames,
  spanLabel,
  trackJumpSpans,
  type Boundary,
  type Segment,
} from "@/lib/setvision/segments";
import type { ReviewScope } from "@/lib/setvision/visual-review";
import { createRepStateMachine } from "@/lib/setvision/rep-state-machine";
import { computeAllRepRom } from "@/lib/setvision/rom";
import { computeTechniqueConsistency } from "@/lib/setvision/technique-consistency";
import { averageConcentricTime, averageEccentricTime, computeAllRepTempo } from "@/lib/setvision/tempo";
import { computeVelocity } from "@/lib/setvision/velocity";
import type {
  CompletedRep,
  ExerciseClassification,
  MovementEvent,
  PoseFrame,
  SegmentReport,
  SetVisionAnalysis,
  SetVisionExerciseId,
  TimedPoseFrame,
} from "@/lib/setvision/types";

/**
 * analyzeWorkoutVideo() (spec Part B §21, §27's `setvision.analyzeWorkoutVideo()`).
 *
 * Input is already-extracted pose frames with timestamps — this
 * module has no opinion about WHERE those frames came from (a live
 * webcam loop or an uploaded video's <video> element run through the
 * exact same lib/ai.ts::loadPoseDetector() loop; see
 * components/setvision/video-analyzer.tsx for the uploaded-video
 * path). That separation keeps the algorithmic core testable with
 * plain synthetic data, with no DOM/video/TensorFlow dependency.
 */

const MIN_VISIBILITY_RATIO = 0.7;
/** First classification signal when the user picked the exercise — the UI keys off it to say so. */
export const MANUAL_SELECTION_SIGNAL = "Exercise was selected manually, not auto-detected.";
const MIN_REPS_FOR_RELIABLE_CONSISTENCY = 3;

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function emptyAnalysis(
  exercise: SetVisionExerciseId,
  classification: SetVisionAnalysis["exerciseClassification"],
  limitations: string[],
  abstainReason: string | null = null,
): SetVisionAnalysis {
  return {
    exercise,
    exerciseClassification: classification,
    reps: 0,
    romConsistency: null,
    averageEccentricTime: null,
    averageConcentricTime: null,
    velocity: {
      calibrated: false,
      unit: "torso-lengths/s",
      perRep: [],
      mean: null,
      peak: null,
      final: null,
      velocityLoss: null,
    },
    technique: {
      romConsistency: null,
      tempoConsistency: null,
      barPathConsistency: null,
      asymmetryDeg: null,
    },
    confidence: 0,
    perRep: { rom: [], tempo: [] },
    limitations,
    abstainReason,
    measuredSide: null,
    events: [],
  };
}

const MIN_SIDE_FRAMES = 5;
const VIEW_TEXT: Record<"side" | "frontal", string> = { side: "side-on", frontal: "front or back" };

/**
 * One body side for the whole clip (per-clip engines): among the sides
 * tracked in at least half as many frames as the best-tracked one, the side
 * whose angle moves the most — the working arm of a one-arm exercise, and
 * the near arm of an oblique view. Null when neither side is tracked enough.
 */
export function chooseMeasuredSide(frames: PoseFrame[], joints: [string, string, string]): { side: Side; angles: number[] } | null {
  const sides = (["left", "right"] as const).map((side) => ({
    side,
    angles: frames.map((f) => sideAngle(f, side, joints)).filter((v): v is number => v !== null),
  }));
  const mostTracked = Math.max(...sides.map((s) => s.angles.length));
  if (mostTracked < MIN_SIDE_FRAMES) return null;
  const eligible = sides.filter((s) => s.angles.length >= MIN_SIDE_FRAMES && s.angles.length >= mostTracked / 2);
  return eligible.reduce((best, s) => (robustRange(s.angles) > robustRange(best.angles) ? s : best));
}

const median = (values: number[]) => (values.length ? percentile(values, 50) : null);

/** Frames either side of a rep that still belong to it (its rest position before and after). */
const REP_WINDOW_MS = 500;

type PositionVerdict = "pass" | "fail" | "unknown";

/**
 * The chosen movement's body-position check (exercise-config.ts `position`)
 * for ONE counted rep: only the frames around that rep at the checked end of
 * the movement are used, so walking up to the machine or adjusting the seat
 * before the set cannot decide it. "unknown" = the joints it needs were not
 * clearly tracked there.
 */
function repPosition(frames: TimedPoseFrame[], rep: CompletedRep, config: ExerciseConfig, side: Side): PositionVerdict {
  const check = config.position!;
  const end = check.at === "high"
    ? Math.max(config.topAngleThresholdDeg, config.bottomAngleThresholdDeg)
    : Math.min(config.topAngleThresholdDeg, config.bottomAngleThresholdDeg);
  const from = (rep.startObserved ? rep.topAtMs : rep.bottomAtMs) - REP_WINDOW_MS;
  const to = rep.ascentEndAtMs + REP_WINDOW_MS;

  const atEnd = frames.flatMap(({ timestampMs, frame }) => {
    if (timestampMs < from || timestampMs > to) return [];
    const angle = sideAngle(frame, side, config.joints);
    return angle !== null && (check.at === "high" ? angle >= end : angle <= end) ? [frame] : [];
  });

  const shoulder = median(atEnd.map((f) => sideAngle(f, side, ["hip", "shoulder", "elbow"])).filter((v): v is number => v !== null));
  const wristDy = median(
    atEnd.flatMap((f) => {
      const w = confidentPoint(f, `${side}_wrist`);
      const sh = confidentPoint(f, `${side}_shoulder`);
      return w && sh ? [w.y - sh.y] : [];
    }),
  );

  const shoulderOk = check.shoulderDeg && shoulder !== null ? shoulder >= check.shoulderDeg[0] && shoulder <= check.shoulderDeg[1] : null;
  const wristOk = check.wrist && wristDy !== null ? (check.wrist === "above_shoulder" ? wristDy < 0 : wristDy > 0) : null;
  if (shoulderOk === false || wristOk === false) return "fail";
  return shoulderOk || wristOk ? "pass" : "unknown";
}

/**
 * Reasons a per-clip engine refuses the clip before counting: no clearly
 * tracked limb, a camera view the movement can't be seen from, or too little
 * visible joint motion. Null = analyse it. (Body position is checked per
 * counted rep, after counting.)
 */
function refusal(frames: PoseFrame[], config: ExerciseConfig, view: CameraView): { reason: string; side: Side | null } | null {
  if (config.refusedViews?.includes(view as "side" | "frontal")) {
    const allowed = config.rangeViews.map((v) => VIEW_TEXT[v]).join(" or ");
    return {
      reason: `The camera looks ${VIEW_TEXT[view as "side" | "frontal"]}, and from there a ${config.family.toLowerCase()} moves mostly toward or away from the camera. Film it ${allowed} instead.`,
      side: null,
    };
  }

  const measured = chooseMeasuredSide(frames, config.joints);
  if (!measured) {
    return { reason: `The ${config.joints.join(", ")} of one arm or leg were not clearly visible in enough frames to follow the movement.`, side: null };
  }

  const needed = Math.abs(config.topAngleThresholdDeg - config.bottomAngleThresholdDeg);
  const visible = robustRange(measured.angles);
  if (visible < needed) {
    return {
      reason: `Only about ${Math.round(visible)}° of ${config.signalLabel.split(" (")[0]} movement was visible on the ${measured.side} side (a rep needs ${needed}°). Either no full reps were done, or the movement went toward or away from the camera — try a ${config.rangeViews.map((v) => VIEW_TEXT[v]).join(" or ")} view.`,
      side: measured.side,
    };
  }

  return null;
}

/**
 * Movement-analysis quality from tracking evidence only. Deliberately has no
 * classification input: choosing (or confirming) an exercise resolves which
 * movement it is, it does not make the pose tracking any better.
 */
function deriveOverallConfidence(params: {
  visibilityRatio: number;
  repCount: number;
  hasTorsoLength: boolean;
}): number {
  let score = 0;
  let maxScore = 0;

  maxScore += 1;
  score += params.visibilityRatio;

  maxScore += 1;
  score += Math.min(1, params.repCount / MIN_REPS_FOR_RELIABLE_CONSISTENCY);

  maxScore += 1;
  score += params.hasTorsoLength ? 1 : 0;

  return round(score / maxScore, 2);
}

const secondsLabel = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Squat-depth pickup / put-down guard. Pose alone cannot tell picking a
 * dumbbell up from a squat rep: both bend the knees to depth. The one
 * difference it can see is the hands reaching the knees or lower at the
 * bottom. Such a rep is set aside ONLY as an outlier — when most reps with
 * clearly tracked hands kept them above the knees. When every rep is
 * hands-low (e.g. dumbbells held at the sides) nothing is dropped; the
 * count is flagged for the user to check instead, so genuine reps are
 * never suppressed wholesale.
 */
// ponytail: one deepest-frame check per rep; a per-rep hand-height trace is the upgrade if real clips disagree.
function excludePickupOutliers(reps: CompletedRep[], limitations: string[]): CompletedRep[] {
  const handsLow = reps.map((rep) => (rep.deepestFrame ? handsAtOrBelowKnees(rep.deepestFrame) : null));
  const known = handsLow.filter((v) => v !== null).length;
  const high = handsLow.filter((v) => v === false).length;
  const lowReps = reps.filter((_, i) => handsLow[i] === true);

  if (lowReps.length === 0) return reps;

  if (high > known / 2) {
    for (const rep of lowReps) {
      limitations.push(
        `A movement from ${secondsLabel(rep.topAtMs)} to ${secondsLabel(rep.ascentEndAtMs)} reached squat depth with the hands at or below the knees, unlike the other reps — it may be equipment being picked up or put down, so it was not counted.`,
      );
    }
    return reps.filter((_, i) => handsLow[i] !== true).map((rep, i) => ({ ...rep, repNumber: i + 1 }));
  }

  limitations.push(
    `The hands were at or below the knees at the bottom of ${lowReps.length} rep(s). From pose alone that cannot be told apart from picking something up or putting it down — check the rep count against the video.`,
  );
  return reps;
}

/**
 * Timestamps where the single-person tracker's body teleported between two close samples (see
 * segments.ts::trackJumpSpans — the jump is a segment boundary, never a reason to drop the whole clip).
 */
export function findTrackJumps(frames: TimedPoseFrame[]): number[] {
  return trackJumpSpans(frames).map((b) => b.endMs);
}

/** Frames that never went through the MultiPose person check (old recorded fixtures only). */
export const PERSON_CHECK_NOT_RUN =
  "No multi-person check ran on these frames, so another person in view could not be ruled out.";

export type SubjectGateResult =
  /** Attribution can't be trusted (edit, dissolve, tracker jump, more than one person, identity change): refuse every path. */
  | { verdict: "refuse"; reason: string }
  /** One consistent person, but the camera moved/zoomed: no tracking or reps; a limited AI review is still possible. */
  | { verdict: "camera_moved"; reason: string; limitations: string[] }
  | { verdict: "ok"; limitations: string[] };

/**
 * ONE subject gate for every SetVision path (tracked analysis and AI visual review). Identity and
 * camera stability are judged separately: an edit (cut or dissolve), a tracker jump, or a MultiPose
 * result that can't attribute the clip to one person refuses; camera motion alone only rules out
 * quantitative tracking. `limitations` are what still applies when it passes.
 */
export function subjectGate(frames: TimedPoseFrame[]): SubjectGateResult {
  const { cuts, dissolves, cameraMoves } = classifySceneChanges(frames);
  const edits = [...cuts, ...dissolves].sort((a, b) => a - b);
  if (edits.length > 0) {
    return {
      verdict: "refuse",
      reason: `The video cuts or fades to a different shot around ${edits.slice(0, 3).map(secondsLabel).join(", ")} (an edited clip), so whoever is in view afterwards can't be confirmed as the same athlete. Upload one continuous recording.`,
    };
  }
  const jumps = findTrackJumps(frames);
  if (jumps.length > 0) {
    return {
      verdict: "refuse",
      reason: `The tracked body jumped across the frame at ${jumps.slice(0, 3).map(secondsLabel).join(", ")} — the tracker likely switched to another person or lost you behind something, so reps and form could belong to the wrong person. Re-record with only you in view and nothing passing in front of the camera.`,
    };
  }
  const personCheck = checkPersonAttribution(frames);
  if ("reason" in personCheck) return { verdict: "refuse", reason: personCheck.reason };
  const limitations = personCheck.verdict === "not_run" ? [PERSON_CHECK_NOT_RUN] : personCheck.limitations;
  if (cameraMoves.length > 0) {
    return {
      verdict: "camera_moved",
      reason: `The camera moved or zoomed around ${cameraMoves.slice(0, 3).map(secondsLabel).join(", ")}, so reps, timing and range can't be tracked. Film from a steady camera (a tripod or a propped-up phone) for tracked analysis.`,
      limitations,
    };
  }
  return { verdict: "ok", limitations };
}

/** The AI review needs the person check to find exactly one person in at least this share of the clip for a full review. */
// ponytail: a-priori; seated machine clips scanned so far stay well above it.
export const MIN_SUBJECT_SHARE = 0.3;

/**
 * What the AI visual review may look at, decided on-device from the same subject gate, before any
 * frame is sent: a full review; a LIMITED one (camera moved but one consistent person; or only part
 * of a body in view and no sign of anyone else); or a refusal with the reason.
 */
export type AiReviewDecision =
  | {
      scope: ReviewScope;
      limitations: string[];
      /** When the clip has identity-breaking boundaries: the ONE part the stills must come from. */
      window?: { startMs: number; endMs: number; frames: TimedPoseFrame[] };
    }
  | { refuse: string };

export function aiReviewScope(frames: TimedPoseFrame[]): AiReviewDecision {
  const { frames: clean } = sanitizeFrames(frames);
  // Only boundaries that can change WHO is in view split the AI review; camera motion inside a part keeps the
  // existing limited "camera_moved" review.
  const breaks = findBoundaries(clean).filter((b) => IDENTITY_BREAKING.has(b.kind));
  if (breaks.length === 0) return wholeClipReviewScope(clean);
  const parts = partition(clean, breaks)
    .filter(assessableLength)
    .map((part) => ({ part, decision: wholeClipReviewScope(part.frames) }))
    .filter((x): x is { part: Segment; decision: Exclude<AiReviewDecision, { refuse: string }> } => !("refuse" in x.decision))
    .sort((a, b) => b.part.endMs - b.part.startMs - (a.part.endMs - a.part.startMs));
  const where = describeBoundaries(breaks);
  if (parts.length === 0) {
    return { refuse: `The video breaks at ${where}, and no part between those breaks could be attributed to one person on its own, so nothing was sent to the AI. Upload one continuous recording with only you in view.` };
  }
  const { part, decision } = parts[0];
  return {
    ...decision,
    limitations: [
      `The video breaks at ${where}. Only ${spanLabel(part.startMs, part.endMs)} was reviewed: the longest part that could be attributed to one person. Other parts were not sent, and nothing says they show the same athlete.`,
      ...decision.limitations,
    ],
    window: { startMs: part.startMs, endMs: part.endMs, frames: part.frames },
  };
}

function wholeClipReviewScope(frames: TimedPoseFrame[]): AiReviewDecision {
  const gate = subjectGate(frames);
  if (gate.verdict === "refuse") return { refuse: gate.reason };
  const onePerson = frames.filter((f) => (f.people ?? []).filter(credible).length === 1).length;
  const share = frames.length ? onePerson / frames.length : 0;
  if (gate.verdict === "camera_moved") {
    return share >= MIN_SUBJECT_SHARE
      ? { scope: "camera_moved", limitations: gate.limitations }
      : { refuse: `${gate.reason} The person check also couldn't follow one person through the clip, so the AI review can't be attributed to you.` };
  }
  return { scope: share >= MIN_SUBJECT_SHARE ? "full" : "partial_body", limitations: gate.limitations };
}

export function analyzeFrameSequence(
  frames: TimedPoseFrame[],
  options: {
    exercise?: SetVisionExerciseId | null;
    metersPerTorsoLength?: number | null;
    /** The Auto-detect result the user confirmed for `exercise` — kept as the provenance instead of "selected manually". */
    confirmedSuggestion?: ExerciseClassification | null;
  } = {},
): SetVisionAnalysis {
  const classification: ExerciseClassification = options.exercise
    ? options.confirmedSuggestion?.exercise === options.exercise
      ? options.confirmedSuggestion
      : { exercise: options.exercise, confidence: null, signals: [MANUAL_SELECTION_SIGNAL] }
    : classifyExercise(frames.map((f) => f.frame));

  const exercise = options.exercise ?? classification.exercise;

  if (!exercise) {
    return emptyAnalysis("squat", classification, [
      "Could not confidently classify the exercise from the video. Try again with the full lift visible, or specify the exercise manually.",
    ]);
  }

  const { frames: clean, dropped } = sanitizeFrames(frames);
  const droppedNote = dropped > 0 ? [`${dropped} unreadable or out-of-order video frame(s) were skipped.`] : [];
  const boundaries = findBoundaries(clean);
  if (boundaries.length === 0) {
    const single = analyzeSegment(clean, exercise, classification, options);
    return droppedNote.length ? { ...single, limitations: unique([...single.limitations, ...droppedNote]) } : single;
  }
  return analyzeSegments(clean, boundaries, exercise, classification, options, droppedNote);
}

const unique = (items: string[]) => [...new Set(items)].slice(0, 50);

type SegmentOptions = {
  metersPerTorsoLength?: number | null;
  /** The part began at an untrusted boundary: a movement already under way then started on the other side of it. */
  openedByBoundary?: boolean;
};

/**
 * Each part between untrusted boundaries is analysed on its own (fresh rep state, side, tempo, range, torso
 * scale, and its own person check). The headline is the ONE validated part with the most reps; the others are
 * listed, never added in: SetVision can't confirm that two parts show the same athlete.
 */
// ponytail: parts linked only by camera motion with the same tracker id could be combined; kept separate until identity evidence is calibrated.
function analyzeSegments(
  frames: TimedPoseFrame[],
  boundaries: Boundary[],
  exercise: SetVisionExerciseId,
  classification: ExerciseClassification,
  options: SegmentOptions,
  droppedNote: string[],
): SetVisionAnalysis {
  const clipMs = Math.max(1, frames[frames.length - 1].timestampMs - frames[0].timestampMs);
  const parts = partition(frames, boundaries).map((segment) => {
    const durationMs = segment.endMs - segment.startMs;
    if (!assessableLength(segment)) {
      return { segment, analysis: null as SetVisionAnalysis | null, reason: `Too short to assess on its own (${(durationMs / 1000).toFixed(1)} s; needs at least ${MIN_SEGMENT_MS / 1000} s).` as string | null };
    }
    const analysis = analyzeSegment(segment.frames, exercise, classification, { ...options, openedByBoundary: segment.after !== null });
    const reason = analysis.abstainReason ?? (analysis.reps === 0 ? "No complete rep was measured in this part." : null);
    return { segment, analysis, reason };
  });

  const valid = parts.filter((p) => p.analysis !== null && p.reason === null);
  const primary = [...valid].sort(
    (a, b) =>
      b.analysis!.reps - a.analysis!.reps ||
      b.analysis!.confidence - a.analysis!.confidence ||
      b.segment.endMs - b.segment.startMs - (a.segment.endMs - a.segment.startMs),
  )[0];

  const reports: SegmentReport[] = parts.map((p) => ({
    startMs: p.segment.startMs,
    endMs: p.segment.endMs,
    openedBy: p.segment.after?.kind ?? null,
    status: p.reason === null ? "analyzed" : "not_assessable",
    reps: p.reason === null ? p.analysis!.reps : 0,
    quality: p.reason === null ? p.analysis!.confidence : 0,
    coverage: Math.min(1, Math.max(0, (p.segment.endMs - p.segment.startMs) / clipMs)),
    reason: p.reason,
    primary: p === primary,
  }));

  const where = describeBoundaries(boundaries);
  if (!primary) {
    const why = unique(parts.map((p) => p.reason as string)).slice(0, 3).join(" ");
    const reason = `Not assessable: the video breaks at ${where}, and no part between those breaks met the evidence requirements on its own. ${why}`;
    return { ...emptyAnalysis(exercise, classification, unique([reason, ...droppedNote]), reason), segments: reports };
  }

  const others = valid.length - 1;
  const note =
    parts.length === 1
      ? `Frames during ${where} were left out; the rest (${spanLabel(primary.segment.startMs, primary.segment.endMs)}) was analysed as one continuous part.`
      : `This video has ${parts.length} parts, separated by ${where}. Each part was analysed on its own and no rep was counted across a break. These results are from ${spanLabel(primary.segment.startMs, primary.segment.endMs)}, the part with the most measured reps${
          others > 0 ? `; ${others} other analysable part(s) are listed separately and not added in, because SetVision can't confirm they show the same athlete` : ""
        }.`;
  return {
    ...primary.analysis!,
    limitations: unique([note, ...primary.analysis!.limitations, ...droppedNote]),
    segments: reports,
  };
}

/** The single-continuous-part engine (the former whole-clip analysis, with the person check scoped to the part). */
function analyzeSegment(
  frames: TimedPoseFrame[],
  exercise: SetVisionExerciseId,
  classification: ExerciseClassification,
  options: SegmentOptions,
): SetVisionAnalysis {
  const person = checkPersonAttribution(frames);
  if ("reason" in person) return emptyAnalysis(exercise, classification, [person.reason], person.reason);
  const gate = { limitations: person.verdict === "not_run" ? [PERSON_CHECK_NOT_RUN] : person.limitations };

  const config = getExerciseConfig(exercise);
  const poseFrames = frames.map((f) => f.frame);
  const { view } = estimateCameraView(poseFrames);

  let measuredSide: Side | null = null;
  if (config.sideMode === "per-clip") {
    const refused = refusal(poseFrames, config, view);
    if (refused) {
      return { ...emptyAnalysis(exercise, classification, [refused.reason], refused.reason), measuredSide: refused.side };
    }
    measuredSide = chooseMeasuredSide(poseFrames, config.joints)!.side;
  }

  const side = measuredSide;
  const machine = createRepStateMachine({
    ...config,
    primaryAngleDeg: side ? (frame) => sideAngle(frame, side, config.joints) : config.primaryAngleDeg,
  });

  const detectedReps: CompletedRep[] = [];
  let visibleFrameCount = 0;
  let finalPhase = "top";

  for (const timedFrame of frames) {
    const result = machine.processFrame(timedFrame);

    if (result.visible) {
      visibleFrameCount += 1;
      finalPhase = result.phase;
    }

    if (result.lastCompletedRep) {
      detectedReps.push(result.lastCompletedRep);
    }
  }

  const limitations: string[] = [];
  const excluded: MovementEvent[] = [];
  // Never count a rep that crosses an untrusted boundary: after one, a rep whose start wasn't observed began before the break.
  const crossing = options.openedByBoundary ? detectedReps.filter((rep) => !rep.startObserved) : [];
  if (crossing.length > 0) {
    crossing.forEach((rep) => excluded.push({ kind: "excluded", startMs: rep.bottomAtMs, endMs: rep.ascentEndAtMs }));
    limitations.push(`${crossing.length} movement(s) already under way when this part began were not counted: they started before the break.`);
  }
  const ownReps = crossing.length > 0 ? detectedReps.filter((rep) => rep.startObserved).map((rep, i) => ({ ...rep, repNumber: i + 1 })) : detectedReps;
  let completedReps = exercise === "squat" ? excludePickupOutliers(ownReps, limitations) : ownReps;

  if (side && config.position && completedReps.length > 0) {
    const verdicts = completedReps.map((rep) => repPosition(frames, rep, config, side));
    if (!verdicts.includes("pass")) {
      const reason = verdicts.includes("fail")
        ? config.position.failure
        : `The ${side} hip, shoulder and wrist were not clear enough to check that this is a ${config.family.toLowerCase()} position, so nothing was counted.`;
      return { ...emptyAnalysis(exercise, classification, [reason], reason), measuredSide: side };
    }
    completedReps.forEach((rep, i) => {
      if (verdicts[i] !== "pass") excluded.push({ kind: "excluded", startMs: rep.startObserved ? rep.topAtMs : rep.bottomAtMs, endMs: rep.ascentEndAtMs });
    });
    if (excluded.length > 0) {
      limitations.push(
        `${excluded.length} movement cycle(s) were not counted: the body position could not be confirmed as a ${config.family.toLowerCase()} there (${excluded.map((e) => `${secondsLabel(e.startMs)}–${secondsLabel(e.endMs)}`).join(", ")}).`,
      );
      completedReps = completedReps.filter((_, i) => verdicts[i] === "pass").map((rep, i) => ({ ...rep, repNumber: i + 1 }));
    }
  }

  const visibilityRatio = frames.length > 0 ? visibleFrameCount / frames.length : 0;

  if (frames.length > 0 && visibilityRatio < MIN_VISIBILITY_RATIO) {
    limitations.push(
      `Only ${Math.round(visibilityRatio * 100)}% of frames had clear visibility of the required landmarks — results may be less reliable.`,
    );
  }

  if (completedReps.length === 0) {
    limitations.push(
      "No complete reps were detected. Check that the full lift (start to finish) is visible in the video.",
    );
  } else if (completedReps.length < MIN_REPS_FOR_RELIABLE_CONSISTENCY) {
    limitations.push(
      `Only ${completedReps.length} rep(s) detected — consistency metrics (ROM/tempo/bar-path) are less meaningful with this few reps.`,
    );
  }

  if (machine.getDroppedReps() > 0) {
    limitations.push(
      `Tracking was lost mid-movement ${machine.getDroppedReps()} time(s); those movements were not counted as reps.`,
    );
  }

  if (finalPhase !== "top") {
    limitations.push("The clip ends mid-movement; that last movement was not counted as a rep.");
  }

  if (completedReps.some((rep) => !rep.startObserved)) {
    limitations.push(
      exercise === "squat" || exercise === "deadlift"
        ? "A rep began before tracking did (already at the bottom), so its eccentric and bottom-hold times are not reported."
        : `A rep began before tracking did (already at the ${config.phaseNames[1].toLowerCase()} position), so its first phase and hold times are not reported.`,
    );
  }

  // Joint ranges are only meaningful as 2D angles from the view the movement happens in.
  const rangeView = (config.rangeViews as CameraView[]).includes(view);

  if (!rangeView) {
    const wanted = config.rangeViews.map((v) => VIEW_TEXT[v]).join(" or ");
    limitations.push(
      exercise === "squat" || exercise === "deadlift"
        ? view === "frontal"
          ? "The camera faces the lifter, so joint angles are 2D projections: joint range is not reported, and rep timing comes from the projected joint-angle trace."
          : "The camera could not be verified as side-on, so joint range is not reported, and rep timing comes from the projected joint-angle trace."
        : view === "frontal" || view === "side"
          ? `The camera looks ${VIEW_TEXT[view]}, so the ${config.signalLabel.split(" (")[0]} is a 2D projection: joint range is not reported (it needs a ${wanted} view), and rep timing comes from the projected angle trace.`
          : `The camera angle could not be verified as ${wanted}, so joint range is not reported, and rep timing comes from the projected angle trace.`,
    );
  }

  if (side) {
    limitations.push(`Measured on the ${side} ${config.joints[1]} for the whole clip.`);
  }
  limitations.push(...gate.limitations);

  const torsoLength = averageTorsoLength(frames.map((f) => f.frame));

  if (!torsoLength) {
    limitations.push(
      "Could not estimate torso length from the video, so velocity and bar-path metrics are unavailable.",
    );
  }

  const repRoms = rangeView ? computeAllRepRom(completedReps, config) : [];
  const repTempos = computeAllRepTempo(completedReps, config.outbound);

  const velocity = computeVelocity(completedReps, torsoLength, {
    metersPerTorsoLength: options.metersPerTorsoLength,
  });

  const technique = computeTechniqueConsistency(completedReps, config, torsoLength, {
    rom: repRoms,
    tempo: repTempos,
  });
  // A side view hides the far knee and an oblique one skews both sides differently: left/right is only compared head-on.
  if (view !== "frontal") technique.asymmetryDeg = null;

  const confidence = deriveOverallConfidence({
    visibilityRatio,
    repCount: completedReps.length,
    hasTorsoLength: torsoLength !== null,
  });

  return {
    exercise,
    exerciseClassification: classification,
    reps: completedReps.length,
    romConsistency: technique.romConsistency,
    averageEccentricTime: averageEccentricTime(repTempos),
    averageConcentricTime: averageConcentricTime(repTempos),
    velocity,
    technique,
    confidence,
    perRep: { rom: repRoms, tempo: repTempos },
    limitations,
    abstainReason: null,
    measuredSide: side,
    events: [...machine.getEvents(frames.length ? frames[frames.length - 1].timestampMs : undefined), ...excluded].sort((a, b) => a.startMs - b.startMs),
  };
}

/** Engines Auto-detect may propose from arm movement alone. */
const ARM_ENGINES: SetVisionExerciseId[] = [
  "vertical_press",
  "vertical_pull",
  "horizontal_pull",
  "elbow_flexion",
  "triceps_pushdown",
  "overhead_triceps_extension",
  "lateral_raise",
];

/**
 * Auto-detect: an evidence-based SUGGESTION, never an analysis. The
 * squat/deadlift/lying-press classifier (exercise-classifier.ts) runs first,
 * unchanged. When it abstains and neither the squat nor the hinge engine
 * counts a leg rep (so it is not a squat, lunge or hinge), every arm engine is
 * tried; each one that counts reps that pass its body-position check is a
 * candidate. One candidate → suggested; several → the user is asked to pick
 * between them (pose alone cannot separate them); none → abstain. Arm
 * suggestions carry no score: no labelled clips exist to calibrate one.
 */
export function suggestExercise(frames: TimedPoseFrame[]): ExerciseClassification {
  const base = classifyExercise(frames.map((f) => f.frame));
  if (base.exercise) return base;

  if ((["squat", "deadlift"] as const).some((id) => analyzeFrameSequence(frames, { exercise: id }).reps > 0)) return base;

  const candidates = ARM_ENGINES.filter((id) => analyzeFrameSequence(frames, { exercise: id }).reps > 0);
  if (candidates.length === 0) return base;

  const names = candidates.map((id) => getExerciseConfig(id).family.toLowerCase());
  if (candidates.length === 1) {
    return {
      exercise: candidates[0],
      confidence: null,
      signals: [`No squat or hinge reps, and the arms moved in a ${names[0]} pattern that passed its body-position check.`],
      candidates,
    };
  }
  return {
    exercise: null,
    confidence: 0,
    signals: [`The arm movement fits more than one exercise (${names.join(", ")}); pose alone can't tell them apart, so choose the one you did.`],
    candidates,
  };
}
