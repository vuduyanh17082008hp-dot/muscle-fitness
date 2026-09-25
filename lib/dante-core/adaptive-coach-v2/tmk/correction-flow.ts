import { interpretUserTurn } from "@/lib/dante-core/adaptive-coach-v2/semantic-interface";
import { localizeFailure, type FailureLocalization } from "@/lib/dante-core/adaptive-coach-v2/tmk/failure-localization";
import type {
  DanteDecision,
  SemanticInterpretation,
  SemanticProposition,
} from "@/lib/dante-core/adaptive-coach-v2/types";

function mergeLatest(
  previous: SemanticInterpretation,
  correction: SemanticInterpretation,
): SemanticInterpretation {
  const correctedConcepts = new Set(correction.propositions.map((item) => item.concept));
  const retained = previous.propositions.filter((item) => !correctedConcepts.has(item.concept));
  return { ...correction, propositions: [...retained, ...correction.propositions] };
}

function explainCorrection(items: SemanticProposition[], language: "en" | "vi" | "mixed"): string {
  const vi = language === "vi" || language === "mixed";
  if (items.length === 0) {
    return vi
      ? "Đúng — câu trước mình đọc sai. Mình đã cập nhật theo lời ông vừa nói cho quyết định tiếp theo."
      : "You’re right — I misread that earlier. I’ve updated the current state from what you just said.";
  }
  const absent = items.filter((item) => item.state === "ABSENT" || item.state === "RESOLVED");
  if (absent.length > 0) {
    return vi
      ? "Đúng, câu trước tôi đọc sai phần phủ định. Hiện tại ông không báo triệu chứng đó; tôi dùng trạng thái đó cho quyết định tiếp theo."
      : "You’re right — I misread the negation earlier. I’m treating that symptom as absent now and will use that for the next decision.";
  }
  return vi
    ? "Bạn nói đúng — mình đã sửa trạng thái theo cập nhật vừa rồi."
    : "You’re right — I’ve corrected the state to match your latest update.";
}

export function applyUserCorrection(input: {
  userCorrection: string;
  previousInterpretation: SemanticInterpretation;
  priorDecision: DanteDecision;
}): {
  interpretation: SemanticInterpretation;
  localization: FailureLocalization;
  explanation: string;
} {
  const correction = interpretUserTurn(input.userCorrection);
  const interpretation = mergeLatest(input.previousInterpretation, correction);
  return {
    interpretation,
    localization: localizeFailure(input.userCorrection, correction, input.priorDecision),
    explanation: explainCorrection(correction.propositions, correction.language),
  };
}
