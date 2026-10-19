import { describe, expect, it } from "vitest";
import { checkSafety } from "@/lib/dante-core/safety-layer";
import { validateSignalForPersistence } from "../coach-signal-store";
import { interpretSignalsForGemma } from "../gemma-consumer";
import { persistDanteSignals } from "../dante-signal-persistence";
import {
  buildDanteIntelligence, buildEarlyExitSignals, EARLY_EXIT_PUBLICATION, statesLowRecoveryExplicitly, toUserScopeRef,
  type DanteStateSnapshot, type EarlyExitClass,
} from "../dante-runtime";

const NOW = new Date("2026-10-12T08:00:00Z");
const MSG = "I slept badly and recovery feels low. How should I handle today?";
const scope = toUserScopeRef("user-1");
const verifiedLow: DanteStateSnapshot = { recovery: { hasCheckin: true, statusLabel: "Recovery Priority", painIllness: false }, trainingLoad: null };
const noCheckin: DanteStateSnapshot = { recovery: { hasCheckin: false, statusLabel: null, painIllness: false }, trainingLoad: null };
const goodCheckin: DanteStateSnapshot = { recovery: { hasCheckin: true, statusLabel: "Good", painIllness: false }, trainingLoad: null };
const early = (over: Partial<Parameters<typeof buildEarlyExitSignals>[0]> = {}) =>
  buildEarlyExitSignals({ userScope: scope, exit: "RISK_ACCUMULATOR", safetyActive: false, recoveryIntent: true, message: MSG, state: verifiedLow, timezone: "Asia/Singapore", ...over }, NOW);

describe("AI-R1E.2a early-exit signal coverage", () => {
  it("1 natural low-recovery early exit with verified state emits CROSS_COACH_VERIFIED LOW_RECOVERY", () => {
    const [s] = early();
    expect(s).toMatchObject({ signalType: "LOW_RECOVERY", status: "CROSS_COACH_VERIFIED", sourceCoach: "DANTE" });
    expect(s.provenance).toContain("dante:athlete_state");
    expect(s.implications.every((i) => i.strength !== "HARD")).toBe(true);
  });

  it("2 same wording without verified state is never CROSS_COACH_VERIFIED", () => {
    for (const state of [null, noCheckin]) {
      const out = early({ state });
      expect(out.length).toBe(1);
      expect(out.some((s) => s.status === "CROSS_COACH_VERIFIED")).toBe(false);
    }
    // a canonical check-in that is NOT low outranks the user's words
    expect(early({ state: goodCheckin })).toEqual([]);
  });

  it("3 user-explicit statement keeps USER_EXPLICIT provenance, weak authority, no HARD", () => {
    const [s] = early({ state: noCheckin, message: "I slept 5 hours" });
    expect(s).toMatchObject({ status: "INFERENCE", uncertainty: "WEAK_SUPPORT", evidenceRefs: ["ev:user_explicit_recovery"] });
    expect(s.provenance).toContain("dante:user_explicit:current_turn");
    expect(s.provenance).not.toContain("dante:athlete_state");
    expect(statesLowRecoveryExplicitly("I slept 7 hours")).toBe(false);
  });

  it("4/5 hard safety and chest pain publish nothing, even with verified low state", () => {
    const chest = checkSafety("I have chest pain and my recovery feels low", {} as never);
    expect(chest.triggered).toBe(true);
    expect(early({ safetyActive: chest.triggered })).toEqual([]);
    expect(early({ exit: "HARD_SAFETY" })).toEqual([]);
    expect(EARLY_EXIT_PUBLICATION.HARD_SAFETY).toBe("FORBIDDEN");
    expect(EARLY_EXIT_PUBLICATION.N_OF_1).toBe("FORBIDDEN");
  });

  it("6 casual / tired / bad-day wording emits nothing", () => {
    for (const exit of ["CASUAL", "CORRECTION", "OTHER", "N_OF_1"] as EarlyExitClass[]) expect(early({ exit })).toEqual([]);
    for (const message of ["I'm tired", "I had a bad day", "I'm hungry"]) {
      expect(early({ state: noCheckin, message, recoveryIntent: false })).toEqual([]);
      expect(early({ state: noCheckin, message, recoveryIntent: true })).toEqual([]);
    }
  });

  it("7 correction exit does not emit even for a recovery-sounding correction", () => {
    expect(early({ exit: "CORRECTION", message: "I said no, my recovery is low" })).toEqual([]);
  });

  it("8 early and post-context share one idempotency key; explicit is superseded by the verified one", () => {
    const [e] = early();
    const post = buildDanteIntelligence(
      { runId: "run:x", userScope: scope, causal: false, explanation: true, agentToolIntent: false, safetyActive: false, state: verifiedLow, timezone: "Asia/Singapore",
        intent: { training: false, nutrition: false, recovery: true, health: false, supplement: false } },
      NOW,
    );
    if (post.status === "FAILED") throw new Error(post.reason);
    const p = post.signals.find((s) => s.signalType === "LOW_RECOVERY")!;
    expect(e.idempotencyKey).toBe(p.idempotencyKey);
    expect(e.id).toBe(p.id);
    const [x] = early({ state: noCheckin });
    expect(e.supersedes).toContain(x.id);
    expect(x.idempotencyKey).not.toBe(e.idempotencyKey);
  });

  it("9 a signal for another user cannot be persisted", () => {
    const [e] = early();
    expect(validateSignalForPersistence(e, "user-1")).toEqual([]);
    expect(validateSignalForPersistence(e, "user-2")).toContain("USER_SCOPE_MISMATCH");
  });

  it("10 persistence failure never throws", async () => {
    const signals = early();
    await expect(persistDanteSignals({ userId: "user-1", signals, getClient: () => { throw new Error("no key"); } })).resolves.toBeUndefined();
  });

  it("11 unmodified Gemma consumer reads both verified and user-explicit signals", () => {
    for (const out of [early(), early({ state: noCheckin })]) {
      const c = interpretSignalsForGemma(out, "user-1", NOW);
      expect(c.signalLoaded).toBe(true);
      expect(c.directives).toEqual(["AVOID_AGGRESSIVE_DEFICIT"]);
    }
  });
});
