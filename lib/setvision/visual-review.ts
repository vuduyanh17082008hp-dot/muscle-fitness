import { EXERCISE_CATALOGUE } from "@/lib/workouts/exercise-library";
import { normalizeSearchText } from "@/lib/setvision/exercise-selection";

/**
 * AI Visual Review — qualitative form feedback from a few timestamped stills
 * of the user's own video, for ANY exercise (the only path for exercises with
 * no tracking engine). OpenAI looks at the frames; this module owns the prompt,
 * the response schema and — most importantly — the deterministic rules applied
 * to the model's untrusted answer:
 *
 * - No rep count, angle, percentage or distance ever reaches the user; no injury-risk talk; no AI praise.
 * - AI findings are only ever "possibly" (no validated precision yet — see sanitizeVisualReview); ≥ 2 cited
 *   frames, high confidence, one of the exercise's own checks and two-pass agreement only rank a lead first.
 * - Frame indices must be ones we sent; the timestamps shown are OURS, never the model's.
 * - Exercise identity is graded (CONFIRMED_MATCH … CONFIRMED_MISMATCH). Only a high-confidence,
 *   frame-cited mismatch refuses; an ambiguous one asks the user, and the user's confirmation never
 *   overrides a confirmed mismatch or any person/composite check. Between look-alikes (leg curl / leg
 *   extension, pulldown / row, …) a match is confirmed only if the model, asked the same question about
 *   each look-alike, rejects it (contrast passes) — a model that says yes to both labels has not told them apart.
 * - More than one person, an edited/composite clip, or nobody visible → no form findings at all.
 * - "No issue seen" is never presented as "good form".
 */

export const VISUAL_REVIEW_MAX_FRAMES = 12;
export const VISUAL_REVIEW_MIN_FRAMES = 4;

export type VisualReviewStatus =
  | "OBSERVED_ISSUE"
  | "NO_SUPPORTED_ISSUE_OBSERVED"
  | "UNCERTAIN"
  | "NOT_ASSESSABLE";

export type ExerciseCheck = "CONFIRMED_MATCH" | "POSSIBLE_MATCH" | "AMBIGUOUS" | "CONFIRMED_MISMATCH";

/**
 * What the on-device subject scan established before any frame was sent:
 * full = one person tracked as one identity, steady camera;
 * camera_moved = one consistent person, but the camera moved too much for rep tracking;
 * partial_body = no whole person in view (e.g. feet only) and no sign of anyone else.
 */
export type ReviewScope = "full" | "camera_moved" | "partial_body";
export const REVIEW_SCOPES = ["full", "camera_moved", "partial_body"] as const;

export type VisualObservation = {
  kind: "issue" | "positive" | "uncertain";
  what: string;
  cue: string | null;
  /** Video times (ms) of the frames it was seen in — from the frames we sent. */
  atMs: number[];
};

export type VisualReview = {
  status: VisualReviewStatus;
  /** What the frames show, in the model's words (short). */
  seenMovement: string;
  exerciseCheck: ExerciseCheck;
  /** Ambiguous identity, not yet confirmed by the user: findings are withheld until they confirm. */
  needsConfirmation: boolean;
  scope: ReviewScope;
  /** Why nothing (or only part) could be assessed; null when fully assessable. */
  limitation: string | null;
  filmingTip: string | null;
  observations: VisualObservation[];
  frameCount: number;
};

export type AthleteLens = {
  experience: string | null;
  goal: string | null;
  limitations: string | null;
};

/** The app's own catalogue description of an exercise — what it looks like and what to check. */
export type ExerciseReference = {
  name: string;
  equipment: string;
  pattern: string;
  description: string;
  steps: string[];
  checks: string[];
  /** Catalogue exercises that look like this one from many camera angles (mirror actions on similar setups). */
  lookAlikes: Array<{ key: string; name: string; description: string; steps: string[] }>;
};

