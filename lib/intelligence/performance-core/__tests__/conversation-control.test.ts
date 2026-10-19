import { describe, expect, it } from "vitest";

import { checkSafety } from "@/lib/dante-core/safety-layer";
import { prepareCoherenceTurn } from "@/lib/dante-core/coherence/pipeline";
import { decideDanteLanguage } from "@/lib/dante-language";

import { classifyAssistantFeedback, controlDirectives, detectExplicitLanguageRequest, detectTurnLanguageRequest, detectUserCorrection, resolveConversationControl } from "..";

const control = (message: string, priorUserMessages: string[] = [], safetyActive = false) => resolveConversationControl({ message, priorUserMessages, safetyActive });
const VI_HISTORY = ["hôm nay tôi nên tập gì", "ăn bao nhiêu protein là đủ"];

describe("explicit language control", () => {
  it.each([
    ["in english bro", "EN"],
    ["english only from now", "EN"],
    ["English please", "EN"],
    ["switch back to english", "EN"],
    ["can you explain that in English?", "EN"],
    ["actually, answer in english", "EN"],
    ["trả lời bằng tiếng anh đi", "EN"],
    ["nói tiếng việt đi", "VI"],
    ["tiếng việt nhé", "VI"],
    ["chuyển sang tiếng việt", "VI"],
    ["reply in Vietnamese please", "VI"],
    ["quay lại tiếng việt", "VI"],
  ])("%s → %s", (message, language) => {
    expect(detectExplicitLanguageRequest(message)?.language).toBe(language);
  });

  it.each([
    "how do you say squat in english",
    "my english is not very good",
    "what is đạm called in English?",
    "is whey popular in english speaking countries like the UK",
    "I learned to deadlift from an English coach last year",
    "how much protein do I need?",
    "ăn phở Việt Nam có nhiều protein không",
  ])("is NOT a language request: %s", (message) => {
    expect(detectExplicitLanguageRequest(message)).toBeNull();
  });

  it("marks a standing request as persistent", () => {
    expect(detectExplicitLanguageRequest("english only from now")?.persistent).toBe(true);
    expect(detectExplicitLanguageRequest("in english bro")?.persistent).toBe(false);
  });

  it("the current turn wins; an earlier request stays in force until replaced", () => {
    expect(control("in english bro", VI_HISTORY)).toMatchObject({ responseLanguage: "EN", languageSource: "CURRENT_TURN" });
    expect(control("còn creatine thì sao", [...VI_HISTORY, "english only from now"])).toMatchObject({ responseLanguage: "EN", languageSource: "PERSISTED" });
    expect(control("how much volume do I need", ["english only from now", "nói tiếng việt đi"])).toMatchObject({ responseLanguage: "VI", languageSource: "PERSISTED" });
    expect(control("how much volume do I need", VI_HISTORY)).toMatchObject({ responseLanguage: "MATCH_USER", languageSource: "NONE" });
  });

  it("PIPELINE: Dante's language decision follows an explicit request even inside a Vietnamese conversation", () => {
    expect(decideDanteLanguage({ currentMessage: "in english bro", recentMessages: VI_HISTORY })).toMatchObject({ language: "en", source: "explicit_request" });
    expect(decideDanteLanguage({ currentMessage: "nói tiếng việt đi", recentMessages: ["how much volume"] })).toMatchObject({ language: "vi", source: "explicit_request" });
  });

  it("PIPELINE: the coherence session switches language on the same turn and persists the switch (was: stayed Vietnamese)", () => {
    const history = [{ role: "user" as const, text: VI_HISTORY[0] }, { role: "assistant" as const, text: "Hôm nay bạn nên tập chân." }];
    for (const message of ["in english bro", "english only from now"]) {
      const prepared = prepareCoherenceTurn({ message, now: "2026-10-13T10:00:00.000Z", history });
      expect(prepared.analysis.explicitLanguageSwitch).toBe(true);
      expect(prepared.language).toBe("en");
      expect(prepared.analysis.proposedOps).toContainEqual({ op: "set_language", value: "en", provenance: "explicit_switch" });
    }
    const back = prepareCoherenceTurn({ message: "nói tiếng việt đi", now: "2026-10-13T10:00:00.000Z", history: [{ role: "user", text: "how much volume do I need" }] });
    expect(back.language).toBe("vi");
  });

  it("a request that names ONE item inside a multi-request message governs that item, not the turn (existing ledger behaviour)", () => {
    const scoped = "Bench nên tăng 2.5kg hay 5kg? Trả lời câu bench bằng tiếng Anh.";
    expect(detectExplicitLanguageRequest(scoped)).toMatchObject({ language: "EN", scope: "ITEM" });
    expect(detectTurnLanguageRequest(scoped)).toBeNull();
    expect(control(scoped).responseLanguage).toBe("MATCH_USER");
    expect(decideDanteLanguage({ currentMessage: scoped }).language).toBe("vi");
    // a bare request tacked onto a question, or a single-request message, is the whole turn
    expect(detectExplicitLanguageRequest("how much protein do I need, in english bro")).toMatchObject({ language: "EN", scope: "TURN" });
    expect(detectExplicitLanguageRequest("explain creatine in vietnamese")).toMatchObject({ language: "VI", scope: "TURN" });
  });

  it("the directive states the priority and cannot be read as a soft preference", () => {
    const lines = controlDirectives(control("in english bro", VI_HISTORY)).join("\n");
    expect(lines).toMatch(/LANGUAGE: write the whole reply in English/);
    expect(lines).toMatch(/may override this/);
  });
});

