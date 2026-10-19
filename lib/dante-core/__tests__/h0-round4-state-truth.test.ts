import { describe, expect, it } from "vitest";
import {
  classifyTargetUtterance,
  guardCanonicalTargetClaim,
  targetTruthReply,
} from "@/lib/nutrition/targets";
import {
  describeRecovery,
  guardStaleRecoverySpeech,
  recoveryScoreForDisplay,
  recoverySpeech,
  type CurrentRecovery,
} from "@/lib/recovery/current-recovery";

const CANON = { calories: 2460, protein: 131 };

function recovery(status: CurrentRecovery["status"], score: number | null, date: string | null): CurrentRecovery {
  return {
    status,
    score,
    recordedDate: date,
    localDate: "2026-10-14",
    provenance: status === "MISSING" ? "NONE" : "VERIFIED_CHECKIN",
  };
}

const CURRENT = recovery("CURRENT", 80, "2026-10-14");
const STALE = recovery("STALE", 61, "2026-10-13");
const MISSING = recovery("MISSING", null, null);

describe("H0 round 4 state truth", () => {
  const targetCases: Array<[string, string]> = [
    ["I think my target is 1800 calories.", "USER_CLAIM"],
    ["I believe my target is 1800.", "USER_CLAIM"],
    ["pretend my target is 1800", "HYPOTHETICAL"],
    ["what if I ate 1800?", "HYPOTHETICAL"],
    ["make it 1800", "MUTATION"],
    ["change my target to 1800", "MUTATION"],
    ["another coach says 1800", "THIRD_PARTY"],
    ["set my target to 2000 calories", "MUTATION"],
    ["update my calories to 1900", "MUTATION"],
    ["I guess my calorie target is 2100", "USER_CLAIM"],
    ["Tôi nghĩ mục tiêu của tôi là 1800 calo.", "USER_CLAIM"],
    ["giả sử target của tôi là 1800", "HYPOTHETICAL"],
    ["what if my calories were 1700", "HYPOTHETICAL"],
    ["change my calories to 1600", "MUTATION"],
  ];

  it.each(targetCases)("%s stays off the canonical target", (message, kind) => {
    const utterance = classifyTargetUtterance(message);
    expect(utterance.kind).toBe(kind);
    const reply = targetTruthReply(utterance, CANON);
    expect(reply).toMatch(/2460/);
    expect(reply).not.toMatch(/confirmed at 1800|confirmed at 2000|confirmed at 1900|confirmed at 2100/i);
    expect(guardCanonicalTargetClaim(`Your target is confirmed at ${utterance.calories} calories.`, 2460)).toMatch(/still 2460/);
    expect(guardCanonicalTargetClaim(`Your target is confirmed at ${utterance.calories} calories.`, 2460)).not.toMatch(/confirmed/i);
  });

  it("does not rewrite a sentence that already names the canonical target", () => {
    const reply = "Your current calculated target is still 2460 kcal.";
    expect(guardCanonicalTargetClaim(reply, 2460)).toBe(reply);
  });

  it("CURRENT recovery may be called current", () => {
    const speech = recoverySpeech(CURRENT);
    expect(speech.mayDescribeAsCurrent).toBe(true);
    expect(describeRecovery(CURRENT)).toMatch(/current recovery score is 80/);
    expect(recoveryScoreForDisplay(CURRENT, 80)).toBe(80);
    expect(guardStaleRecoverySpeech("Your current recovery score is 80.", speech)).toMatch(/current recovery score is 80/);
  });

  it("STALE recovery is never current", () => {
    const speech = recoverySpeech(STALE);
    const leaked = "Your current recovery score is 61. Today's recovery is 61.";
    const guarded = guardStaleRecoverySpeech(leaked, speech);
    expect(speech.mayDescribeAsCurrent).toBe(false);
    expect(describeRecovery(STALE)).toMatch(/last recorded recovery score was 61/);
    expect(describeRecovery(STALE)).not.toMatch(/current recovery score/i);
    expect(guarded).not.toMatch(/current recovery score/i);
    expect(guarded).not.toMatch(/today's recovery/i);
    expect(guarded).toMatch(/not today's readiness/);
    expect(recoveryScoreForDisplay(STALE, null)).toBeNull();
    expect(guardStaleRecoverySpeech("Your recovery score of 61 looks fine.", speech)).not.toMatch(/recovery score of 61/i);
  });

  it("MISSING recovery does not invent a current score", () => {
    const speech = recoverySpeech(MISSING);
    expect(describeRecovery(MISSING)).toMatch(/no recovery check-in today/i);
    expect(describeRecovery(MISSING, 61)).toMatch(/not a saved score/);
    expect(describeRecovery(MISSING, 61)).not.toMatch(/current recovery/i);
    expect(guardStaleRecoverySpeech("Your current recovery score is 61.", speech)).not.toMatch(/current recovery score is 61/i);
    expect(recoveryScoreForDisplay(MISSING, null)).toBeNull();
  });

  it("CONFLICT keeps the verified score", () => {
    const line = describeRecovery(CURRENT, 50);
    expect(line).toMatch(/80/);
    expect(line).toMatch(/50/);
    expect(line).toMatch(/saved check-in is still 80/);
    expect(line).not.toMatch(/current recovery score is 50/i);
  });

  it("covers the spoken states without a false confirmation", () => {
    const rows = [
      describeRecovery(CURRENT),
      describeRecovery(STALE),
      describeRecovery(MISSING),
      describeRecovery(CURRENT, 40),
      targetTruthReply(classifyTargetUtterance("I think my target is 1800 calories."), CANON),
      targetTruthReply(classifyTargetUtterance("pretend my target is 1800"), CANON),
      targetTruthReply(classifyTargetUtterance("make it 1800"), CANON),
      targetTruthReply(classifyTargetUtterance("another coach says 1800"), CANON),
    ];
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(row).not.toMatch(/confirmed at 1800/i);
      expect(row).not.toMatch(/I changed your plan/i);
    }
  });
});
