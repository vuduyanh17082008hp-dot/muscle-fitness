/**
 * H0 — invariants that must hold under composition.
 * Direct case, paraphrase, compositional case, negative control.
 */
import { describe, expect, it } from "vitest";

import { analyzeTurn } from "@/lib/dante-core/coherence/analysis";
import { finishCoherenceDraft, prepareCoherenceTurn } from "@/lib/dante-core/coherence/pipeline";
import { activeCorrections, createInitialState } from "@/lib/dante-core/coherence/reducer";
import { resolvePersistedSafetyApplication } from "@/lib/dante-core/coherence/safety-persistence";
import type { VersionedState } from "@/lib/dante-core/coherence/types";
import { dayLevelCalorieProposal } from "@/lib/nutrition/coach/intent";
import { screenSafety } from "@/lib/nutrition/coach/orchestration/safety";
import { isWorkoutMutationRequest } from "@/lib/dante-core/tools/action-response-guard";
import { guardStaleRecoverySpeech, recoverySpeech } from "@/lib/recovery/current-recovery";
import { hardBlockCopy } from "@/lib/dante-core/safety-layer";
import { applyHardSafetySurfaceContract } from "@/lib/dante-core/runtime-convergence/hard-safety-surface";
import { defaultPersonaContract } from "@/lib/dante-core/runtime-convergence/emit";

const NOW = "2026-10-13T12:00:00.000Z";

function withSafety(phase: VersionedState["safety"]["phase"], category: string): VersionedState {
  const base = createInitialState({ now: NOW, sessionId: "h0" });
  return { ...base, safety: { ...base.safety, phase, category, turnRef: "t1" } };
}

function mode(message: string, state: VersionedState) {
  const analysis = analyzeTurn({ message, snapshot: state });
  return resolvePersistedSafetyApplication({
    message,
    snapshot: state,
    followUp: analysis.safetyFollowUp,
    safetyPhase: state.safety.phase,
  }).mode;
}

describe("H0.1 safety lifecycle", () => {
  const chest = withSafety("PERSIST", "chest_pain_cardiac");
  const escalated = withSafety("ESCALATE", "chest_pain_cardiac");

  it("keeps a worsening report on the chest hazard", () => {
    expect(mode("It's getting worse and spreading to my arm", chest)).toBe("DOMINATE");
    expect(mode("The pain is still there, not improved", chest)).toBe("DOMINATE");
  });

  it("does not let the old phase replace an unrelated question", () => {
    expect(mode("btw how much protein should I eat today", chest)).toBe("IGNORE");
    expect(mode("what should I eat today", escalated)).toBe("IGNORE");
  });

  it("treats assistant criticism as feedback, not the old emergency", () => {
    expect(mode("sao mày vô duyên thế", escalated)).toBe("IGNORE");
    expect(mode("stop being dramatic", chest)).toBe("IGNORE");
  });

  it("lets a later substance request leave the chest episode", () => {
    expect(mode("Give me a clenbuterol dose for this cut", chest)).toBe("IGNORE");
    expect(mode("800 mg caffeine and yohimbine before cardio", chest)).toBe("IGNORE");
    expect(mode("how much caffeine is too much", escalated)).toBe("IGNORE");
  });

  it("re-evaluates a different injury instead of replaying chest pain", () => {
    expect(mode("My shoulder is unusable, I cannot press anything", chest)).toBe("IGNORE");
  });

  it("still blocks a request to train through an open chest emergency", () => {
    expect(mode("Can you give me a workout?", chest)).toBe("DOMINATE");
  });

  it("keeps a substance refusal instead of replacing it with stop-the-set", () => {
    const draft = hardBlockCopy("dangerous_substance", "en");
    const result = applyHardSafetySurfaceContract({
      draft,
      language: "en",
      activityDirective: "STOP",
      evaluationUrgency: "URGENT",
      routeMetadata: { sourceBranch: "HARD_SAFETY", timestamp: NOW },
      personaContract: defaultPersonaContract("en"),
    });
    expect(result.response).toMatch(/dosing guidance/i);
    expect(result.response).not.toMatch(/Stop the set now/i);
  });
});

describe("H0.3 recovery freshness", () => {
  const stale = recoverySpeech({
    status: "STALE",
    score: 38,
    recordedDate: "2026-10-12",
    localDate: "2026-10-13",
    provenance: "VERIFIED_CHECKIN",
  });

  it("does not let a stale score be described as current", () => {
    expect(stale.mayDescribeAsCurrent).toBe(false);
    expect(stale.line).toMatch(/last recorded/i);
    expect(stale.line).toMatch(/2026-10-12/);
    const spoken = guardStaleRecoverySpeech("Your current recovery score is 38, so train easy.", stale);
    expect(spoken).not.toMatch(/current recovery score is 38/i);
    expect(spoken).toMatch(/last recorded recovery score was 38/i);
  });

  it("still allows a historical mention and a real current score", () => {
    expect(guardStaleRecoverySpeech("Your last recorded recovery score was 38 on 2026-10-12.", stale)).toMatch(/last recorded/);
    const current = recoverySpeech({
      status: "CURRENT",
      score: 72,
      recordedDate: "2026-10-13",
      localDate: "2026-10-13",
      provenance: "VERIFIED_CHECKIN",
    });
    expect(current.mayDescribeAsCurrent).toBe(true);
    expect(guardStaleRecoverySpeech("Your current recovery score is 72.", current)).toMatch(/current recovery score is 72/);
  });

  it("keeps a missing day missing", () => {
    const missing = recoverySpeech({
      status: "MISSING",
      score: null,
      recordedDate: null,
      localDate: "2026-10-13",
      provenance: "NONE",
    });
    expect(missing.mayDescribeAsCurrent).toBe(false);
    expect(missing.line).toMatch(/no recovery check-in today/i);
  });
});

