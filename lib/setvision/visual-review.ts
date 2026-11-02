/**
 * AI Visual Review — qualitative form feedback from a few timestamped stills
 * of the user's own video, for ANY exercise (the only path for exercises with
 * no tracking engine). OpenAI looks at the frames; this module owns the prompt,
 * the response schema and — most importantly — the deterministic rules applied
 * to the model's untrusted answer:
 *
 * - No rep count, angle, percentage or distance ever reaches the user.
 * - An issue must be seen in ≥ 2 frames; a single-frame issue becomes UNCERTAIN.
 * - Frame indices must be ones we sent; the timestamps shown are OURS, never the model's.
 * - More than one person, nobody, or a different exercise → no form findings at all.
 * - "No issue seen" is never presented as "good form".
 */

export const VISUAL_REVIEW_MAX_FRAMES = 12;
export const VISUAL_REVIEW_MIN_FRAMES = 4;

export type VisualReviewStatus =
  | "OBSERVED_ISSUE"
  | "NO_SUPPORTED_ISSUE_OBSERVED"
  | "UNCERTAIN"
  | "NOT_ASSESSABLE";

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
  exerciseMatch: "matches" | "different" | "unclear";
  view: "side" | "front" | "back" | "oblique" | "unclear";
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

const VIEWS = ["side", "front", "back", "oblique", "unclear"] as const;

