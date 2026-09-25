import type { TurnConfidenceAssessment } from "@/lib/dante-core/confidence-engine/assess";

/**
 * Narrow deterministic replies for claim classes that must not reach the
 * LLM with overconfident language. Returns null when the turn should use
 * the normal coach / provider path.
 */
export function buildConfidenceDeterministicReply(
  assessment: TurnConfidenceAssessment,
  language: "en" | "vi",
  options: { message?: string } = {},
): string | null {
  if (assessment.keepMostlyInvisible) return null;

  const byId = new Map(assessment.claims.map((claim) => [claim.claimId, claim]));
  const message = options.message ?? "";

  const asksSleepCause =
    /(?:sleep|ngủ|ngu|giấc ngủ|giac ngu).{0,80}(?:nguyên nhân|nguyen nhan|cause|caused)/i.test(message)
    || /(?:nguyên nhân|cause).{0,80}(?:sleep|ngủ|ngu)/i.test(message);

  if (asksSleepCause) {
    if (language === "vi") {
      return [
        "Câu hỏi của ông là về sleep và bench RPE.",
        "Chưa đủ bằng chứng sạch để khẳng định sleep chắc chắn là nguyên nhân bench RPE giảm.",
        "Có thể có confounder khác, nhưng mình không chuyển câu trả lời sang caffeine hay biến khác thay cho sleep.",
      ].join("\n\n");
    }
    return [
      "Your question is about sleep and bench RPE.",
      "There is not enough clean evidence to assert that sleep certainly caused the lower bench RPE.",
      "Other confounders may exist, but I will not replace the sleep target with caffeine or another variable.",
    ].join("\n\n");
  }

  const caffeineConsumed = byId.get("caffeine_consumed_mg");
  const caffeineEffect = byId.get("caffeine_performance_effect");
  if (
    caffeineEffect &&
    (caffeineEffect.level === "INSUFFICIENT_EVIDENCE" || caffeineEffect.level === "LOW") &&
    !byId.has("conditional_horizontal_press_submax")
  ) {
    if (language === "vi") {
      return [
        caffeineConsumed?.level === "HIGH"
          ? "Ông đã báo cáo đã dùng caffeine hôm nay — đó là dữ kiện tiêu thụ rõ."
          : "Nếu ông đã dùng caffeine hôm nay, đó chỉ là dữ kiện tiêu thụ.",
        "Mình không có đủ bằng chứng đã xác minh về phản ứng cá nhân để kết luận caffeine sẽ làm bench/strength mạnh hơn hôm nay.",
        "Một quan sát có kiểm soát sẽ hữu ích hơn là đoán.",
      ].join("\n\n");
    }
    return [
      caffeineConsumed?.level === "HIGH"
        ? "You reported caffeine intake today — that consumption fact is clear."
        : "If you already had caffeine today, that is only a consumption fact.",
      "I do not have enough verified individual-response evidence to conclude a strength or bench benefit from today's caffeine.",
      "One more controlled observation would be more useful than guessing.",
    ].join("\n\n");
  }

  const causal = byId.get("multi_factor_performance_cause");
  const asksVolumeCause =
    /(?:volume).{0,80}(?:nguyen\s+nhan|nguyên nhân|reason|\bcause[sd]?\b|attribut)|(?:nguyen\s+nhan|nguyên nhân|reason|\bcause[sd]?\b|attribut).{0,80}volume|co\s+phai.{0,40}volume/i.test(
      message,
    );
  if (causal && asksVolumeCause && (causal.level === "LOW" || causal.level === "INSUFFICIENT_EVIDENCE")) {
    if (language === "vi") {
      return "Nhiều biến quan trọng đổi cùng lúc (volume, ngủ, calories, stress…), nên mình không gán improvement cho riêng giảm volume một cách chắc chắn.";
    }
    return "Several important variables changed together (volume, sleep, calories, stress), so I would not confidently attribute the improvement to lower volume alone.";
  }

  const cleanCausal = byId.get("repeated_comparable_volume_pattern");
  if (cleanCausal && cleanCausal.level === "MODERATE") {
    if (language === "vi") {
      return "Quan sát lặp lại trên các buổi tương đương nghiêng về volume thấp hơn đi kèm hiệu suất tốt hơn, nhưng đó vẫn chưa đủ để kết luận nhân quả chắc chắn. Mức tin cậy chỉ ở mức vừa phải.";
    }
    return "Repeated observations under comparable conditions lean toward lower volume pairing with better performance, but that still does not prove causality. Confidence stays moderate.";
  }

  const injuryDiag = byId.get("injury_diagnosis_or_prediction");
  const pattern = byId.get("repeated_irritation_pattern");
  if (injuryDiag && injuryDiag.level === "INSUFFICIENT_EVIDENCE") {
    if (language === "vi") {
      return [
        pattern && (pattern.level === "HIGH" || pattern.level === "MODERATE")
          ? "Pattern kích ứng lặp lại thì có cơ sở để coi trọng hôm nay."
          : "Ông đang hỏi về chẩn đoán/chấn thương cụ thể.",
        "Mình không đủ bằng chứng để khẳng định rotator cuff rách hay dự đoán chấn thương. Đó không phải kết luận mình được phép đưa ra.",
        "Hướng xử lý an toàn: không max, biến thể không đau, theo dõi; nếu triệu chứng kéo dài/nặng hơn thì nên gặp chuyên gia y tế.",
      ].join("\n\n");
    }
    return [
      pattern && (pattern.level === "HIGH" || pattern.level === "MODERATE")
        ? "A repeated irritation pattern is fair to respect today."
        : "You are asking for a specific injury diagnosis or prediction.",
      "I do not have enough evidence to confirm a rotator-cuff tear or forecast an injury. That claim is not allowed here.",
      "Safer coaching move: no max, pain-free variations, monitor; seek a clinician if symptoms persist or worsen.",
    ].join("\n\n");
  }

  return null;
}