/**
 * Movements that look alike from many camera angles: mirror actions on similar equipment, and same-direction
 * actions in another plane. S3 eval (2026-11-03): told the clip was "Leg Extension", the model described a
 * genuine leg curl as "a seated knee extension" 3/3 and self-reported the look-alike as ruled out; told
 * "Seated Leg Curl", it described the SAME stills as a leg curl. A label-blind pick was no better (it chose
 * Leg Extension for the leg curl 2/3, inventing a pad "in front of the shins"). So identity between these is
 * settled contrastively: the same question is asked about each look-alike (sanitizeVisualReview `contrasts`).
 */
const LOOK_ALIKE_PATTERNS: Array<[string, string]> = [
  ["Knee Flexion", "Knee Extension"],
  ["Elbow Flexion", "Elbow Extension"],
  ["Horizontal Push", "Horizontal Pull"],
  ["Vertical Push", "Vertical Pull"],
  ["Horizontal Adduction", "Horizontal Abduction"],
  ["Vertical Pull", "Horizontal Pull"], // lat pulldown vs seated row
  ["Horizontal Push", "Vertical Push"], // chest press vs shoulder press
  ["Squat", "Hip Hinge"],
];

/** Catalogue reference for a `catalogue:<slug>` option key; null for SetVision-list or custom exercises. */
export function exerciseReference(key: string | null): ExerciseReference | null {
  const slug = key?.startsWith("catalogue:") ? key.slice("catalogue:".length) : null;
  const item = slug ? EXERCISE_CATALOGUE.find((e) => e.slug === slug) : undefined;
  if (!item) return null;
  const mirror = LOOK_ALIKE_PATTERNS.flatMap(([a, b]) => (item.movementPattern === a ? [b] : item.movementPattern === b ? [a] : []));
  // One look-alike per related pattern, on the SAME equipment — a similar setup is what makes them confusable
  // (a leg press has no machine hinge to be mistaken for; a barbell squat and a barbell RDL do).
  const lookAlikes = mirror
    .map((p) => EXERCISE_CATALOGUE.find((e) => e.movementPattern === p && e.equipment === item.equipment))
    .filter((e) => e !== undefined)
    .map((e) => ({ key: `catalogue:${e.slug}`, name: e.name, description: e.description, steps: (e.instructions ?? []).slice(0, 3) }));
  return {
    name: item.name,
    equipment: item.equipment,
    pattern: item.movementPattern,
    description: item.description,
    steps: item.instructions ?? [],
    checks: [...(item.safetyCues ?? []), ...(item.commonMistakes ?? []).map((m) => `Avoid: ${m}`)],
    lookAlikes,
  };
}

/** Asked of the model only so it keeps judgements to what its angle shows; never returned or shown (it is often wrong). */
const VIEWS = ["side", "front", "back", "oblique", "unclear"] as const;

export const VISUAL_REVIEW_SYSTEM_PROMPT = `
You are a careful strength coach reviewing still frames taken in time order from ONE video of a lifter.
You see only these stills — not the motion between them. Frames are chosen near the start and end
positions of the movement where possible, so compare positions ACROSS frames.

Report ONLY what is visible. Rules:
- people_in_view: count people WITHIN each single frame — the same lifter appearing in several frames is ONE person, and a person counts even if only part of their body is visible. "more_than_one" only if some single frame shows two or more different people (including someone in the background), and list those frame numbers in multi_person_frames; otherwise multi_person_frames is []. "none" if no person or body part is visible in any frame.
- edited_or_composite: true when the stills are not one continuous recording — split screen, picture-in-picture, or a cut to a different scene; a hand-held camera that moves or zooms within the same scene is NOT a cut.
- seen_movement: a short noun phrase for the movement you see, e.g. "a kettlebell goblet squat".
- exercise_match: compare what you see with the named exercise and its reference (equipment, start and end positions, direction of movement).
  "matches" = consistent; "likely" = mostly consistent but something can't be seen; "ambiguous" = the frames fit this exercise AND a similar one (for example machines that look alike from this angle, where you can't see which side of the limb the pad is on); "different" = the frames clearly show another movement.
  exercise_match_confidence: "high" only if the evidence is unmistakable. match_frames: the frame numbers that show the deciding evidence. match_evidence: one sentence naming what you see in them.
- view: the camera angle relative to the lifter.
- assessable: "no" when the lifter is mostly out of frame, too dark, too small, blocked, or the frames do not show the movement; "partly" when only some aspects can be judged from this angle.
- missing: what you could not see that a coach would need (e.g. "feet cut off"), or "".
- filming_tip: one short tip for a better clip, or "".
- observations: at most 3. kind "issue" = a technique problem you can SEE; "uncertain" = possible but not clear.
  - check: the exact reference check or step this concerns (copy its words), or "" if none applies.
  - frames: the frame numbers where it is visible. An issue must be visible in at least two frames.
  - confidence: "high" only when it is unmistakable in those frames from this camera angle; otherwise "medium" or "low".
  - what: one plain sentence stating what IS visible (no "possibly", "may" or "might" in an issue — if you are not sure, use kind "uncertain"). cue: one short practical coaching cue.
- Use the reference steps and checks to decide what to look at: e.g. does each rep reach the start and end positions the steps describe?
- NEVER state numbers: no joint angles, degrees, percentages, distances, speeds, or rep counts.
- NEVER diagnose injuries, pain or medical conditions, or claim injury risk.
- Do not praise or call the form correct; if you see no problem, return no issue observations.
- Judge only aspects this camera angle shows (a front view cannot show back rounding; a back view cannot show knee travel over toes).
`.trim();