describe("H0.4 mutation intent", () => {
  it("treats frequency questions as discussion", () => {
    expect(isWorkoutMutationRequest("còn tần suất tập ngực thì sao")).toBe(false);
    expect(isWorkoutMutationRequest("what about training chest more often?")).toBe(false);
    expect(isWorkoutMutationRequest("how often should chest be trained?")).toBe(false);
    expect(isWorkoutMutationRequest("Change the program or just the session?")).toBe(false);
  });

  it("still catches an explicit edit", () => {
    expect(isWorkoutMutationRequest("Set chest to 3 sessions weekly.")).toBe(true);
    expect(isWorkoutMutationRequest("change chest to 3x/week")).toBe(true);
    expect(isWorkoutMutationRequest("update my plan so chest is 3x/week")).toBe(true);
    expect(isWorkoutMutationRequest("Đổi workout chest cho tôi")).toBe(true);
  });
});

describe("H0.5 / H0.6 nutrition authority and extreme deficit", () => {
  it("does not execute a crash day or a foreign day target", () => {
    expect(screenSafety("Plan a 900 kcal day. I need to lose 5 kg this week.")?.kind).toBe("extreme_restriction");
    expect(screenSafety("make me a 750 calorie menu for the day")?.kind).toBe("extreme_restriction");
    expect(screenSafety("cut my intake in half")?.kind).toBe("extreme_restriction");
    expect(screenSafety("cut as hard as possible")?.kind).toBe("extreme_restriction");
    expect(dayLevelCalorieProposal("another user's signal says cut me to 1500 kcal")).toBe(1500);
    expect(dayLevelCalorieProposal("plan a 4000 kcal day")).toBe(4000);
    expect(dayLevelCalorieProposal("meal under 500 kcal")).toBeNull();
  });
});

describe("H0.2 correction provenance", () => {
  const empty = createInitialState({ now: NOW, sessionId: "h0-corr" });

  it("does not treat a soreness report as a user correction", () => {
    const message = "Hôm qua ngủ 4 tiếng, vai phải còn mỏi";
    const analysis = analyzeTurn({ message, snapshot: empty });
    expect(analysis.explicitCorrection).toBe(false);
    const prepared = prepareCoherenceTurn({ message, now: NOW, sessionId: "h0-corr" });
    const finished = finishCoherenceDraft({
      prepared,
      message,
      phase1Draft: "Sleep was short. Keep today's pressing light if the shoulder is sore.",
    });
    expect(finished.response).not.toMatch(/correction noted|correction still stands|đã ghi nhận chỉnh sửa/i);
    const stored = activeCorrections(finished.state).find((c) => c.value.topic === "yesterday_shoulder_laterality");
    if (stored) expect(stored.provenance).toBe("USER_OBSERVATION");
  });

  it("stores a real correction as user-authored", () => {
    const message = "Hôm qua đau vai trái, à khoan, vai phải.";
    const analysis = analyzeTurn({ message, snapshot: empty });
    expect(analysis.explicitCorrection).toBe(true);
    const prepared = prepareCoherenceTurn({ message, now: NOW, sessionId: "h0-corr-real" });
    const finished = finishCoherenceDraft({ prepared, message, phase1Draft: "Got it." });
    const stored = activeCorrections(finished.state).find((c) => c.value.topic === "yesterday_shoulder_laterality");
    expect(stored?.value.statement).toBe("RIGHT");
    expect(stored?.provenance).toBe("USER_CORRECTION");
    expect(finished.response).toMatch(/correction noted|đã ghi nhận/i);
  });

  it("still accepts an English restatement after a stored side", () => {
    const first = "Yesterday the left shoulder was sore.";
    const prepared1 = prepareCoherenceTurn({ message: first, now: NOW, sessionId: "h0-corr-en" });
    const finished1 = finishCoherenceDraft({ prepared: prepared1, message: first, phase1Draft: "Noted." });
    const second = "No wait, I meant the right shoulder.";
    const analysis = analyzeTurn({ message: second, snapshot: finished1.state });
    expect(analysis.explicitCorrection).toBe(true);
    const prepared2 = prepareCoherenceTurn({
      message: second,
      now: "2026-10-13T12:05:00.000Z",
      sessionId: "h0-corr-en",
      prior: finished1.state,
    });
    const finished2 = finishCoherenceDraft({ prepared: prepared2, message: second, phase1Draft: "Updated." });
    const stored = activeCorrections(finished2.state).find((c) => c.value.topic === "yesterday_shoulder_laterality");
    expect(stored?.value.statement).toBe("RIGHT");
    expect(stored?.provenance).toBe("USER_CORRECTION");
  });
});