export const VISUAL_REVIEW_SYSTEM_PROMPT = `
You are a careful strength coach reviewing still frames taken in time order from ONE video of a lifter.
You see only these stills — not the motion between them.

Report ONLY what is visible. Rules:
- people_in_view: count people WITHIN each single frame — the same lifter appearing in several frames is ONE person. "more_than_one" only if some single frame shows two or more different people (including someone in the background), and list those frame numbers in multi_person_frames; otherwise multi_person_frames is []. "none" if no person is visible in any frame.
- edited_or_composite: true when the stills are not one continuous recording — split screen, picture-in-picture, or a cut to a different scene or camera angle; otherwise false.
- seen_movement: a short noun phrase for the movement you see, e.g. "a kettlebell goblet squat".
- exercise_match: compare what you see with the exercise the user named. "different" only when the frames clearly show another movement.
- view: the camera angle relative to the lifter.
- assessable: "no" when the lifter is mostly out of frame, too dark, too small, blocked, or the frames do not show the movement; "partly" when only some aspects can be judged from this angle.
- missing: what you could not see that a coach would need (e.g. "feet cut off", "back view hides knee position"), or "".
- filming_tip: one short tip for a better clip, or "".
- observations: at most 3. kind "issue" = a technique problem you can SEE in specific frames; "positive" = something clearly done well; "uncertain" = possible but not clear.
  - frames: the frame numbers (as labelled) where it is visible. An issue must be visible in at least two frames.
  - confidence: "high" only when it is unmistakable in those frames from this camera angle (for a positive too); otherwise "medium" or "low".
  - what: one plain sentence about what is visible. cue: one short practical coaching cue ("" for positive).
- NEVER state numbers: no joint angles, degrees, percentages, distances, speeds, or rep counts.
- NEVER diagnose injuries, pain or medical conditions, or claim injury risk.
- Do not call the form "perfect" or "correct"; if you see no problem, return no issue observations.
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
      required: ["people_in_view", "multi_person_frames", "edited_or_composite", "exercise_match", "seen_movement", "view", "assessable", "missing", "filming_tip", "observations"],
      properties: {
        people_in_view: { type: "string", enum: ["one", "more_than_one", "none", "unclear"] },
        multi_person_frames: { type: "array", items: { type: "integer" } },
        edited_or_composite: { type: "boolean" },
        exercise_match: { type: "string", enum: ["matches", "different", "unclear"] },
        seen_movement: { type: "string" },
        view: { type: "string", enum: [...VIEWS] },
        assessable: { type: "string", enum: ["yes", "partly", "no"] },
        missing: { type: "string" },
        filming_tip: { type: "string" },
        observations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "frames", "what", "cue", "confidence"],
            properties: {
              kind: { type: "string", enum: ["issue", "positive", "uncertain"] },
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

export function visualReviewUserText(exerciseLabel: string, frameTimesMs: number[], lens: AthleteLens | null): string {
  return [
    `Exercise the user says this is: "${clip(exerciseLabel, 80)}" (a user-provided label, not proof).`,
    `Frames follow in order, labelled Frame 1…${frameTimesMs.length} with their video time.`,
    athleteLensText(lens),
  ].join("\n");
}

/** Any number with a measurement unit, or a rep count — never shown, because the stills cannot support it. */
const NUMERIC_CLAIM = /\d+(\.\d+)?\s*(°|deg|degree|%|percent|cm|mm|inch|in\b|m\b|m\/s|reps?\b|times\b|kg|lb)/i;
// Injury-risk language counts too ("stress the joints", "joint stress"): the stills can't support it (S3 eval 2026-11-03).
const MEDICAL = /\b(injur|pain|hurt|diagnos|tear|strain|sprain|herniat|risk of|unsafe|dangerous|damag|joint stress|stress (on |to )?(the |your )?(joints?|knees?|back|spine|shoulders?|neck))/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? clip(v, max) : "");

/**
 * Applies the module's rules to the model's untrusted JSON. Returns null when
 * the reply isn't usable at all (the route reports "temporarily unavailable").
 */
export function sanitizeVisualReview(raw: unknown, frameTimesMs: number[], exerciseLabel: string): VisualReview | null {
  if (!isRecord(raw)) return null;

  // "More than one person" must point at a frame we sent; an unsupported claim counts as "unclear", not as a refusal.
  const multiFrames = Array.isArray(raw.multi_person_frames)
    ? raw.multi_person_frames.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= frameTimesMs.length)
    : [];
  const people = raw.people_in_view === "more_than_one" && multiFrames.length === 0 ? "unclear" : raw.people_in_view;
  const exerciseMatch = raw.exercise_match === "matches" || raw.exercise_match === "different" ? raw.exercise_match : "unclear";
  const view = VIEWS.find((v) => v === raw.view) ?? "unclear";
  const assessable = raw.assessable === "yes" || raw.assessable === "partly" ? raw.assessable : "no";
  const seenMovement = str(raw.seen_movement, 120);
  const missing = str(raw.missing, 160) || null;
  const filmingTip = str(raw.filming_tip, 160) || null;
  const base = { seenMovement, exerciseMatch, view, filmingTip, frameCount: frameTimesMs.length } as const;

  const notAssessable = (limitation: string, tip: string | null = filmingTip): VisualReview => ({
    ...base,
    filmingTip: tip,
    status: "NOT_ASSESSABLE",
    limitation,
    observations: [],
  });

  if (people === "more_than_one") {
    return notAssessable(
      `More than one person is visible (${multiFrames.slice(0, 3).map((n) => `${(frameTimesMs[n - 1] / 1000).toFixed(1)} s`).join(", ")}), so the review can't be sure whose technique it is looking at. No form findings are given.`,
      "Film with only you in view.",
    );
  }
  if (raw.edited_or_composite === true) {
    return notAssessable(
      "The video doesn't look like one continuous recording (split screen, inset or a cut to another shot), so it can't be sure every frame shows the same athlete. No form findings are given.",
      "Upload one continuous, unedited recording of your set.",
    );
  }
  if (people === "none") return notAssessable("No person was visible in the sampled frames.", filmingTip ?? "Keep your whole body in frame for the full set.");
  if (exerciseMatch === "different") {
    return notAssessable(
      `The video looks like ${seenMovement.replace(/[.]$/, "") || "a different movement"}, not ${clip(exerciseLabel, 80)}. Check the exercise you picked — no form findings are given for a movement that may not be the one named.`,
      null,
    );
  }
  if (assessable === "no") return notAssessable(missing ?? "The frames don't show enough of the lifter or the movement to review technique.");

  const observations: VisualObservation[] = [];
  const rawObs = Array.isArray(raw.observations) ? raw.observations : [];
  for (const entry of rawObs) {
    // AI praise is not shown at all. On a real clip its author labels "you're curving your spine" (S3 eval,
    // 2026-11-03) the model said "maintains a neutral spine" in 6/6 runs, citing 4 frames at high confidence —
    // no evidence bar catches confidently wrong reassurance. Positives come only from tracked measurement.
    if (!isRecord(entry) || entry.kind === "positive") continue;
    const what = str(entry.what, 220);
    const cue = str(entry.cue, 140);
    if (!what || NUMERIC_CLAIM.test(what) || NUMERIC_CLAIM.test(cue) || MEDICAL.test(what) || MEDICAL.test(cue)) continue;
    const frames = Array.isArray(entry.frames)
      ? [...new Set(entry.frames.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= frameTimesMs.length))].sort((a, b) => a - b)
      : [];
    if (frames.length === 0) continue; // a finding we can't point to in the video is not shown
    // One still is not a repetition, and a hedged issue is not an observation: both become "possibly".
    const kind = entry.kind === "issue" && frames.length >= 2 && entry.confidence === "high" ? "issue" : "uncertain";
    observations.push({ kind, what, cue: cue || null, atMs: frames.map((n) => frameTimesMs[n - 1]) });
  }

  // Most useful first, and few: up to two issues, one uncertain.
  const pick = (kind: VisualObservation["kind"], n: number) => observations.filter((o) => o.kind === kind).slice(0, n);
  const kept = [...pick("issue", 2), ...pick("uncertain", 1)];

  const hasIssue = kept.some((o) => o.kind === "issue");
  const status: VisualReviewStatus = hasIssue
    ? "OBSERVED_ISSUE"
    : assessable === "partly" || exerciseMatch === "unclear" || people === "unclear" || kept.some((o) => o.kind === "uncertain")
      ? "UNCERTAIN"
      : "NO_SUPPORTED_ISSUE_OBSERVED";

  const limitation =
    [
      exerciseMatch === "unclear" ? `It wasn't clear from the stills that this is ${clip(exerciseLabel, 80)} — confirm the exercise.` : null,
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
