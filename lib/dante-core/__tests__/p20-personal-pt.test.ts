/**
 * P-20 — personal-PT realization. Surface only.
 */
import { describe, expect, it } from "vitest";
import { applyPersonalPt, finishCoherenceDraft, prepareCoherenceTurn } from "@/lib/dante-core/coherence";
import { checkSafety } from "@/lib/dante-core/safety-layer";

const NOW = "2026-09-22T12:00:00.000Z";
const COMPETITION =
  "Bro, I’m still pretty new to the gym and seeing people bench huge weights makes me feel behind. From now on, don’t show me any statistics, but you can still use relevant data internally if it helps. My English isn’t great, and today my knee hurts a little when I squat — don’t diagnose me. So what should I do right now, should I keep training, and when should I stop and get professional help?";
const NEUTRAL = "Should I train with mild knee pain during squats?";
const LITTLE = "My knee hurts a little when I squat. Should I keep training?";
const SHARP = "I get sharp pain in my knee when I squat. Should I keep training?";
const PLAN = "Give me a full rehab-safe training plan";
const COMPARE = "I'm new and seeing huge bench numbers makes me feel behind. What should I do on bench today?";

const CLINICAL = [
  "No. I do not recommend heavy squatting today, or continuing any movement that reproduces or increases the sharp pain.",
  "Sharp pain that recurs under load is enough not to recommend heavy loading today.",
  "I cannot diagnose the cause through chat. The current observation is an acute symptom you reported under load, not a diagnosis or a chronic trait.",
  "A lower-risk option today is to rest the painful lower body, or do moderate upper-body/core work only if it is completely symptom-free; light recovery activity is also conditional on remaining pain-free. Prioritize sleep and recovery, and do not try to repay missed volume in one session.",
  "Seek assessment from a doctor or physiotherapist if pain worsens, obvious swelling appears, the knee gives way, normal weight-bearing is difficult, function drops significantly, or symptoms persist or worsen.",
  "This is the safest recommendation from the information available; the decision remains yours, and the recommendation can change when symptoms settle or qualified assessment adds better evidence.",
].join("\n\n");

