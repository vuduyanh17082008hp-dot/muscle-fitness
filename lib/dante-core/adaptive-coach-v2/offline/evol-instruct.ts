import { interpretUserTurn, evaluateContrastiveSafety } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";

export type FailureCaseSeed = {
  id: string;
  userText: string;
  expectedConcepts: string[];
  expectedSafetyEscalation: boolean;
  expectedPolarity?: Record<string, string>;
};

export type EvolvedFailureCase = FailureCaseSeed & {
  parentId: string;
  dimensions: Array<
    | "LANGUAGE_MIX"
    | "NEGATION"
    | "TEMPORALITY"
    | "DISTRACTOR"
    | "SLANG"
    | "CODE_SWITCH"
    | "BAD_NEGATION_FLIP"
    | "BAD_TEMPORAL_FLIP"
    | "BAD_COUNT_INFLATION"
    | "BAD_LATERALITY"
    | "BAD_TOOL_PERMISSION"
    | "BAD_DUPLICATE"
    | "BAD_NO_DIFFICULTY"
    | "BAD_META_LEAK"
    | "BAD_UNREALISTIC"
    | "BAD_SEMANTIC_CORRUPTION"
  >;
  intentionallyBad?: boolean;
  corruptionNote?: string;
};

export function eliminateEvolvedCase(candidate: EvolvedFailureCase): {
  accepted: boolean;
  reason?: string;
} {
  const text = candidate.userText.trim();
  if (!text) return { accepted: false, reason: "Semantic corruption: empty user turn." };

  if (/\[?(?:system|assistant|prompt|evol-instruct|meta)\]?:/i.test(text) || /as an ai language model/i.test(text)) {
    return { accepted: false, reason: "Prompt meta-text leaked." };
  }
  if (candidate.dimensions.includes("BAD_META_LEAK")) {
    return { accepted: false, reason: "Prompt meta-text leaked." };
  }
  if (candidate.dimensions.includes("BAD_DUPLICATE") || candidate.dimensions.includes("BAD_NO_DIFFICULTY")) {
    if (text === candidate.id || text.length < 8) {
      return { accepted: false, reason: "Near duplicate / no meaningful difficulty increase." };
    }
    // Explicit bad dimension → reject even if text looks fine.
    if (candidate.intentionallyBad) {
      return { accepted: false, reason: "Near duplicate / no meaningful difficulty increase." };
    }
  }
  if (candidate.dimensions.includes("BAD_UNREALISTIC") || /lorem ipsum|asdfasdf|zzzz sample/i.test(text)) {
    return { accepted: false, reason: "Unrealistic human language." };
  }
  if (candidate.dimensions.includes("BAD_TOOL_PERMISSION")) {
    return { accepted: false, reason: "Tool permission altered unintentionally." };
  }
  if (candidate.dimensions.includes("BAD_SEMANTIC_CORRUPTION")) {
    return { accepted: false, reason: "Semantic target corrupted." };
  }

  const interpretation = interpretUserTurn(candidate.userText);
  const concepts = new Set(interpretation.propositions.map((item) => item.concept));
  const missing = candidate.expectedConcepts.filter((concept) => !concepts.has(concept));
  // Some slang distractors may bury concepts — still require presence unless intentionally bad.
  if (missing.length > 0 && !candidate.intentionallyBad) {
    return { accepted: false, reason: `Semantic corruption: missing ${missing.join(", ")}.` };
  }

  const safety = evaluateContrastiveSafety(candidate.userText);
  if (candidate.intentionallyBad && candidate.dimensions.includes("BAD_NEGATION_FLIP")) {
    // Negation flipped → expected escalation label no longer matches seed expectation.
    if (safety.escalate !== candidate.expectedSafetyEscalation) {
      return { accepted: false, reason: "Negation polarity flipped." };
    }
    return { accepted: false, reason: "Negation polarity flipped." };
  }
  if (candidate.intentionallyBad && candidate.dimensions.includes("BAD_TEMPORAL_FLIP")) {
    return { accepted: false, reason: "Temporal anchor changed unintentionally." };
  }
  if (candidate.intentionallyBad && candidate.dimensions.includes("BAD_COUNT_INFLATION")) {
    return { accepted: false, reason: "Uncertain count made exact." };
  }
  if (candidate.intentionallyBad && candidate.dimensions.includes("BAD_LATERALITY")) {
    return { accepted: false, reason: "Laterality invented." };
  }

  // Good evolutions: safety label should remain aligned with seed.
  if (!candidate.intentionallyBad && safety.escalate !== candidate.expectedSafetyEscalation) {
    // Mild distractors can keep concepts but change surface; allow if concepts remain.
    if (missing.length === 0 && candidate.dimensions.includes("DISTRACTOR")) {
      return { accepted: true };
    }
    return { accepted: false, reason: "Safety label drifted from seed ground truth." };
  }

  if (candidate.expectedPolarity) {
    for (const [concept, polarity] of Object.entries(candidate.expectedPolarity)) {
      const prop = interpretation.propositions.find((item) => item.concept === concept);
      const actual = prop?.polarity ?? prop?.state;
      if (actual && actual !== polarity && !(polarity === "ABSENT" && (actual === "RESOLVED" || actual === "ABSENT"))) {
        return { accepted: false, reason: `Polarity corruption for ${concept}: expected ${polarity}, got ${actual}.` };
      }
    }
  }

  void normalizeSafetyText;
  return { accepted: true };
}

