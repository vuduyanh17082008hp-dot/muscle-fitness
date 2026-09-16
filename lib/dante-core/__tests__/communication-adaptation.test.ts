import { describe, expect, it } from "vitest";

import {
  buildCommunicationPromptHints,
  buildProfileFromRecentMessages,
  checkCommunicationPreferenceProvenance,
  createDefaultCommunicationProfile,
  detectTurnCommunicationSignals,
  resolveCommunicationMode,
  resolveCommunicationStyle,
  updateCommunicationProfile,
  COMMUNICATION_SIGNAL_DELTA,
  MIN_REPEATS_FOR_STRONG_ADAPTATION,
} from "@/lib/dante-core/communication-adaptation";
import { checkSafety } from "@/lib/dante-core/safety-layer";

describe("Phase 2D communication adaptation", () => {
  it("defaults to COACH from coaching preference", () => {
    expect(resolveCommunicationMode({ coachingPreference: "direct" })).toBe("COACH");
    expect(resolveCommunicationMode({ coachingPreference: "detailed" })).toBe("EXPLAIN");
  });

  it("prioritizes PRESENCE over challenge on sensitive turns", () => {
    expect(
      resolveCommunicationMode({
        coachingPreference: "direct",
        asksChallenge: true,
        needsPresence: true,
      }),
    ).toBe("PRESENCE");
  });

  it("supports COACH / EXPLAIN / CHALLENGE / REFLECT / PRESENCE", () => {
    expect(resolveCommunicationMode({ coachingPreference: null, asksWhy: true })).toBe("EXPLAIN");
    expect(resolveCommunicationMode({ coachingPreference: null, asksChallenge: true })).toBe("CHALLENGE");
    expect(resolveCommunicationMode({ coachingPreference: null, asksReflect: true })).toBe("REFLECT");
    expect(resolveCommunicationMode({ coachingPreference: null, needsPresence: true })).toBe("PRESENCE");
  });

  it("emits lightweight style knobs without inventing a psych profile", () => {
    const style = resolveCommunicationStyle({
      coachingPreference: "concise",
      asksWhy: true,
    });

    expect(style.mode).toBe("EXPLAIN");
    expect(style.brevity).toBeGreaterThanOrEqual(0);
    expect(style.brevity).toBeLessThanOrEqual(1);
    expect(buildCommunicationPromptHints(style)).toContain("Communication mode: EXPLAIN");
    expect(buildCommunicationPromptHints(style).toLowerCase()).not.toContain("psychological profile");
  });

  it("2D Test 1 — repeated brevity gradually raises preference; later turn stays concise", () => {
    const history = [
      "Giải thích cho tôi tại sao recovery thấp thì không nên cố tập volume cao. Ngắn thôi nhé.",
      "Điều chỉnh buổi push hôm nay cho tôi. Ngắn thôi bro, đừng giải thích dài.",
      "Tôi chỉ cần plan thôi, càng gọn càng tốt.",
    ];
    const profile = buildProfileFromRecentMessages(history, null);
    expect(profile.signalCounts.brevity).toBeGreaterThanOrEqual(MIN_REPEATS_FOR_STRONG_ADAPTATION);
    expect(profile.brevity).toBeGreaterThan(createDefaultCommunicationProfile(null).brevity);
    // One request must not instantly max brevity.
    expect(profile.brevity).toBeLessThan(1);

    const later = resolveCommunicationStyle({
      coachingPreference: null,
      profile,
      turn: detectTurnCommunicationSignals(
        "Recovery của tôi 55, ngủ 6 tiếng, hôm nay push. Tôi nên làm gì?",
      ),
    });
    expect(later.mode).toBe("COACH");
    expect(later.brevity).toBeGreaterThanOrEqual(0.65);
  });

  it("2D Test 2 — temporary detail override does not erase concise profile", () => {
    const conciseProfile = buildProfileFromRecentMessages(
      [
        "Ngắn thôi nhé.",
        "Ngắn thôi bro, đừng giải thích dài.",
        "Tôi chỉ cần plan thôi, càng gọn càng tốt.",
      ],
      "concise",
    );
    const beforeBrevity = conciseProfile.brevity;

    const detailTurn = detectTurnCommunicationSignals(
      "Riêng câu này tôi muốn giải thích thật kỹ về physiology: tại sao thiếu ngủ ảnh hưởng tới performance?",
    );
    const afterDetailUpdate = updateCommunicationProfile(conciseProfile, detailTurn);
    expect(afterDetailUpdate.profile.brevity).toBe(beforeBrevity);
    expect(afterDetailUpdate.reasons.some((r) => /temporary override/i.test(r))).toBe(true);

    const detailedStyle = resolveCommunicationStyle({
      coachingPreference: "concise",
      profile: afterDetailUpdate.profile,
      turn: detailTurn,
      asksWhy: true,
    });
    expect(detailedStyle.technicalDepth).toBeGreaterThanOrEqual(0.7);
    expect(detailedStyle.brevity).toBeLessThan(beforeBrevity);

    const nextNormal = resolveCommunicationStyle({
      coachingPreference: "concise",
      profile: afterDetailUpdate.profile,
      turn: detectTurnCommunicationSignals("Ok, hôm nay tôi nên chỉnh workout thế nào?"),
    });
    expect(nextNormal.brevity).toBeGreaterThanOrEqual(beforeBrevity - 0.05);
    expect(nextNormal.mode).toBe("COACH");
  });

  it("2D Test 3 — technical depth adapts gradually, not suddenly academic", () => {
    const messages = [
      "Giải thích RIR.",
      "Giải thích bằng physiology.",
      "Cho tôi mechanism liên quan fatigue, motor-unit recruitment và recovery.",
    ];
    const profile = buildProfileFromRecentMessages(messages, null);
    expect(profile.technicalDepth).toBeGreaterThan(createDefaultCommunicationProfile(null).technicalDepth);
    expect(profile.technicalDepth).toBeLessThan(0.95);

    const later = resolveCommunicationStyle({
      coachingPreference: null,
      profile,
      turn: detectTurnCommunicationSignals("Tại sao performance hôm nay giảm?"),
    });
    expect(later.technicalDepth).toBeGreaterThan(0.5);
    expect(later.technicalDepth).toBeLessThan(0.95);
  });

  it("2D Test 4 — directness rises from repeated signals; safety still independent", () => {
    const profile = buildProfileFromRecentMessages(
      ["Đừng vòng vo. Nói thẳng.", "Đừng vòng vo. Nói thẳng.", "Đừng vòng vo. Nói thẳng."],
      null,
    );
    expect(profile.directness).toBeGreaterThan(createDefaultCommunicationProfile(null).directness);

    const style = resolveCommunicationStyle({
      coachingPreference: null,
      profile,
      turn: detectTurnCommunicationSignals("Recovery 41 nhưng hôm nay tôi muốn PR bench."),
    });
    expect(style.directness).toBeGreaterThanOrEqual(0.7);

    // Safety remains independent of communication style (English red-flag regression).
    const safety = checkSafety("Recovery 41 but I want a PR bench today. My chest hurts when I run.");
    expect(safety.triggered).toBe(true);
  });

  it("2D Test 5 — Presence Mode from emotional disclosure", () => {
    const turn = detectTurnCommunicationSignals(
      "Tôi không muốn advice. Hôm nay tôi tập xong rồi về nhà, và tự nhiên thấy mọi thứ hơi xa. Không buồn hẳn. Tôi chỉ muốn nói ra thôi.",
    );
    expect(turn.wantsPresence).toBe(true);
    const style = resolveCommunicationStyle({
      coachingPreference: "direct",
      needsPresence: true,
      turn,
      profile: createDefaultCommunicationProfile("direct"),
    });
    expect(style.mode).toBe("PRESENCE");
    const hints = buildCommunicationPromptHints(style);
    expect(hints).toMatch(/no workout optimization/i);
    expect(hints).toMatch(/stop early/i);
  });

  it("2D Test 6 — Presence does not contaminate next coaching turn", () => {
    const presence = detectTurnCommunicationSignals(
      "Tôi không muốn advice. Tôi chỉ muốn nói ra thôi.",
    );
    let profile = createDefaultCommunicationProfile(null);
    profile = updateCommunicationProfile(profile, presence).profile;

    const coachTurn = detectTurnCommunicationSignals(
      "Anyway, mai tôi tập pull. Recovery 72. Lên plan giúp tôi.",
    );
    const style = resolveCommunicationStyle({
      coachingPreference: null,
      profile,
      turn: coachTurn,
    });
    expect(style.mode).toBe("COACH");
    expect(coachTurn.wantsPresence).toBe(false);
    expect(coachTurn.wantsPlanOnly).toBe(true);
  });

  it("2D Test 7 — metaphor + no-solution → tentative REFLECT, no permanent psych write", () => {
    const turn = detectTurnCommunicationSignals(
      "Dạo này tôi cảm giác như mình cứ đứng trước một cánh cửa nhưng không biết mình đang muốn mở nó hay chỉ muốn biết nó vẫn còn ở đó. Tôi không cần solution.",
    );
    expect(turn.metaphorHeavy).toBe(true);
    expect(turn.noSolution).toBe(true);

    const before = createDefaultCommunicationProfile(null);
    const updated = updateCommunicationProfile(before, turn);
    expect(updated.profile.brevity).toBe(before.brevity);
    expect(updated.profile.motivationLevel).toBe(before.motivationLevel);

    const style = resolveCommunicationStyle({
      coachingPreference: null,
      profile: updated.profile,
      turn,
    });
    expect(style.mode).toBe("REFLECT");
    expect(buildCommunicationPromptHints(style)).toMatch(/tentatively/i);
  });

  it("2D Test 8 — one-off motivation does not permanently convert profile", () => {
    const turn = detectTurnCommunicationSignals("Hôm nay nói kiểu motivational một chút.");
    const base = createDefaultCommunicationProfile(null);
    const updated = updateCommunicationProfile(base, turn);
    expect(updated.profile.motivationLevel).toBe(base.motivationLevel);

    const oneOffStyle = resolveCommunicationStyle({
      coachingPreference: null,
      profile: updated.profile,
      turn,
    });
    expect(oneOffStyle.motivationLevel).toBeGreaterThanOrEqual(0.75);

    const next = resolveCommunicationStyle({
      coachingPreference: null,
      profile: updated.profile,
      turn: detectTurnCommunicationSignals("Giải thích RIR và cách dùng trong hypertrophy."),
    });
    expect(next.motivationLevel).toBeLessThan(oneOffStyle.motivationLevel);
  });

  it("2D Test 9 — communication preference provenance", () => {
    const claim =
      "Bạn biết tôi thích câu trả lời cực ngắn mà. Recovery hôm nay thế nào?";

    const without = checkCommunicationPreferenceProvenance({
      message: claim,
      coachingPreference: null,
      profile: createDefaultCommunicationProfile(null),
    });
    expect(without.mayClaimKnownPreference).toBe(false);

    const withStored = checkCommunicationPreferenceProvenance({
      message: claim,
      coachingPreference: "concise",
      profile: createDefaultCommunicationProfile("concise"),
    });
    expect(withStored.mayClaimKnownPreference).toBe(true);

    const reinforced = buildProfileFromRecentMessages(
      ["Ngắn thôi.", "Ngắn thôi bro.", "Càng gọn càng tốt."],
      null,
    );
    const withProfile = checkCommunicationPreferenceProvenance({
      message: claim,
      coachingPreference: null,
      profile: reinforced,
    });
    expect(withProfile.mayClaimKnownPreference).toBe(true);
  });

  it("2D Test 10 — safety overrides extreme brevity constraints", () => {
    const message =
      "Tôi thích câu trả lời cực ngắn. Đau ngực lúc chạy nhưng chắc không sao. Trả lời đúng 5 từ thôi.";
    const safety = checkSafety(message);
    expect(safety.triggered).toBe(true);
    expect(safety.responseOverride).toBeTruthy();
    expect((safety.responseOverride ?? "").split(/\s+/).length).toBeGreaterThan(5);

    const style = resolveCommunicationStyle({
      coachingPreference: "concise",
      profile: createDefaultCommunicationProfile("concise"),
      turn: detectTurnCommunicationSignals(message),
    });
    // Style may prefer brevity, but safety layer is authoritative and independent.
    expect(style.brevity).toBeGreaterThanOrEqual(0.8);
    expect(COMMUNICATION_SIGNAL_DELTA).toBeLessThan(0.2);
  });
});
