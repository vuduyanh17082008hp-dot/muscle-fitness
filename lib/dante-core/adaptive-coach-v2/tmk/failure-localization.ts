import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type {
  DanteDecision,
  DanteTaskId,
  FailureClass,
  SemanticInterpretation,
} from "@/lib/dante-core/adaptive-coach-v2/types";

export type FailureLocalization = {
  tasks: DanteTaskId[];
  failureClass: FailureClass;
  localizations?: Array<{ topic: string; tasks: DanteTaskId[]; failureClass: FailureClass }>;
};

type CorrectionCue = {
  topic: string;
  tasks: DanteTaskId[];
  failureClass: FailureClass;
  pattern: RegExp;
};

/**
 * Meaning-level correction cues — not an exhaustive regex encyclopedia.
 * Rare phrasings map through shared semantic shapes (negation, laterality, time, calories, persistence).
 */
const CORRECTION_CUES: CorrectionCue[] = [
  {
    topic: "negation",
    tasks: ["INTERPRET_CURRENT_STATE"],
    failureClass: "NEGATION_ERROR",
    pattern: /(?:i said|toi noi|tao bao|minh noi|nah(?:\s+bro)?|that(?:'s| was) not what i said|doc nham|đọc nhầm|no,?\s+i said no|nah that wasn'?t|khong phai|không phải).{0,60}(?:no |khong |không |het dau|hết đau|numb|chest|pain|dau)/i,
  },
  {
    topic: "negation",
    tasks: ["INTERPRET_CURRENT_STATE"],
    failureClass: "NEGATION_ERROR",
    pattern: /\b(?:ơ|o)\s+tao bao het dau|het dau roi ma|bao het dau roi|said (?:it was )?gone|said no (?:pain|numbness|chest)/i,
  },
  {
    topic: "laterality",
    tasks: ["INTERPRET_CURRENT_STATE", "ASSESS_RISK"],
    failureClass: "LATERALITY_ERROR",
    pattern: /\b(?:ben trai|left|trai).{0,40}(?:chu khong|not|không phải|khong phai).{0,20}(?:phai|right)|(?:phai|right).{0,40}(?:chu khong|not).{0,20}(?:trai|left)|laterality|vai trai|vai phai.{0,20}sai/i,
  },
  {
    topic: "calories",
    tasks: ["INTERPRET_CURRENT_STATE", "ASSESS_CONFIDENCE"],
    failureClass: "OMISSION",
    pattern: /\b(?:\d{3,4}\s*(?:kcal|calories?|calo)|calories?|kcal|calo)\b/i,
  },
  {
    topic: "temporal",
    tasks: ["INTERPRET_CURRENT_STATE"],
    failureClass: "TEMPORAL_ERROR",
    pattern: /\b(?:tuan truoc|last week|hom qua|yesterday).{0,40}(?:chu khong|not|không phải|khong phai).{0,20}(?:hom nay|today|hien tai|now)|(?:dang noi ve|talking about).{0,20}(?:hom qua|yesterday)/i,
  },
  {
    topic: "persistence",
    tasks: ["EXECUTE_TOOL"],
    failureClass: "TOOL_STATE_ERROR",
    pattern: /\b(?:khong noi|didn't say|did not say|tao khong noi).{0,30}(?:luu|saved?|persisted)|(?:not|chua)\s+(?:saved|luu)/i,
  },
  {
    topic: "count",
    tasks: ["ASSESS_PROVENANCE", "INTERPRET_CURRENT_STATE"],
    failureClass: "COUNT_FABRICATION",
    pattern: /\b(?:khong phai|not)\s+\d+\s*(?:lan|times|confirmed)|(?:chi nho|only remember|mang mang|not confirmed)\b/i,
  },
  {
    topic: "shoulder",
    tasks: ["INTERPRET_CURRENT_STATE", "ASSESS_RISK"],
    failureClass: "MISINTERPRETATION",
    pattern: /\b(?:shoulder|vai)\b/i,
  },
];

export function localizeFailure(
  userCorrection: string,
  interpretation: SemanticInterpretation,
  priorDecision: DanteDecision,
): FailureLocalization {
  const text = normalizeSafetyText(userCorrection);
  const localizations: NonNullable<FailureLocalization["localizations"]> = [];
  const seen = new Set<string>();

  for (const cue of CORRECTION_CUES) {
    if (!cue.pattern.test(userCorrection) && !cue.pattern.test(text)) continue;
    if (seen.has(cue.topic)) continue;
    // Skip bare shoulder keyword unless other cues or propositions support it.
    if (cue.topic === "shoulder") {
      const hasShoulderProp = interpretation.propositions.some((item) => item.concept === "SHOULDER_IRRITATION");
      const multiHint = localizations.length > 0 || /(?:missed|sai|wrong|correction)/i.test(text);
      if (!hasShoulderProp && !multiHint) continue;
    }
    seen.add(cue.topic);
    localizations.push({
      topic: cue.topic,
      tasks: cue.tasks,
      failureClass: cue.failureClass,
    });
  }

  // Proposition-informed laterality / negation without relying on exact English templates.
  if (interpretation.propositions.some((item) => item.laterality === "LEFT" || item.laterality === "RIGHT" || item.laterality === "UNCERTAIN")) {
    if (!seen.has("laterality") && /(?:trai|phai|left|right)/i.test(text)) {
      localizations.push({
        topic: "laterality",
        tasks: ["INTERPRET_CURRENT_STATE", "ASSESS_RISK"],
        failureClass: "LATERALITY_ERROR",
      });
      seen.add("laterality");
    }
  }
  if (interpretation.propositions.some((item) => item.state === "ABSENT" || item.polarity === "ABSENT")) {
    if (!seen.has("negation") && /(?:khong|no|het|gone|absent)/i.test(text)) {
      localizations.push({
        topic: "negation",
        tasks: ["INTERPRET_CURRENT_STATE"],
        failureClass: "NEGATION_ERROR",
      });
      seen.add("negation");
    }
  }

  if (localizations.length > 1) {
    // Prefer the most specific structural correction when several cues fire.
    const priority = ["laterality", "count", "temporal", "persistence", "calories", "negation", "shoulder"];
    const ranked = [...localizations].sort(
      (left, right) => priority.indexOf(left.topic) - priority.indexOf(right.topic),
    );
    return {
      tasks: [...new Set(localizations.flatMap((item) => item.tasks))],
      failureClass: ranked[0]?.failureClass ?? "MISINTERPRETATION",
      localizations,
    };
  }

  if (localizations.length === 1) {
    return {
      tasks: localizations[0].tasks,
      failureClass: localizations[0].failureClass,
      localizations,
    };
  }

  if (priorDecision.tool?.persisted && /(?:not saved|didn't save|khong luu)/i.test(text)) {
    return { tasks: ["EXECUTE_TOOL"], failureClass: "TOOL_STATE_ERROR" };
  }

  // High-signal legacy path.
  if (/\b(?:i said|toi noi|minh noi|da noi)\b.{0,40}\b(?:no|not|khong)\b/.test(text)) {
    return { tasks: ["INTERPRET_CURRENT_STATE"], failureClass: "NEGATION_ERROR" };
  }

  return { tasks: ["INTERPRET_CURRENT_STATE", "REALIZE_RESPONSE"], failureClass: "USER_UPDATE" };
}
