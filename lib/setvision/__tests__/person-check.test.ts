import { describe, expect, it } from "vitest";

import { analyzeFrameSequence, PERSON_CHECK_NOT_RUN } from "@/lib/setvision/analyze";
import { checkPersonAttribution, RESIDUAL_LIMITATION } from "@/lib/setvision/person-check";
import type { DetectedPerson, TimedPoseFrame } from "@/lib/setvision/types";

const athlete = { left_shoulder: { x: 100, y: 100, score: 0.9 }, left_hip: { x: 100, y: 200, score: 0.9 } };
const person = (id: number | null, cx = 100, score = 0.6, visible = 17): DetectedPerson => ({ id, score, visible, cx, cy: 150 });
const clip = (people: (DetectedPerson[] | null | undefined)[]): TimedPoseFrame[] =>
  people.map((p, i) => ({ timestampMs: i * 100, frame: athlete, ...(p === undefined ? {} : { people: p }) }));
const same = (n: number, p: DetectedPerson[] | null | undefined) => Array.from({ length: n }, () => p);

describe("checkPersonAttribution", () => {
  it("one tracked person throughout → single, with the residual limitation", () => {
    const r = checkPersonAttribution(clip(same(20, [person(1)])));
    expect(r.verdict).toBe("single");
    expect(r.limitations).toEqual([RESIDUAL_LIMITATION]);
  });

  it("a second credible person in ≥ 2 consecutive samples → multiple, with when", () => {
    const r = checkPersonAttribution(clip([...same(5, [person(1)]), ...same(3, [person(1), person(2, 600)]), ...same(5, [person(1)])]));
    expect(r.verdict).toBe("multiple");
    expect("reason" in r && r.reason).toMatch(/0\.5 s–0\.7 s.*Re-record with only you in view/);
  });

  it("a weak/partial detection is not a person; a one-sample blip is disclosed, not refused", () => {
    expect(checkPersonAttribution(clip(same(10, [person(1), person(2, 600, 0.15)]))).verdict).toBe("single");
    expect(checkPersonAttribution(clip(same(10, [person(1), person(2, 600, 0.5, 5)]))).verdict).toBe("single");
    const blip = checkPersonAttribution(clip([...same(5, [person(1)]), [person(1), person(2, 600)], ...same(5, [person(1)])]));
    expect(blip.verdict).toBe("single");
    expect(blip.limitations[0]).toMatch(/briefly detected in single frames \(0\.5 s\)/);
  });

  it("the lone person's tracker id changes (swap, re-entry after leaving/occlusion) → identity_changed", () => {
    const r = checkPersonAttribution(clip([...same(6, [person(1)]), ...same(3, []), ...same(6, [person(4, 700)])]));
    expect(r.verdict).toBe("identity_changed");
    expect("reason" in r && r.reason).toMatch(/new identity at 0\.9 s/);
  });

  it("seeing nobody (or a failed check) while a body is tracked is not proof of one person → unconfirmed", () => {
    expect(checkPersonAttribution(clip(same(10, []))).verdict).toBe("unconfirmed");
    expect(checkPersonAttribution(clip(same(10, null))).verdict).toBe("unconfirmed");
  });

  it("frames that never went through the check → not_run (old fixtures only)", () => {
    expect(checkPersonAttribution(clip(same(5, undefined))).verdict).toBe("not_run");
  });
});

describe("analyzeFrameSequence × person check", () => {
  it("refuses with 0 reps and confidence 0 when a second person is present", () => {
    const r = analyzeFrameSequence(clip(same(10, [person(1), person(2, 600)])), { exercise: "squat" });
    expect(r.reps).toBe(0);
    expect(r.confidence).toBe(0);
    expect(r.abstainReason).toMatch(/More than one person/);
  });

  it("states that the check did not run instead of implying one person", () => {
    const r = analyzeFrameSequence(clip(same(10, undefined)), { exercise: "squat" });
    expect(r.limitations).toContain(PERSON_CHECK_NOT_RUN);
  });
});