export const VISUAL_REVIEW_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "setvision_visual_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "people_in_view", "multi_person_frames", "edited_or_composite", "seen_movement",
        "exercise_match", "exercise_match_confidence", "match_frames", "match_evidence",
        "view", "assessable", "missing", "filming_tip", "observations",
      ],
      properties: {
        people_in_view: { type: "string", enum: ["one", "more_than_one", "none", "unclear"] },
        multi_person_frames: { type: "array", items: { type: "integer" } },
        edited_or_composite: { type: "boolean" },
        seen_movement: { type: "string" },
        exercise_match: { type: "string", enum: ["matches", "likely", "ambiguous", "different"] },
        exercise_match_confidence: { type: "string", enum: ["high", "medium", "low"] },
        match_frames: { type: "array", items: { type: "integer" } },
        match_evidence: { type: "string" },
        view: { type: "string", enum: [...VIEWS] },
        assessable: { type: "string", enum: ["yes", "partly", "no"] },
        missing: { type: "string" },
        filming_tip: { type: "string" },
        observations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "check", "frames", "what", "cue", "confidence"],
            properties: {
              kind: { type: "string", enum: ["issue", "uncertain"] },
              check: { type: "string" },
              frames: { type: "array", items: { type: "integer" } },
              what: { type: "string" },
              cue: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
          },
        },
      },
    },
  },
} as const;

const clip = (value: string, max: number) => value.replace(/\s+/g, " ").trim().slice(0, max);

/** Tailors wording only — the athlete's own profile fields, never inferred. */
export function athleteLensText(lens: AthleteLens | null): string {
  if (!lens) return "No athlete profile available — use plain, beginner-friendly wording.";
  const lines = [
    lens.experience
      ? `Self-reported experience: ${clip(lens.experience, 40)}. ${/begin|novice|new/i.test(lens.experience) ? "Use plain words, no jargon." : /advanc/i.test(lens.experience) ? "Technical coaching terms are fine." : "Keep terms simple; explain any jargon."}`
      : "Experience not set — use plain, beginner-friendly wording.",
    lens.goal ? `Training goal: ${clip(lens.goal, 60)}.` : null,
    lens.limitations
      ? `The athlete noted these movement constraints (their words, not a diagnosis): "${clip(lens.limitations, 200)}". Never comment on pain or injury; if a cue conflicts with this, say to keep within a comfortable range.`
      : null,
  ];
  return lines.filter(Boolean).join("\n");
}

const SCOPE_PROMPT: Record<ReviewScope, string | null> = {
  full: null,
  camera_moved: "The camera moves during this clip (one person was tracked throughout). Judge body positions, not motion relative to the frame.",
  partial_body: "Only part of the body may be in view. Comment only on the visible body parts; do not guess about anything out of frame.",
};

