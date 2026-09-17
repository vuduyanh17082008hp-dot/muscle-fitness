import { describe, expect, it } from "vitest";
import { decideDanteLanguage, looksVietnamese, buildDanteLanguageInstruction } from "@/lib/dante-language";

/**
 * Phase 1 — adaptive language. The old policy hard-forced English even
 * when the client wrote Vietnamese; this suite locks in the replacement:
 * Dante adapts to the client's current conversational language.
 */

describe("looksVietnamese", () => {
  it("detects Vietnamese via precomposed diacritic vowels", () => {
    expect(looksVietnamese("Tôi nên tập gì hôm nay?")).toBe(true);
    expect(looksVietnamese("Recovery score của tôi là 90 nhưng tôi cảm thấy kiệt sức.")).toBe(true);
  });

  it("does not flag plain English fitness copy", () => {
    expect(looksVietnamese("My recovery is low today. What should I do?")).toBe(false);
    expect(looksVietnamese("Increase bench press volume by two sets.")).toBe(false);
  });
});

describe("decideDanteLanguage — test 1: Vietnamese input", () => {
  it("returns Vietnamese for a Vietnamese message", () => {
    const decision = decideDanteLanguage({ currentMessage: "Tôi nên tập gì hôm nay?" });
    expect(decision.language).toBe("vi");
    expect(decision.source).toBe("message");
  });
});

describe("decideDanteLanguage — test 2: English input", () => {
  it("returns English for an English message", () => {
    const decision = decideDanteLanguage({ currentMessage: "My recovery is low today. What should I do?" });
    expect(decision.language).toBe("en");
  });
});

describe("decideDanteLanguage — test 3: mixed Vietnamese + English fitness terminology", () => {
  it("still resolves to Vietnamese as the primary answer language", () => {
    const decision = decideDanteLanguage({
      currentMessage: "Hôm nay recovery thấp nhưng tôi vẫn muốn bench heavy, nên giảm volume hay intensity?",
    });
    expect(decision.language).toBe("vi");
  });
});

describe("decideDanteLanguage — test 4: Vietnamese user explicitly requests English", () => {
  it("returns English with explicit_request source", () => {
    const decision = decideDanteLanguage({
      currentMessage: "Tôi nên ăn bao nhiêu protein? Actually answer in English.",
    });
    expect(decision.language).toBe("en");
    expect(decision.source).toBe("explicit_request");
  });
});

describe("decideDanteLanguage — test 5: English user explicitly requests Vietnamese", () => {
  it("returns Vietnamese with explicit_request source", () => {
    const decision = decideDanteLanguage({
      currentMessage: "How much protein should I eat? Trả lời bằng tiếng Việt.",
    });
    expect(decision.language).toBe("vi");
    expect(decision.source).toBe("explicit_request");
  });
});

describe("decideDanteLanguage — test 6: language changes mid-conversation", () => {
  it("follows the current explicit instruction over prior conversation language", () => {
    const stepOne = decideDanteLanguage({
      currentMessage: "Answer this one in English.",
      recentMessages: ["Tôi nên tập gì hôm nay?"],
    });
    expect(stepOne.language).toBe("en");

    const stepTwo = decideDanteLanguage({
      currentMessage: "Giờ quay lại tiếng Việt.",
      recentMessages: ["Answer this one in English.", "Tôi nên tập gì hôm nay?"],
    });
    expect(stepTwo.language).toBe("vi");
    expect(stepTwo.source).toBe("explicit_request");
  });

  it("a temporary explicit request never mutates a stored preference for later turns", () => {
    // The next message after an explicit override, with no signal of
    // its own, falls back to conversation history — NOT to the
    // one-off override from the previous turn.
    const decision = decideDanteLanguage({
      currentMessage: "ok",
      recentMessages: ["Tôi nên tập gì hôm nay?", "Answer this one in English."],
    });
    expect(decision.language).toBe("vi");
    expect(decision.source).toBe("conversation");
  });
});

describe("decideDanteLanguage — test 7: retrieved evidence language never drives the decision", () => {
  it("the decision function has no evidence/context input to leak from — it is purely the message signal", () => {
    const decision = decideDanteLanguage({ currentMessage: "Tôi nên tập gì hôm nay?" });
    expect(decision.language).toBe("vi");
    expect(decision.source).not.toBe("fallback");
  });
});

describe("decideDanteLanguage — test 8: current message wins over stored/profile-context language", () => {
  it("an English current message wins even with Vietnamese conversation history", () => {
    const decision = decideDanteLanguage({
      currentMessage: "Why is my recovery lower today?",
      recentMessages: ["Tôi nên tập gì hôm nay?", "Hôm nay tôi mệt quá."],
    });
    expect(decision.language).toBe("en");
    expect(decision.source).toBe("message");
  });
});

describe("buildDanteLanguageInstruction", () => {
  it("names the decided language and preserves exercise-name/terminology carve-outs", () => {
    const instruction = buildDanteLanguageInstruction({
      language: "vi",
      languageName: "Vietnamese",
      source: "message",
      confidence: "high",
    });
    expect(instruction).toContain("Vietnamese");
    expect(instruction).toContain("Bench Press");
    expect(instruction).toContain("RIR");
  });
});
