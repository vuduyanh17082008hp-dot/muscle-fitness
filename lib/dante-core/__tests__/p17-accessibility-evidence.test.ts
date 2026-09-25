/**
 * P-17 / P-18 — accessible communication + evidence controller lite.
 */
import { describe, expect, it } from "vitest";
import {
  applyEvidenceLite,
  classifyClaimGrounding,
  detectHideStatistics,
  detectSimpleLanguage,
  finishCoherenceDraft,
  prepareCoherenceTurn,
  resolveAccessibleProfile,
} from "@/lib/dante-core/coherence";
import { baselinePlan } from "@/lib/dante-core/coherence/expression";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";

function scopeOf(message: string) {
  return prepareCoherenceTurn({ message, now: NOW, sessionId: "p17-scope" })
    .analysis.obligations.find((o) => o.intent === "OPEN_REQUEST")
    ?.reasoningScope;
}

const NOW = "2026-09-21T12:00:00.000Z";
const KNEE =
  "Bro, I'm new to the gym, my English isn't very good, and I can't afford a personal trainer. My knee hurts a little when I squat today. Don't give me statistics, and don't diagnose me. Should I keep training today, what should I change right now, and when should I stop and get professional help?";
const JEALOUS = "I'm a rookie in the gym. I'm jealous of people benching 225kg.";
const HIDE = "from now on, move all the statistics away okay?";
const WHAT_NOW = "so what should I do now";
const STATS = /recovery score|\b\d+\s*%\b|\bkcal\b|readiness|\bcalorie/i;
const DIAGNOSIS = /\b(?:tear|sprain|tendin|meniscus|diagnos(?:is|ed)|you have a)\b/i;
const CS = /hope that helps|feel free to ask|happy to help|if you have any (?:other )?questions/i;
const PRESCRIBE = /\bleg press\b|\bbulgarian split\b|\bleg extension\b/i;

function turn(message: string, draft?: string, prior?: ReturnType<typeof prepareCoherenceTurn>["state"]) {
  const prepared = prepareCoherenceTurn({ message, now: NOW, sessionId: "p17", prior: prior ?? null });
  const finished = finishCoherenceDraft({
    prepared,
    message,
    ...(draft !== undefined ? { phase1Draft: draft } : {}),
  });
  return { prepared, finished };
}

describe("P-17 accessible communication", () => {
  it("A. simple-English request is structurally SIMPLE", () => {
    const message = "My English isn't very good. Explain simply.";
    expect(detectSimpleLanguage(message)).toBe(true);
    const profile = resolveAccessibleProfile({ message, language: "en", plan: baselinePlan() });
    expect(profile.complexity).toBe("SIMPLE");
    expect(profile.accessibilityMode).toBe("SIMPLIFIED");
    const text = turn(message, "Utilize a subsequent hypertrophy stimulus regarding volume.").finished.response;
    expect(text.toLowerCase()).not.toMatch(/utilize|subsequent|regarding/);
  });

  it("B. neutral expert user is not dumbed down", () => {
    const message = "Walk me through the RIR progression for my bench mesocycle.";
    expect(detectSimpleLanguage(message)).toBe(false);
    expect(resolveAccessibleProfile({ message, language: "en", plan: baselinePlan() }).complexity).toBe("DEFAULT");
    expect(turn(message, "Add a set when you hit 3 RIR for two sessions.").finished.response).toMatch(/RIR/);
  });

  it("C. don't give me statistics hides metrics from output", () => {
    const message = "don't give me statistics. Should I train?";
    expect(detectHideStatistics(message)).toBe(true);
    const text = turn(message, "Train. Your recovery score is 72 and readiness is 81.").finished.response;
    expect(text).not.toMatch(STATS);
    expect(extractCurrentTurnState("don't give me statistics. Recovery score is 72.").recoveryScore).toBe(72);
  });

  it("D. don't use my recovery data is P-15 exclusion, not presentation hide", () => {
    const message = "don't use my recovery data. Should I train?";
    expect(detectHideStatistics(message)).toBe(false);
    expect(scopeOf(message)?.mode).toBe("EXCLUDE");
    expect(scopeOf(message)?.excludedFactors).toContain("recovery");
    expect(scopeOf("don't give me statistics. Should I train?")?.mode).not.toBe("EXCLUDE");
  });

  it("E. hide-statistics preference survives the next session turn", () => {
    const first = turn(HIDE, "Got it.");
    expect(first.prepared.analysis.boundaries.some((b) => b.kind === "hide_statistics")).toBe(true);
    const next = turn(WHAT_NOW, "Your recovery score is 55 so maybe rest.", first.finished.state);
    expect(resolveAccessibleProfile({
      message: WHAT_NOW,
      language: "en",
      plan: next.prepared.expressionPlan,
      snapshot: next.prepared.state,
    }).statisticsVisibility).toBe("HIDE");
    expect(next.finished.response).not.toMatch(STATS);
  });
});