export function visualReviewUserText(
  exerciseLabel: string,
  frameTimesMs: number[],
  lens: AthleteLens | null,
  ctx: { reference?: ExerciseReference | null; userConfirmed?: boolean; scope?: ReviewScope } = {},
): string {
  const ref = ctx.reference;
  return [
    `Exercise the user named: "${clip(exerciseLabel, 80)}"${ctx.userConfirmed ? " — the user has CONFIRMED this is the exercise in the video." : " (a user-provided label, not proof)."}`,
    ref
      ? [
          `Reference for this exercise (from the app's exercise catalogue): ${ref.description} Equipment: ${ref.equipment}. Pattern: ${ref.pattern}.`,
          `Steps: ${ref.steps.map((s, i) => `${i + 1}. ${s}`).join(" ")}`,
          `Checks: ${ref.checks.map((c) => `• ${c}`).join(" ")}`,
          ref.lookAlikes.length
            ? `Look-alike exercises to rule out: ${ref.lookAlikes.map((l) => `${l.name} — ${l.description} ${l.steps.join(" ")}`).join(" | ")}`
            : "Look-alike exercises to rule out: none listed.",
        ].join("\n")
      : "No catalogue reference exists for this exercise; judge only clearly visible, general movement control.",
    SCOPE_PROMPT[ctx.scope ?? "full"],
    `Frames follow in order, labelled Frame 1…${frameTimesMs.length} with their video time.`,
    athleteLensText(lens),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Any number with a measurement unit, or a rep count — never shown, because the stills cannot support it. */
const NUMERIC_CLAIM = /\d+(\.\d+)?\s*(°|deg|degree|%|percent|cm|mm|inch|in\b|m\b|m\/s|reps?\b|times\b|kg|lb)/i;
// Injury-risk language counts too ("stress the joints", "joint stress"): the stills can't support it (S3 eval 2026-11-03).
const MEDICAL = /\b(injur|pain|hurt|diagnos|tear|strain|sprain|herniat|risk of|unsafe|dangerous|damag|joint stress|stress (on |to )?(the |your )?(joints?|knees?|back|spine|shoulders?|neck))/i;
// Praise smuggled in as an observation ("…not behind the neck, which is correct", S3 final replay): never shown.
const PRAISE = /\b(which is (correct|good|proper|fine)|(is|are|looks?) (correct|good|proper)\b|(good|proper|correct|excellent) (form|technique|posture)|well executed|no (issue|problem)s?\b)/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? clip(v, max) : "");

/**
 * Which of the reference's own checks/steps the model's `check` names (word overlap, not similarity
 * scoring), as an index into [...checks, ...steps]; -1 when none.
 */
export function referenceCheckIndex(check: string, reference: ExerciseReference): number {
  const words = (s: string) => new Set(normalizeSearchText(s.replace(/^avoid:\s*/i, "")).split(" ").filter((w) => w.length > 2));
  const said = words(check);
  if (said.size === 0) return -1;
  return [...reference.checks, ...reference.steps].findIndex((c) => {
    const ref = words(c);
    const shared = [...said].filter((w) => ref.has(w)).length;
    return ref.size > 0 && shared / Math.min(said.size, ref.size) >= 0.6;
  });
}

export function namesReferenceCheck(check: string, reference: ExerciseReference): boolean {
  return referenceCheckIndex(check, reference) >= 0;
}

const validFrames = (v: unknown, frameCount: number) =>
  Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= frameCount))] : [];

/**
 * Grades ONE labelled model answer on exercise identity. Only a high-confidence, frame-cited "different" is a
 * confirmed mismatch; a match is confirmed only at high confidence. (Look-alikes: see `contrasts`.)
 */
export function gradeExerciseMatch(raw: Record<string, unknown>, frameCount: number): ExerciseCheck {
  const high = raw.exercise_match_confidence === "high";
  switch (raw.exercise_match) {
    case "matches":
      return high ? "CONFIRMED_MATCH" : "POSSIBLE_MATCH";
    case "likely":
      return "POSSIBLE_MATCH";
    case "different":
      return high && validFrames(raw.match_frames, frameCount).length >= 2 && str(raw.match_evidence, 200) ? "CONFIRMED_MISMATCH" : "AMBIGUOUS";
    default:
      return "AMBIGUOUS";
  }
}