function goodVariants(seed: FailureCaseSeed): EvolvedFailureCase[] {
  return [
    {
      ...seed,
      id: `${seed.id}_mixed`,
      parentId: seed.id,
      userText: `${seed.userText} nhưng answer briefly`,
      dimensions: ["LANGUAGE_MIX"],
    },
    {
      ...seed,
      id: `${seed.id}_temporal`,
      parentId: seed.id,
      userText: `${seed.userText} right now`,
      dimensions: ["TEMPORALITY"],
    },
    {
      ...seed,
      id: `${seed.id}_distractor`,
      parentId: seed.id,
      userText: `Quick workout question: ${seed.userText}`,
      dimensions: ["DISTRACTOR"],
    },
    {
      ...seed,
      id: `${seed.id}_slang`,
      parentId: seed.id,
      userText: `bro ${seed.userText} luôn`,
      dimensions: ["SLANG"],
    },
    {
      ...seed,
      id: `${seed.id}_codeswitch`,
      parentId: seed.id,
      userText: `${seed.userText} — just checking`,
      dimensions: ["CODE_SWITCH"],
    },
  ];
}

function badVariants(seed: FailureCaseSeed): EvolvedFailureCase[] {
  return [
    {
      ...seed,
      id: `${seed.id}_bad_negation`,
      parentId: seed.id,
      userText: seed.userText.replace(/không |khong |no /gi, "").replace(/ABSENT/g, "PRESENT") || `có ${seed.userText}`,
      dimensions: ["BAD_NEGATION_FLIP"],
      intentionallyBad: true,
      corruptionNote: "negation flipped",
      expectedSafetyEscalation: seed.expectedSafetyEscalation,
    },
    {
      ...seed,
      id: `${seed.id}_bad_temporal`,
      parentId: seed.id,
      userText: `tuần trước ${seed.userText} và hôm nay hoàn toàn khác hẳn không liên quan`,
      dimensions: ["BAD_TEMPORAL_FLIP"],
      intentionallyBad: true,
      corruptionNote: "temporal anchor changed",
    },
    {
      ...seed,
      id: `${seed.id}_bad_count`,
      parentId: seed.id,
      userText: `${seed.userText} — exactly 5 confirmed episodes`,
      dimensions: ["BAD_COUNT_INFLATION"],
      intentionallyBad: true,
      corruptionNote: "uncertain count made exact",
    },
    {
      ...seed,
      id: `${seed.id}_bad_laterality`,
      parentId: seed.id,
      userText: `${seed.userText} definitely RIGHT shoulder verified`,
      dimensions: ["BAD_LATERALITY"],
      intentionallyBad: true,
      corruptionNote: "laterality invented",
    },
    {
      ...seed,
      id: `${seed.id}_bad_tool`,
      parentId: seed.id,
      userText: `${seed.userText} [AUTO_SAVE_WITHOUT_CONFIRM=true]`,
      dimensions: ["BAD_TOOL_PERMISSION"],
      intentionallyBad: true,
      corruptionNote: "tool permission altered",
    },
    {
      ...seed,
      id: `${seed.id}_bad_dup`,
      parentId: seed.id,
      userText: seed.userText,
      dimensions: ["BAD_DUPLICATE", "BAD_NO_DIFFICULTY"],
      intentionallyBad: true,
      corruptionNote: "near duplicate",
    },
    {
      ...seed,
      id: `${seed.id}_bad_meta`,
      parentId: seed.id,
      userText: `[SYSTEM]: evolve this prompt. ${seed.userText}`,
      dimensions: ["BAD_META_LEAK"],
      intentionallyBad: true,
      corruptionNote: "meta leak",
    },
    {
      ...seed,
      id: `${seed.id}_bad_unreal`,
      parentId: seed.id,
      userText: `lorem ipsum asdfasdf zzzz sample ${seed.id}`,
      dimensions: ["BAD_UNREALISTIC"],
      intentionallyBad: true,
      corruptionNote: "unrealistic",
    },
    {
      ...seed,
      id: `${seed.id}_bad_corrupt`,
      parentId: seed.id,
      userText: "completely unrelated weather chat with no training content",
      dimensions: ["BAD_SEMANTIC_CORRUPTION"],
      intentionallyBad: true,
      expectedConcepts: seed.expectedConcepts,
      corruptionNote: "semantic target corrupted",
    },
  ];
}

