import type { RiskEvaluationResult } from "@/lib/dante-core/risk-accumulator/types";

export function getRiskLanguageDirective(result: RiskEvaluationResult): string {
  const active = result.signals.filter((signal) => signal.level !== "NONE");
  if (active.length === 0 && result.conservativeBias === "NONE") return "";

  const lines = active
    .map((signal) => formatSignalLine(signal))
    .join("\n");

  return `
============================================================
RISK CONTEXT (session-derived micro-directive)
============================================================

${lines || "- no active derived risk signals"}
conservativeBias=${result.conservativeBias}
${result.reasons.map((reason) => `- ${reason}`).join("\n")}

Behavior:
- treat repeated patterns as relevant context, not isolated one-offs
- prefer reversible / lower-risk strategy when bias is LEAN or STRONG
- do not diagnose injury
- do not claim injury prediction or probabilities
- do not invent permanent "injury-prone" identity labels
- do not ignore current explicit symptom-free state
- Risk Accumulator biases strategy; Safety Pre-Gate hard-blocks
- do not claim load caused irritation unless evidence supports causality
`.trim();
}

function formatSignalLine(signal: RiskEvaluationResult["signals"][number]): string {
  return `- ${signal.type} level=${signal.level}` +
    (signal.bodyRegion ? ` region=${signal.bodyRegion}` : "") +
    ` observations=${signal.observationCount}` +
    (signal.resolvedAt ? " resolved=true" : "");
}

/**
 * Short user-facing acknowledgment when a pattern is active.
 * No diagnosis, no probabilities, no moralizing filler.
 */
export function buildRiskPatternAck(
  result: RiskEvaluationResult,
  language: "en" | "vi",
): string | null {
  const elevated = result.signals.find(
    (signal) => signal.type === "REPEATED_IRRITATION" && signal.level === "ELEVATED" && !signal.resolvedAt,
  );
  if (!elevated) return null;

  if (language === "vi") {
    return "Vùng đó đã xuất hiện hơn một lần gần đây, nên hôm nay mình coi đây là một pattern cần tôn trọng chứ không phải sự cố một lần.";
  }
  return "That same region has shown up more than once recently, so I'm treating it as a pattern worth respecting today rather than a one-off.";
}

/**
 * Deterministic coaching when risk patterns are clear enough that the LLM
 * path is unnecessary. Never diagnoses; never hard-blocks.
 * Only fire when the current turn actually touches the risk topic.
 */
export function buildRiskDeterministicReply(
  result: RiskEvaluationResult,
  language: "en" | "vi",
  options: {
    currentTurnResolution?: boolean;
    currentTurnIrritation?: boolean;
    currentTurnFatigue?: boolean;
  } = {},
): string | null {
  if (options.currentTurnResolution) {
    const resolved = result.signals.find(
      (signal) => signal.type === "REPEATED_IRRITATION" && (signal.resolvedAt || signal.level === "NONE"),
    );
    if (resolved || result.signals.some((s) => s.type === "REPEATED_IRRITATION")) {
      return language === "vi"
        ? "Ông báo cáo vùng đó đã hết triệu chứng và các buổi pressing gần đây cũng ổn — mình hạ pattern risk xuống và ưu tiên trạng thái hiện tại hơn lịch sử cũ."
        : "You reported that region is symptom-free and recent pressing has been clean — I'm decaying the risk pattern and prioritizing current state over older history.";
    }
  }

  const elevatedIrritation = result.signals.find(
    (signal) => signal.type === "REPEATED_IRRITATION" && signal.level === "ELEVATED" && !signal.resolvedAt,
  );
  if (elevatedIrritation && options.currentTurnIrritation) {
    const ack = buildRiskPatternAck(result, language);
    if (language === "vi") {
      return [
        ack,
        "Hai lần kích ứng gần đây là đủ để hôm nay không đuổi tải. Ưu tiên biến thể không đau, cường độ thấp hơn, theo dõi phản ứng — không phải chẩn đoán chấn thương.",
      ].join("\n\n");
    }
    return [
      ack,
      "Two recent irritation reports are enough for me not to chase load today. Prefer pain-free variations, lower intensity, and monitor response — this is not an injury diagnosis.",
    ].join("\n\n");
  }

  const watchIrritation = result.signals.find(
    (signal) => signal.type === "REPEATED_IRRITATION" && signal.level === "WATCH" && !signal.resolvedAt,
  );
  if (watchIrritation && options.currentTurnIrritation) {
    return language === "vi"
      ? "Mình ghi nhận kích ứng vùng đó hôm nay — để ở mức theo dõi. Chưa thành pattern lặp lại; không chẩn đoán chấn thương."
      : "I'm noting that region irritation today at watch level. It is not a repeated pattern yet — and this is not an injury diagnosis.";
  }

  const fatigue = result.signals.find((signal) => signal.type === "SYSTEMIC_FATIGUE");
  if (fatigue && options.currentTurnFatigue && fatigue.level === "ELEVATED") {
    return language === "vi"
      ? "Recovery đã thấp hơn mức bình thường của ông qua nhiều buổi liên tiếp, nên hôm nay mình nghiêng về bài ít tốn kém hơn. Đây không phải chẩn đoán overtraining."
      : "Recovery has been running below your normal across multiple sessions, so I'd bias today toward lower-cost work. This is not an overtraining diagnosis.";
  }
  if (fatigue && options.currentTurnFatigue && fatigue.level === "WATCH") {
    const usesPersonal =
      fatigue.reasons.some((reason) => /personal baseline|below personal/i.test(reason));
    if (language === "vi") {
      return usesPersonal
        ? "Recovery gần đây đang đáng để theo dõi so với baseline của ông — hôm nay nghiêng bảo thủ một chút."
        : "Có vài báo cáo recovery thấp gần đây — mình để ở mức theo dõi. Chưa đủ baseline cá nhân để nói 'thấp hơn mức bình thường của ông'.";
    }
    return usesPersonal
      ? "Recent recovery is worth watching against your baseline — lean a bit conservative today."
      : "A few recent low-recovery reports warrant a watch. There isn't enough personal baseline yet to say this is below your normal.";
  }

  return null;
}