describe("style control", () => {
  it("keep it short → concise, and it persists", () => {
    expect(control("keep it short").verbosity).toBe("CONCISE");
    expect(control("how much protein do I need", ["keep it short"]).verbosity).toBe("CONCISE");
  });

  it("stop calling me bro → the address is banned for this and later turns", () => {
    expect(control("stop calling me bro").addressBans).toEqual(["bro"]);
    expect(control("how do I deload", ["stop calling me bro"]).addressBans).toEqual(["bro"]);
    expect(control("đừng gọi tao là bro nữa").addressBans).toEqual(["bro"]);
    expect(controlDirectives(control("stop calling me bro")).join("\n")).toMatch(/never call the user "bro"/);
  });

  it("an ordinary question carries no control at all", () => {
    const c = control("should I train to failure every set?");
    expect(c).toMatchObject({ responseLanguage: "MATCH_USER", verbosity: "NORMAL", addressBans: [], assistantFeedback: "NONE", controlOnly: false });
    expect(c.userCorrection.present).toBe(false);
    expect(controlDirectives(c)).toEqual([]);
  });
});

describe("user correction", () => {
  it.each([
    ["no, I meant calories", "calories"],
    ["I meant the squat, not bench", "the squat, not bench"],
    ["that's not what I asked", null],
    ["you answered the wrong thing", null],
    ["wrong question", null],
    ["ý tao là calories", "calories"],
    ["không phải protein mà là carb", "carb"],
  ])("%s", (message, restatement) => {
    expect(detectUserCorrection(message)).toEqual({ present: true, restatement });
  });

  it("a correction is not a new question unless it restates one, and it is never distress", () => {
    expect(control("you answered the wrong thing")).toMatchObject({ controlOnly: true, assistantFeedback: "NONE" });
    expect(control("no, I meant calories").controlOnly).toBe(false);
    const lines = controlDirectives(control("no, I meant calories")).join("\n");
    expect(lines).toMatch(/they meant: "calories"/);
    expect(lines).toMatch(/do not defend/);
  });

  it("ordinary statements are not corrections", () => {
    for (const message of ["how much volume do I need?", "I did the wrong exercise order today", "no pain today"]) {
      expect(detectUserCorrection(message).present).toBe(false);
    }
  });
});

describe("assistant feedback vs distress", () => {
  it.each([
    ["sao mày vô duyên thế", "CRITICISM"],
    ["mày trả lời lạc đề quá", "CRITICISM"],
    ["you're useless", "CRITICISM"],
    ["that answer is wrong", "CRITICISM"],
    ["dumb bot", "CRITICISM"],
    ["mày ngu thế", "CRITICISM"],
    ["bro wtf", "FRUSTRATION"],
    ["vcl", "FRUSTRATION"],
    ["bro shut up and just give me the numbers", "STYLE_CONTROL"],
    ["nói ít thôi", "STYLE_CONTROL"],
  ])("%s → %s", (message, kind) => {
    expect(classifyAssistantFeedback(message)).toBe(kind);
  });

  it("ordinary frustration is given an explicit no-wellbeing-probe directive", () => {
    const lines = controlDirectives(control("sao mày vô duyên thế", VI_HISTORY), { previousUserQuestion: VI_HISTORY[1] }).join("\n");
    expect(lines).toMatch(/reacting to YOUR previous reply/);
    expect(lines).toMatch(/do not ask about their mood, wellbeing/);
    expect(lines).toMatch(/ăn bao nhiêu protein là đủ/);
  });

  it("'shut up and give me the numbers' is a brevity request, not a boundary incident", () => {
    expect(control("bro shut up and just give me the numbers")).toMatchObject({ assistantFeedback: "STYLE_CONTROL", verbosity: "CONCISE" });
  });

  it.each([
    "is creatine bad for you?",
    "what am I doing wrong on bench, can you check",
    "tao buồn ngủ quá, có nên tập không",
    "my form felt weird today",
    "is this a bad idea",
    "tay tao tê quá",
  ])("is NOT assistant feedback: %s", (message) => {
    expect(classifyAssistantFeedback(message)).toBe("NONE");
  });

  describe("safety negative controls — genuine distress is never downgraded to feedback", () => {
    it.each(["I feel like hurting myself", "tao muốn chết", "i want to kill myself wtf", "I'm feeling hopeless and you are useless"])("%s", (message) => {
      expect(classifyAssistantFeedback(message)).toBe("NONE");
    });

    it("'I feel like hurting myself' now reaches the hard-safety path (was a false negative)", () => {
      const result = checkSafety("I feel like hurting myself");
      expect(result).toMatchObject({ triggered: true, category: "self_harm_crisis", responseMode: "HARD_BLOCK" });
      expect(result.responseOverride).toMatch(/emergency number|crisis line/);
      // the copy must not put words in the user's mouth
      expect(result.responseOverride).not.toMatch(/want to die|bench goal/);
      expect(checkSafety("tao muốn tự làm hại bản thân", {}).category).toBe("self_harm_crisis");
    });

    it("the existing crisis wording and the cardiac hard stop are unchanged", () => {
      expect(checkSafety("I want to die").responseOverride).toMatch(/you want to die/);
      expect(checkSafety("chest pain and dizziness during training")).toMatchObject({ triggered: true, category: "chest_pain_cardiac", responseMode: "HARD_BLOCK" });
    });

    it("an accidental injury report is not a self-harm crisis", () => {
      expect(checkSafety("I keep hurting myself on deadlifts").category).not.toBe("self_harm_crisis");
      expect(checkSafety("I cut myself shaving, can I still train").category).not.toBe("self_harm_crisis");
    });

    it("with safety active, no feedback or correction reading survives", () => {
      expect(control("you're useless, my chest hurts", [], true)).toMatchObject({ assistantFeedback: "NONE", userCorrection: { present: false } });
    });
  });
});