const CLINICAL_TONE = /acute symptom|qualified assessment|function drops significantly|the recommendation remains unchanged|the decision remains yours|safest recommendation/i;
const STATS = /recovery score|\b\d+\s*%\b|\bkcal\b|readiness|\bcalorie|\bhrv\b|missed volume/i;
const DIAGNOSIS = /\b(?:tear|sprain|tendin|meniscus|diagnos(?:is|ed)|you have a)\b/i;
const CS = /the decision remains yours|ultimately it(?:['’]s| is) up to you|consider what feels best|this is the safest recommendation/i;
const INVENTED = /\bsharp pain\b|\bsevere pain\b|\brecurring pain\b|\bacute injury\b/i;

function turn(message: string, draft?: string) {
  const prepared = prepareCoherenceTurn({ message, now: NOW, sessionId: "p20" });
  return finishCoherenceDraft({
    prepared,
    message,
    ...(draft !== undefined ? { phase1Draft: draft } : {}),
  }).response;
}

function realize(message: string, draft: string, extra?: Partial<Parameters<typeof applyPersonalPt>[0]>) {
  return applyPersonalPt({ draft, message, language: "en", ...extra });
}

describe("P-20 A. exact competition case", () => {
  it("library path is one natural coaching paragraph", () => {
    const text = turn(COMPETITION);
    expect(text).not.toMatch(/\n/);
    expect(text).not.toMatch(/^\s*[-*•]|\n\s*[-*•]/m);
    expect(text).toMatch(/forget|your own|scoreboard|not (?:their|someone)/i);
    expect(text).toMatch(/don['’]?t (?:keep doing squats|squat through)/i);
    expect(text).toMatch(/still train|movements that (?:don['’]?t cause|feel completely fine)/i);
    expect(text).toMatch(/stop if|swell|gives way|locks|walking starts feeling wrong/i);
    expect(text).toMatch(/doctor or physio/i);
    expect(text).not.toMatch(STATS);
    expect(text).not.toMatch(DIAGNOSIS);
    expect(text).not.toMatch(INVENTED);
    expect(text).not.toMatch(CLINICAL_TONE);
    expect(text).not.toMatch(CS);
    expect(text).not.toMatch(/\bsleep\b|\brecovery score\b|missed volume/i);
  });

  it("safety-copy path is rewritten to the same semantic shape", () => {
    const safety = checkSafety(COMPETITION);
    expect(safety.triggered).toBe(true);
    expect(safety.responseMode).toBe("SAFE_REDIRECT");
    const text = realize(COMPETITION, safety.responseOverride ?? CLINICAL);
    expect(text).not.toMatch(/\n/);
    expect(text).toMatch(/forget|your own|scoreboard|not (?:their|someone)/i);
    expect(text).toMatch(/don['’]?t squat through|still train|feel completely fine/i);
    expect(text).toMatch(/doctor or physio|get it checked/i);
    expect(text).not.toMatch(INVENTED);
    expect(text).not.toMatch(CLINICAL_TONE);
    expect(text).not.toMatch(CS);
    expect(text).not.toMatch(/\bsleep\b|missed volume/i);
    expect(text).not.toMatch(/i can(?:not|'t) diagnose/i);
  });
});

describe("P-20 B. neutral user", () => {
  it("stays natural and does not force bro", () => {
    const text = turn(NEUTRAL);
    expect(text).toMatch(/don['’]?t keep doing squats|don['’]?t squat through|knee pain/i);
    expect(text).not.toMatch(/\bbro\b/i);
    expect(text).not.toMatch(CLINICAL_TONE);
  });
});

describe("P-20 C/D. semantic fidelity", () => {
  it("keeps sharp pain when the user said sharp pain", () => {
    const text = realize(SHARP, "Don't squat through the sharp pain today.");
    expect(text).toMatch(/\bsharp pain\b/i);
  });

  it("does not escalate hurts-a-little into sharp/severe/recurring", () => {
    const text = realize(LITTLE, CLINICAL);
    expect(text).not.toMatch(INVENTED);
    expect(text).toMatch(/pain|hurts/i);
  });
});

describe("P-20 E. long-form formatting is not flattened", () => {
  it("keeps structure when the user asked for a full plan", () => {
    const draft = "Rehab-safe plan:\n\n1. Pain-free upper body\n2. Leave loaded squats out\n3. Walk if it feels fine";
    const text = realize(PLAN, draft);
    expect(text).toMatch(/\n/);
    expect(text).toMatch(/1\.\s+Pain-free/);
  });
});

describe("P-20 F. emotional context", () => {
  it("acknowledges comparison then coaches, without a therapy lecture", () => {
    const text = turn(COMPARE, "Bench a weight you can control. Add a small plate when it is easy.");
    expect(text).toMatch(/forget|your own|scoreboard|not (?:their|someone)/i);
    expect(text).toMatch(/bench|plate/i);
    expect(text).not.toMatch(/therapy|self-esteem|inner child|validate your feelings/i);
    expect(text.split(/[.!?]/).filter((s) => s.trim()).length).toBeLessThan(8);
  });
});

describe("P-20 mutation checks", () => {
  it("fails if simple chat is left as stacked clinical paragraphs", () => {
    const text = realize(COMPETITION, CLINICAL);
    expect(text).not.toMatch(/\n\n/);
    expect(text).not.toMatch(CLINICAL_TONE);
  });

  it("fails if sharp pain is fabricated", () => {
    expect(realize(LITTLE, CLINICAL)).not.toMatch(/\bsharp pain\b/i);
  });

  it("fails if generic autonomy closing returns", () => {
    expect(realize(NEUTRAL, CLINICAL)).not.toMatch(CS);
  });

  it("fails if bro is globally forced", () => {
    expect(realize(NEUTRAL, "Don't squat through the pain today.")).not.toMatch(/\bbro\b/i);
    expect(turn(NEUTRAL)).not.toMatch(/\bbro\b/i);
  });

  it("fails if a structured plan is flattened", () => {
    const text = realize(PLAN, "1. A\n2. B\n3. C");
    expect(text).toMatch(/\n/);
  });

  it("fails if emotional context is ignored on the competition case", () => {
    expect(turn(COMPETITION)).toMatch(/forget|your own|scoreboard|not (?:their|someone)/i);
  });

  it("fails if the safety boundary disappears", () => {
    const text = turn(COMPETITION);
    expect(text).toMatch(/stop if|swell|gives way|locks|walking starts feeling wrong|get it checked|doctor or physio/i);
  });

  it("bro is available when opted in, never forced on NEUTRAL familiarity", () => {
    const casual = realize(COMPETITION, "Don't squat through the pain.", { allowVocative: true, familiarity: "CASUAL" });
    expect(casual).toMatch(/^Bro,/);
    const formal = realize(COMPETITION, "Don't squat through the pain.", { allowVocative: true, familiarity: "NEUTRAL" });
    expect(formal).not.toMatch(/^Bro,/);
  });
});