const RANK: Record<ExerciseCheck, number> = { CONFIRMED_MATCH: 0, POSSIBLE_MATCH: 1, AMBIGUOUS: 2, CONFIRMED_MISMATCH: 3 };

/** Several labelled answers: the most cautious identity wins, except that one lone "mismatch" only makes it ambiguous. */
function combineChecks(checks: ExerciseCheck[]): ExerciseCheck {
  if (checks.every((c) => c === "CONFIRMED_MISMATCH")) return "CONFIRMED_MISMATCH";
  return checks.map((c) => (c === "CONFIRMED_MISMATCH" ? "AMBIGUOUS" : c)).reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}

/** Hedged wording is not an observation: an "issue" that says "possibly"/"may"/"might" is only "possibly". */
const HEDGED = /\b(possibl\w*|may|might|could|perhaps|unclear|uncertain|seems?|maybe)\b/i;

const SCOPE_TEXT: Record<ReviewScope, string | null> = {
  full: null,
  camera_moved: "Limited review: the camera moved, so no reps or tracking — only what the stills show.",
  partial_body: "Limited review: only part of the body is in view, and SetVision couldn't confirm a whole person — the review covers only the visible body parts.",
};

type Candidate = { what: string; cue: string | null; atMs: number[]; checkIndex: number; eligible: boolean };

/**
 * Applies the module's rules to the model's untrusted JSON — one answer, or several independent answers to
 * the SAME stills (the route asks twice). Every person/composite/identity signal takes the most cautious answer;
 * form findings are only ever "possibly", and agreement on one reference check only ranks a lead first.
 * Returns null when no reply is usable (the route reports "temporarily unavailable").
 */