describe("P-18 evidence controller lite", () => {
  it("A. general coaching with no telemetry is allowed", () => {
    expect(classifyClaimGrounding("Pick a weight you can control and add a small plate when it is easy.")).toBe("GENERAL_GUIDANCE");
    const text = applyEvidenceLite({
      draft: "Pick a weight you can control and add a small plate when it is easy.",
      language: "en",
    });
    expect(text).toMatch(/weight you can control/i);
    expect(text).not.toMatch(/cannot ground|verified data/i);
  });

  it("B. recovery-score claim without evidence is blocked", () => {
    expect(classifyClaimGrounding("Your recovery score is 72.")).toBe("VERIFIED_DATA_CLAIM");
    expect(applyEvidenceLite({
      draft: "Your recovery score is 72.",
      language: "en",
    })).not.toMatch(/72/);
  });

  it("C. verified recovery claim with evidence is allowed", () => {
    expect(applyEvidenceLite({
      draft: "Your recovery score is 72.",
      hasVerifiedData: true,
      language: "en",
    })).toMatch(/72/);
  });

  it("D. safety guidance without telemetry is allowed", () => {
    expect(classifyClaimGrounding("Don't push through knee pain. Stop if the pain gets worse.")).toBe("SAFETY_GUIDANCE");
    expect(applyEvidenceLite({
      draft: "Don't push through knee pain. Stop if the pain gets worse.",
      language: "en",
    })).toMatch(/don't push through knee pain/i);
  });

  it("E. diagnosis request with no basis is not diagnosed", () => {
    expect(classifyClaimGrounding("You have a meniscus tear.")).toBe("DIAGNOSTIC_OR_MEDICAL_CLAIM");
    expect(applyEvidenceLite({
      draft: "You have a meniscus tear.",
      language: "en",
    })).not.toMatch(DIAGNOSIS);
  });
});

describe("knee competition case", () => {
  it("answers directly in simple English without stats, diagnosis, or over-prescribing", () => {
    const { finished, prepared } = turn(KNEE);
    const text = finished.response;
    expect(prepared.analysis.boundaries.some((b) => b.kind === "simple_language")).toBe(true);
    expect(prepared.analysis.boundaries.some((b) => b.kind === "hide_statistics")).toBe(true);
    expect(extractCurrentTurnState(KNEE).experienceSelfDesc).toBe("ROOKIE");
    expect(text).toMatch(/don['’]?t keep doing squats if they hurt/i);
    expect(text).toMatch(/movements that don['’]?t cause knee pain|don't cause knee pain/i);
    expect(text).toMatch(/stop if/i);
    expect(text).toMatch(/swell|gives way|locks|weight/i);
    expect(text).toMatch(/doctor or physio/i);
    expect(text).not.toMatch(STATS);
    expect(text).not.toMatch(DIAGNOSIS);
    expect(text).not.toMatch(PRESCRIBE);
    expect(text).not.toMatch(CS);
    expect(text).not.toMatch(/advanced experience/i);
    expect(text.split(/[.!?]/).filter((s) => s.trim()).length).toBeGreaterThanOrEqual(3);
  });
});

describe("continuity transcript", () => {
  it("225kg → hide stats → what now keeps bench antecedent and hides metrics", () => {
    const t1 = turn(JEALOUS, "Given your advanced experience, people benching 225kg can wait. Your recovery score is 80.");
    expect(t1.finished.response).not.toMatch(/advanced experience/i);
    const t2 = turn(HIDE, "Okay.", t1.finished.state);
    const t3 = turn(WHAT_NOW, undefined, t2.finished.state);
    expect(t3.prepared.state.topicStack).toContain("bench");
    expect(t3.finished.response).toMatch(/bench|225|plate|rep/i);
    expect(t3.finished.response).not.toMatch(STATS);
    expect(t3.finished.response).not.toMatch(/cannot ground|can't confidently answer|verified data/i);
    expect(t3.finished.response).not.toMatch(/advanced experience/i);
  });
});

describe("mutation checks", () => {
  it("HIDE statistics does not delete internal recovery data", () => {
    const state = extractCurrentTurnState("don't give me statistics. Recovery score is 64.");
    expect(state.recoveryScore).toBe(64);
    expect(detectHideStatistics("don't give me statistics")).toBe(true);
  });

  it("hidden statistics do not return on the immediate follow-up", () => {
    const hidden = turn(HIDE, "Noted.");
    expect(turn("so what should I do now", "Readiness 91 and 2800 kcal.", hidden.finished.state).finished.response).not.toMatch(STATS);
  });

  it("simple-English request is not ignored", () => {
    expect(turn("Keep it simple. What is progressive overload?", "Progressive overload is adding a bit more work over time.").finished.response.length).toBeGreaterThan(10);
    expect(detectSimpleLanguage("Keep it simple.")).toBe(true);
  });

  it("GENERAL_GUIDANCE does not require telemetry", () => {
    expect(applyEvidenceLite({
      draft: "Make your next small improvement the target.",
      language: "en",
    })).toMatch(/next small improvement/i);
  });

  it("VERIFIED_DATA_CLAIM is not allowed without evidence", () => {
    expect(applyEvidenceLite({ draft: "Your recovery score is 72.", language: "en" })).not.toMatch(/recovery score is 72/i);
  });

  it("P-15 exclusion is not the same as hiding statistics", () => {
    expect(detectHideStatistics("don't use my recovery data")).toBe(false);
    expect(scopeOf("don't use my recovery data. Should I train?")?.mode).toBe("EXCLUDE");
    expect(scopeOf("don't give me statistics. Should I train?")?.mode).toBe("NONE");
  });
});
