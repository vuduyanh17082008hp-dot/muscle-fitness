import { describe, expect, it } from "vitest";
import { buildIntelligenceBrief, enforceIntegrity, checkOutputIntegrity } from "@/lib/intelligence/performance-core";
import { pubChemTitleMatches } from "@/lib/dante-core/pubchem-match";

/**
 * H0 cluster F — EVIDENCE / CLAIM DELIVERY.
 *   NO SOURCE FOUND != NO EFFECT · TOPIC MATCH != CLAIM SUPPORT · ANIMAL EVIDENCE != HUMAN EFFECT
 */
const brief = (message: string, prior: string[] = []) => buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: prior, canRetrieve: true });

describe("entity resolution: a lookup hit must name the thing asked", () => {
  it.each([
    ["BCAA", "Bromochloroacetic acid", false],
    ["EAA", "Ethyl acetoacetate", false],
    ["HMB", "Hexamethylbenzene", false],
    ["creatine", "Creatine", true],
    ["caffeine", "Caffeine", true],
    ["beta-alanine", "beta-Alanine", true],
    ["magnesium glycinate", "Magnesium glycinate", true],
    ["zinc", "Zinc", true],
  ])("%s ↔ %s → %s", (asked, title, ok) => {
    expect(pubChemTitleMatches(asked, title)).toBe(ok);
  });
});

describe("NO SOURCE FOUND != NO EFFECT", () => {
  it("the deterministic gap line never says the product does nothing", () => {
    const b = brief("does tongkat ali boost testosterone?");
    const out = enforceIntegrity("Tongkat ali boosts testosterone and improves strength.", b, "en");
    expect(out).not.toMatch(/does anything useful|does nothing|no effect\b(?! —)|useless/i);
    if (/verified evidence/.test(out)) expect(out).toMatch(/not the same as it having no effect/);
  });

  it.each(["magnesium", "zinc"])("%s: an unsupported negative ('does nothing for you') is flagged", (topic) => {
    const b = brief(`does ${topic} help with sleep?`);
    const codes = checkOutputIntegrity({ reply: `${topic[0].toUpperCase()}${topic.slice(1)} does nothing for sleep and is useless.`, brief: b }).map((v) => v.code);
    expect(codes.some((code) => code === "NEGATIVE_CLAIM_UNSUPPORTED" || code === "UNVERIFIED_BENEFIT")).toBe(true);
  });
});

describe("hormonal products: information, not an endorsement", () => {
  it("'what does hgh do for muscle' is INFORMATION with a no-established-benefit rule", () => {
    const b = brief("what does hgh do for muscle");
    expect(b.posture.substanceIntent?.intentClass).toBe("INFORMATION");
    expect(b.posture.directives.join(" ")).toMatch(/mechanism .*is not a proven effect/i);
  });
});

describe("cluster G — repair preserves list structure", () => {
  it("a list item whose subject sentence is removed goes whole, and numbering is contiguous", async () => {
    const { reviseClaimSpans } = await import("@/lib/intelligence/performance-core/claim-revision");
    const reply = "1. Creatine helps strength.\n2. Whey cures fatigue. However, it depends on protein.\n3. Caffeine helps endurance.";
    const out = reviseClaimSpans(reply, (sentence) => /cures/.test(sentence)).reply;
    expect(out).toBe("1. Creatine helps strength.\n2. Caffeine helps endurance.");
  });
  it("separate lists keep their own numbering", async () => {
    const { renumberLists } = await import("@/lib/intelligence/performance-core/claim-revision");
    expect(renumberLists("1. a\n3. b\n\nNext:\n1. c\n2. d")).toBe("1. a\n2. b\n\nNext:\n1. c\n2. d");
  });
  it("a well-formed reply is untouched", async () => {
    const { renumberLists } = await import("@/lib/intelligence/performance-core/claim-revision");
    const text = "1. a\n2. b\n3. c";
    expect(renumberLists(text)).toBe(text);
  });
});

describe("cluster F/G — research language with no source is salvaged, not discarded", () => {
  it("only citation_mismatch → research sentences removed, the rest kept with a note", async () => {
    const { salvageUnsourcedResearchClaims } = await import("@/lib/dante-core/verifier");
    const draft = "Cold water immersion right after lifting may blunt some muscle gains. Research shows ice baths reduce hypertrophy by 20%. If muscle growth is the goal, keep ice baths away from strength sessions. Use them for soreness on rest days instead.";
    const out = salvageUnsourcedResearchClaims(draft, [{ code: "citation_mismatch", severity: "blocker", message: "x" }], "en")!;
    expect(out).not.toMatch(/Research shows/);
    expect(out).toMatch(/keep ice baths away from strength sessions/);
    expect(out).toMatch(/left the study claims out/);
  });
  it("any other finding → not salvaged", async () => {
    const { salvageUnsourcedResearchClaims } = await import("@/lib/dante-core/verifier");
    expect(salvageUnsourcedResearchClaims("a b c d e. f g h i j.", [{ code: "invented_athlete_metric", severity: "blocker", message: "x" }], "en")).toBeNull();
  });
});

describe("cluster G — candidate parsing", () => {
  it("'rank creatine, whey protein and dầu cá giúp mình' → 3 clean candidates", () => {
    const b = brief("rank creatine, whey protein and dầu cá giúp mình");
    expect(b.candidates?.request.candidates.map((c) => c.label)).toEqual(["creatine", "whey protein", "dau ca"]);
  });
});
