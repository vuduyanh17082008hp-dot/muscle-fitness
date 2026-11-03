import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import type { SetVisionAnalysis } from "@/lib/setvision/types";
import type { VisualObservation, VisualReviewStatus } from "@/lib/setvision/visual-review";

/**
 * Deterministic form observations from a TRACKED analysis — only what the
 * engine actually measured, each tied to the reps/times it came from:
 *
 * - partial movements the engine saw but did not count (didn't reach the working end);
 * - a rep with clearly less joint range than the set's typical rep (only in a
 *   camera view where the engine reports range at all);
 * - one positive when range or rhythm stayed consistent over ≥ 3 reps.
 *
 * Nothing found is NO_SUPPORTED_ISSUE_OBSERVED, never "good form"; a clip whose
 * view hides range is UNCERTAIN, an abstained clip NOT_ASSESSABLE.
 */

/** A rep this much shallower than the set's median range is called out. */
// ponytail: a-priori 2D threshold, not fitted to coached clips; tune when labelled form data exists.
export const SHALLOW_REP_DEG = 15;
const CONSISTENT = 0.85;
const MIN_REPS = 3;

export type FormSummary = { status: VisualReviewStatus; observations: VisualObservation[]; note: string | null };

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function trackedFormObservations(analysis: SetVisionAnalysis): FormSummary {
  if (analysis.abstainReason || analysis.reps === 0) {
    return { status: "NOT_ASSESSABLE", observations: [], note: analysis.abstainReason ?? "No complete rep was measured, so technique wasn't assessed." };
  }

  const config = getExerciseConfig(analysis.exercise);
  const [, workEnd] = config.phaseNames;
  const joint = config.signalLabel.split(" (")[0];
  const issues: VisualObservation[] = [];
  const uncertain: VisualObservation[] = [];

  // A partial movement before the first counted rep is usually setup (unracking, picking the weight up), not a rep.
  const firstRepMs = Math.min(...analysis.perRep.tempo.map((t) => t.descentStartMs ?? t.ascentStartMs ?? Infinity));
  const partial = (analysis.events ?? []).filter((e) => e.kind === "partial" && e.startMs > firstRepMs);
  const roms = analysis.perRep.rom;
  // Depth is only a measurement where the engine reports joint range (the movement's own camera view).
  // From another view the projected angle wobbles: on a real front-view goblet squat (kb-goblet, 2026-11-03)
  // each full-depth descent was split into a "partial" + a rep. There it is only a "possibly".
  const rangeMeasured = roms.length > 0;
  if (partial.length > 0) {
    const what = `${partial.length === 1 ? "One movement" : `${partial.length} movements`} left the start position but didn't reach the ${workEnd.toLowerCase()} position, so ${partial.length === 1 ? "it wasn't" : "they weren't"} counted.`;
    (rangeMeasured ? issues : uncertain).push({
      kind: rangeMeasured ? "issue" : "uncertain",
      what: rangeMeasured ? what : `${what} From this camera angle depth can't be measured, so check those moments in the video.`,
      cue: `Take every rep to the same ${workEnd.toLowerCase()} position as your best reps.`,
      atMs: partial.map((e) => e.startMs),
    });
  }

  if (roms.length >= MIN_REPS) {
    const typical = median(roms.map((r) => r.rangeDeg));
    const shallow = roms.filter((r) => r.rangeDeg < typical - SHALLOW_REP_DEG);
    if (shallow.length > 0) {
      const times = shallow
        .map((r) => analysis.perRep.tempo.find((t) => t.repNumber === r.repNumber)?.bottomReachedMs ?? analysis.perRep.tempo.find((t) => t.repNumber === r.repNumber)?.ascentStartMs ?? null)
        .filter((t): t is number => t !== null);
      issues.push({
        kind: "issue",
        what: `Rep${shallow.length > 1 ? "s" : ""} ${shallow.map((r) => r.repNumber).join(", ")} had clearly less ${joint} range than your typical rep in this set.`,
        cue: `Match the ${workEnd.toLowerCase()} position of your other reps — slow down a little if the last reps get shorter.`,
        atMs: times,
      });
    }
  }

  const positives: VisualObservation[] = [];
  if (issues.length === 0 && analysis.reps >= MIN_REPS) {
    if ((analysis.technique.romConsistency ?? 0) >= CONSISTENT) {
      positives.push({ kind: "positive", what: `Your ${joint} range stayed consistent from rep to rep.`, cue: null, atMs: [] });
    } else if ((analysis.technique.tempoConsistency ?? 0) >= CONSISTENT) {
      positives.push({ kind: "positive", what: "Your rep rhythm stayed steady across the set.", cue: null, atMs: [] });
    }
  }

  const status: VisualReviewStatus = issues.length > 0 ? "OBSERVED_ISSUE" : rangeMeasured ? "NO_SUPPORTED_ISSUE_OBSERVED" : "UNCERTAIN";
  const note = !rangeMeasured
    ? `From this camera angle the ${joint} range isn't measured, so only rep timing was checked. ${config.views}`
    : issues.length === 0
      ? "No issue the tracker can measure (partial reps, uneven range) was found. It doesn't check everything a coach would — an AI visual review can look at the rest."
      : null;

  return { status, observations: [...issues, ...positives, ...uncertain], note };
}