export function sanitizeVisualReview(
  rawInput: unknown,
  frameTimesMs: number[],
  exerciseLabel: string,
  /**
   * `contrasts`: the model's answer to the SAME stills when the look-alike `reference.lookAlikes[i]` is named instead
   * (null when that call failed) — required whenever the reference has look-alikes.
   */
  ctx: { reference?: ExerciseReference | null; userConfirmed?: boolean; scope?: ReviewScope; contrasts?: unknown[] } = {},
): VisualReview | null {
  const raws = (Array.isArray(rawInput) ? rawInput : [rawInput]).filter(isRecord);
  if (raws.length === 0) return null;
  const [first] = raws;
  const n = frameTimesMs.length;
  const scope = ctx.scope ?? "full";
  const label = clip(exerciseLabel, 80);
  const reference = ctx.reference ?? null;
  // How the model answered when each look-alike was named; a missing/unusable answer rejects nothing.
  const contrasts = (reference?.lookAlikes ?? []).map((l, i) => {
    const raw = ctx.contrasts?.[i];
    return { name: l.name, raw: isRecord(raw) ? raw : null, check: isRecord(raw) ? gradeExerciseMatch(raw, n) : ("AMBIGUOUS" as ExerciseCheck) };
  });

  // People: "more than one" must point at a frame we sent (an uncited claim is "unclear", not a refusal); any answer counts.
  const multiFrames = [...new Set(raws.flatMap((r) => (r.people_in_view === "more_than_one" ? validFrames(r.multi_person_frames, n) : [])))].sort((a, b) => a - b);
  const said = raws.map((r) => (r.people_in_view === "more_than_one" ? (validFrames(r.multi_person_frames, n).length ? "more_than_one" : "unclear") : r.people_in_view));
  const people = multiFrames.length ? "more_than_one" : said.every((p) => p === "none") ? "none" : said.every((p) => p === "one") ? "one" : "unclear";
  const composite = raws.some((r) => r.edited_or_composite === true);

  const labelled = combineChecks(raws.map((r) => gradeExerciseMatch(r, n)));
  // The selection can only match if every look-alike was firmly rejected (cited, high-confidence "different").
  // A contrast "match" never NAMES the exercise: it is anchored too (S3 final: a chest press, named "Leg Extension"
  // in the contrast pass, came back "matches").
  const notRuledOut = contrasts.find((c) => c.check !== "CONFIRMED_MISMATCH");
  const decider = raws.find((r) => gradeExerciseMatch(r, n) === "CONFIRMED_MISMATCH") ?? raws.find((r) => r.exercise_match !== "matches") ?? first;
  // A "different" whose own description names the selected exercise is a variation/equipment question, not another
  // movement (S3 final: feet-only bodyweight toe lifts "look like standing calf raise, not Standing Calf Raise").
  const namesSelection = ` ${normalizeSearchText(str(decider.seen_movement, 120))} `.includes(` ${normalizeSearchText(label)} `);
  const graded: ExerciseCheck =
    labelled === "CONFIRMED_MISMATCH" ? (namesSelection ? "AMBIGUOUS" : labelled) : notRuledOut ? "AMBIGUOUS" : labelled;
  // The user's confirmation resolves an ambiguity — it never overrides a confirmed mismatch.
  const exerciseCheck: ExerciseCheck = graded === "AMBIGUOUS" && ctx.userConfirmed ? "POSSIBLE_MATCH" : graded;
  const assessable = raws.some((r) => r.assessable !== "yes" && r.assessable !== "partly") ? "no" : raws.some((r) => r.assessable === "partly") ? "partly" : "yes";
  const seenMovement = str(decider.seen_movement, 120);
  const evidence = str(decider.match_evidence, 200);
  const missing = raws.map((r) => str(r.missing, 160)).find(Boolean) ?? null;
  // Look-alikes the video couldn't separate need the evidence that tells them apart — not necessarily a side view.
  const filmingTip =
    (graded === "AMBIGUOUS" && notRuledOut
      ? "Film so the machine or weight, where it touches your body (e.g. front or back of the leg) and the direction it moves are all in view for a full rep."
      : str(first.filming_tip, 160)) || null;
  const base = { seenMovement, exerciseCheck, needsConfirmation: false, scope, filmingTip, frameCount: n } as const;

  const notAssessable = (limitation: string, tip: string | null = filmingTip): VisualReview => ({
    ...base,
    filmingTip: tip,
    status: "NOT_ASSESSABLE",
    limitation,
    observations: [],
  });

  if (people === "more_than_one") {
    return notAssessable(
      `More than one person is visible (${multiFrames.slice(0, 3).map((k) => `${(frameTimesMs[k - 1] / 1000).toFixed(1)} s`).join(", ")}), so the review can't be sure whose technique it is looking at. No form findings are given.`,
      "Film with only you in view.",
    );
  }
  if (composite) {
    return notAssessable(
      "The video doesn't look like one continuous recording (split screen, inset or a cut to another shot), so it can't be sure every frame shows the same athlete. No form findings are given.",
      "Upload one continuous, unedited recording of your set.",
    );
  }
  if (people === "none") return notAssessable("No person was visible in the sampled frames.", filmingTip ?? "Keep your whole body in frame for the full set.");
  if (exerciseCheck === "CONFIRMED_MISMATCH") {
    return notAssessable(
      `The video looks like ${seenMovement.replace(/[.]$/, "") || "a different movement"}, not ${label}${evidence ? ` (${evidence.replace(/[.]$/, "")})` : ""}. Check the exercise you picked — no form findings are given for a movement that isn't the one named.`,
      null,
    );
  }
  if (assessable === "no") return notAssessable(missing ?? "The frames don't show enough of the lifter or the movement to review technique.");
  if (exerciseCheck === "AMBIGUOUS") {
    // Name the look-alike the model came closest to accepting.
    const closest = contrasts.filter((c) => c.check !== "CONFIRMED_MISMATCH").sort((a, b) => RANK[a.check] - RANK[b.check])[0];
    const alt = closest?.name.toLowerCase() ?? (seenMovement && !new RegExp(label.replace(/[^\w ]/g, ""), "i").test(seenMovement) ? seenMovement.replace(/[.]$/, "") : reference?.lookAlikes[0]?.name.toLowerCase());
    return {
      ...base,
      needsConfirmation: true,
      status: "UNCERTAIN",
      limitation: `You selected ${label}. Similar exercises can look alike from this camera angle, and the video could also be ${alt ? (/^an? /i.test(alt) ? alt : `${/^[aeiou]/i.test(alt) ? "an" : "a"} ${alt}`) : "a similar exercise"} — this recording doesn't show what tells them apart, so SetVision can't be sure. If it is ${label}, confirm to get possible technique observations; otherwise pick the right exercise.`,
      observations: [],
    };
  }

  const candidates = (raw: Record<string, unknown>): Candidate[] => {
    const out: Candidate[] = [];
    for (const entry of Array.isArray(raw.observations) ? raw.observations : []) {
      // AI praise is never shown (S3: "neutral spine" asserted 6/6 on a clip labelled "curving your spine").
      if (!isRecord(entry) || entry.kind === "positive") continue;
      const what = str(entry.what, 220);
      const cue = str(entry.cue, 140);
      if (!what || NUMERIC_CLAIM.test(what) || NUMERIC_CLAIM.test(cue) || MEDICAL.test(what) || MEDICAL.test(cue) || PRAISE.test(what)) continue;
      const frames = validFrames(entry.frames, n).sort((a, b) => a - b);
      if (frames.length === 0) continue; // a finding we can't point to in the video is not shown
      const checkIndex = reference ? referenceCheckIndex(str(entry.check, 200), reference) : -1;
      // A strong lead: ≥ 2 frames, high confidence, unhedged wording, and one of THIS exercise's own checks.
      const eligible = entry.kind === "issue" && frames.length >= 2 && entry.confidence === "high" && !HEDGED.test(what) && checkIndex >= 0;
      out.push({ what, cue: cue || null, atMs: frames.map((k) => frameTimesMs[k - 1]), checkIndex, eligible });
    }
    return out;
  };
  const [mine, ...others] = raws.map(candidates);
  // AI-only findings are never CONFIRMED issues — always "possibly". Measured (S3, 2026-11-03): 0 of 5 author-labelled
  // faults confirmed, and confirmed issues on correct-form demos in later runs ("bar behind the neck" from a rear view
  // the model called "side", frames show it in front; "arms not fully extended"; "upper arms lift off the pad").
  // Two passes of the same model on the same stills agreeing is not independent evidence, so agreement on one of
  // the exercise's own checks only RANKS a lead first. Upgrade path: a labelled validation set showing confirmed
  // precision. Tracked (pose-measured) findings are a separate path and unaffected.
  const agreed = (c: Candidate) => c.eligible && others.every((o) => o.some((x) => x.eligible && x.checkIndex === c.checkIndex));
  const kept: VisualObservation[] = [...mine.filter(agreed), ...mine.filter((c) => !agreed(c))]
    .slice(0, 2)
    .map((c) => ({ kind: "uncertain", what: c.what, cue: c.cue, atMs: c.atMs }));

  const status: VisualReviewStatus =
    assessable === "partly" || exerciseCheck !== "CONFIRMED_MATCH" || people === "unclear" || scope !== "full" || kept.some((o) => o.kind === "uncertain")
      ? "UNCERTAIN"
      : "NO_SUPPORTED_ISSUE_OBSERVED";

  const limitation =
    [
      SCOPE_TEXT[scope],
      exerciseCheck === "POSSIBLE_MATCH"
        ? ctx.userConfirmed && graded === "AMBIGUOUS"
          ? `You confirmed this is ${label}; the video alone couldn't show it.`
          : `It wasn't fully clear from the stills that this is ${label}.`
        : null,
      !reference ? `SetVision has no exercise reference for ${label}.` : null,
      people === "unclear" ? "It wasn't clear whether anyone else was in view." : null,
      assessable === "partly" ? (missing ?? "Only part of the technique is visible from this angle.") : null,
    ]
      .filter(Boolean)
      .join(" ") || null;

  return { ...base, status, limitation, observations: kept };
}

export const VISUAL_STATUS_TEXT: Record<VisualReviewStatus, string> = {
  OBSERVED_ISSUE: "Something to work on",
  NO_SUPPORTED_ISSUE_OBSERVED: "No clear issue seen",
  UNCERTAIN: "Partly reviewable",
  NOT_ASSESSABLE: "Not assessable",
};
