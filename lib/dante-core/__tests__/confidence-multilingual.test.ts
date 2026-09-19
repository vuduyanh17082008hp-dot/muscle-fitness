import { describe, expect, it } from "vitest";
import { assessTurnConfidence } from "@/lib/dante-core/confidence-engine/assess";
import { buildConfidenceDeterministicReply } from "@/lib/dante-core/confidence-engine/deterministic-reply";
import { extractCurrentTurnState } from "@/lib/dante-core/current-turn-state";

describe("confidence — multilingual caffeine precision", () => {
  it.each([
    ["vi", "300mg cafe rồi, chắc hôm nay khỏe hơn nhiều đúng không?"],
    ["en", "I've had 300mg caffeine, so I'll definitely be stronger today, right?"],
    ["mixed", "300mg caffeine rồi, performance chắc better nhiều nhỉ?"],
  ] as const)("%s rejects unsupported performance certainty", (_label, message) => {
    const state = extractCurrentTurnState(message);
    const assessment = assessTurnConfidence({ message, currentState: state });
    const effect = assessment.claims.find((claim) => claim.claimId === "caffeine_performance_effect");
    expect(effect?.level).toMatch(/INSUFFICIENT_EVIDENCE|LOW/);

    const reply = buildConfidenceDeterministicReply(assessment, _label === "en" ? "en" : "vi");
    expect(reply).toBeTruthy();
    expect(reply).not.toMatch(/will improve|sẽ làm.*mạnh hơn chắc chắn|definitely be stronger/i);
    expect(reply).not.toMatch(/\d{2,3}%/);
  });
});