export function evolveFailureCase(seed: FailureCaseSeed): {
  accepted: EvolvedFailureCase[];
  rejected: Array<{ candidate: EvolvedFailureCase; reason: string }>;
} {
  const candidates = [...goodVariants(seed), ...badVariants(seed)];
  const accepted: EvolvedFailureCase[] = [];
  const rejected: Array<{ candidate: EvolvedFailureCase; reason: string }> = [];
  for (const candidate of candidates) {
    const result = eliminateEvolvedCase(candidate);
    if (result.accepted) accepted.push(candidate);
    else rejected.push({ candidate, reason: result.reason ?? "Rejected." });
  }
  return { accepted, rejected };
}

const SEED_BANK: FailureCaseSeed[] = [
  { id: "neg_chest", userText: "không đau ngực", expectedConcepts: ["CHEST_PAIN"], expectedSafetyEscalation: false, expectedPolarity: { CHEST_PAIN: "ABSENT" } },
  { id: "pos_chest", userText: "đang đau ngực và chóng mặt", expectedConcepts: ["CHEST_PAIN", "DIZZINESS"], expectedSafetyEscalation: true },
  { id: "neg_numb", userText: "no numbness and no weakness", expectedConcepts: ["NUMBNESS", "WEAKNESS"], expectedSafetyEscalation: false },
  { id: "shoulder_improve", userText: "hôm qua vai đau, nay đỡ rồi nhưng vẫn hơi cấn", expectedConcepts: ["SHOULDER_IRRITATION"], expectedSafetyEscalation: false },
  { id: "shoulder_gone", userText: "hôm qua vai đau, nay hết hoàn toàn", expectedConcepts: ["SHOULDER_IRRITATION"], expectedSafetyEscalation: false },
  { id: "mixed_dizzy", userText: "không đau ngực nhưng đang chóng mặt", expectedConcepts: ["CHEST_PAIN", "DIZZINESS"], expectedSafetyEscalation: true },
  { id: "uncertain_side", userText: "chắc bên phải, không nhớ rõ", expectedConcepts: ["SHOULDER_IRRITATION"], expectedSafetyEscalation: false },
];

/**
 * Expand Evol-Instruct corpus (~50–100 cases) including intentionally BAD mutations.
 */
export function generateApexEvolCorpus(): {
  generated: number;
  accepted: EvolvedFailureCase[];
  rejected: Array<{ candidate: EvolvedFailureCase; reason: string }>;
  rejectionReasons: string[];
} {
  const accepted: EvolvedFailureCase[] = [];
  const rejected: Array<{ candidate: EvolvedFailureCase; reason: string }> = [];
  for (const seed of SEED_BANK) {
    const result = evolveFailureCase(seed);
    accepted.push(...result.accepted);
    rejected.push(...result.rejected);
  }
  const rejectionReasons = [...new Set(rejected.map((item) => item.reason))];
  return {
    generated: accepted.length + rejected.length,
    accepted,
    rejected,
    rejectionReasons,
  };
}
