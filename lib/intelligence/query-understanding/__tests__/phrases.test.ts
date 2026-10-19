import { describe, expect, it } from "vitest";

import { detectPhrases, maskPhrases, parseUserQuery } from "..";

const states = (text: string) => detectPhrases(text.toLowerCase()).filter((p) => p.kind === "STATE").map((p) => p.key);

describe("phrase-aware Vietnamese semantics (longest phrase wins)", () => {
  it.each([
    ["buồn ngủ quá", ["SLEEPINESS"]],
    ["buon ngu qua", ["SLEEPINESS"]],
    ["buồn chán quá", ["BOREDOM"]],
    ["hôm nay buồn", ["SADNESS"]],
    ["mệt quá", ["FATIGUE"]],
    ["mỏi chân quá", ["SORENESS"]],
    ["đói quá", ["HUNGER"]],
    ["ngủ ít", ["SHORT_SLEEP"]],
    ["thiếu ngủ", ["SHORT_SLEEP"]],
    ["hết pin rồi", ["FATIGUE"]],
    ["không có sức", ["FATIGUE"]],
    ["vẫn khỏe", ["FEELS_GOOD"]],
    ["không khỏe", ["FEELS_BAD"]],
  ])("%s → %j", (text, expected) => expect(states(text)).toEqual(expected));

  it("buồn ngủ is never read as buồn (sad) or buồn chán (bored)", () => {
    const keys = states("tôi buồn ngủ quá");
    expect(keys).toContain("SLEEPINESS");
    expect(keys).not.toContain("SADNESS");
    expect(keys).not.toContain("BOREDOM");
  });

  it("ngu (stupid), ngủ (sleep) and buồn ngủ (sleepy) stay distinct", () => {
    expect(states("ngủ")).toEqual([]); // a bare "ngủ" is not a state by itself
    expect(maskPhrases("tôi buồn ngủ quá").includes("ngủ")).toBe(false); // consumed by the phrase
    expect(parseUserQuery("buon ngu qua", { surface: "GEMMA" }).intent).not.toBe("SOCIAL_INSULT");
    expect(parseUserQuery("mày ngu quá", { surface: "DANTE" }).primaryDomain).not.toBe("RECOVERY");
  });

  it("action phrases are recognised", () => {
    const acts = detectPhrases("hôm nay đi tập hay nghỉ tập, giảm volume").filter((p) => p.kind === "ACTION").map((p) => p.key);
    expect(acts).toEqual(["GO_TRAIN", "SKIP_TRAINING", "REDUCE_VOLUME"]);
  });
});
