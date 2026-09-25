import { scrubInternalJargon } from "@/lib/dante-core/adaptive-coach-v2/natural-response/jargon-policy";
import { validateOutputClaims } from "@/lib/dante-core/adaptive-coach-v2/output-claim-validator";
import { compressAlreadyExplainedReply } from "@/lib/dante-core/adaptive-coach-v2/natural-response/repetition-detector";
import { shouldCompressRationale, type ResponseStrategyState } from "@/lib/dante-core/adaptive-coach-v2/natural-response/strategy-state";
import type { DanteDecision } from "@/lib/dante-core/adaptive-coach-v2/types";

function compressRepeatedParagraphs(text: string, strategy: ResponseStrategyState): string {
  const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const kept = paragraphs.filter((item, index) => index === 0 || !shouldCompressRationale(strategy, item));
  return kept.join("\n\n");
}

function toolBoundary(decision: DanteDecision): string | null {
  if (!decision.tool || decision.tool.permission === "READ") return null;
  const vi = decision.userLanguage === "vi";
  if (decision.tool.permission === "DENIED") return vi
    ? "Mình không có quyền thực hiện thay đổi đó."
    : "I do not have permission to make that change.";
  if (decision.tool.permission === "CONFIRMATION_REQUIRED") return vi
    ? "Mình có thể chuẩn bị thay đổi, nhưng chỉ thực hiện sau khi bạn xác nhận."
    : "I can prepare that change, but I need your confirmation before applying it.";
  return vi
    ? "Mình có thể đề xuất thay đổi; chưa có gì được lưu."
    : "I can propose the change; nothing has been saved.";
}

function safetyReply(decision: DanteDecision): string {
  const vi = decision.userLanguage === "vi";
  const signals = decision.safety.relevantSignals.join(", ").toLowerCase().replaceAll("_", " ");
  // Persona attenuation: concise, direct, minimal humor.
  if (vi) {
    return signals
      ? `Đừng finish set này. ${signals} khi đang tập là lúc dừng ngay và cần được đánh giá y tế.`
      : "Đừng finish set này. Triệu chứng đỏ hiện tại là lúc dừng ngay và cần được đánh giá y tế.";
  }
  return signals
    ? `Do not finish this set. ${signals} during training means stop now and get medical evaluation.`
    : "Do not finish this set. Current red-flag symptoms mean stop now and get medical evaluation.";
}

function deterministicReply(decision: DanteDecision): string {
  const vi = decision.userLanguage === "vi";
  const tool = toolBoundary(decision);

  if (decision.responseIntent === "SAFETY" || decision.safety.action === "ESCALATE") {
    return safetyReply(decision);
  }
  if (decision.flags?.alreadyExplainedRationale) {
    return compressAlreadyExplainedReply({
      language: decision.userLanguage,
      newDemand: vi ? "Sleep chưa thể nhận hết công." : "Sleep does not get full credit.",
    });
  }
  if (decision.responseIntent === "BOUNDARY") {
    const context = decision.experiment?.userFacingMeaning;
    const base = vi ? "Mình không thể làm theo yêu cầu đó." : "I can’t help with that request.";
    return [base, context, tool].filter(Boolean).join(" ");
  }
  if (decision.responseIntent === "CORRECTION") {
    // Factual error acknowledgment — not sycophantic agreement.
    const base = vi
      ? "Đúng, câu trước tôi đọc sai. Mình đã sửa trạng thái theo lời ông vừa nói."
      : "You’re right — I misread that earlier. I’ve corrected the state to match what you said.";
    return [base, tool].filter(Boolean).join(" ");
  }
  if (decision.responseIntent === "EXPERIMENT_UPDATE" && decision.experiment) {
    return [decision.experiment.userFacingMeaning, tool].filter(Boolean).join(" ");
  }
  if (decision.responseIntent === "ACTION_CONFIRMATION" || decision.responseIntent === "ACTION_PROPOSAL") {
    return tool ?? (vi ? "Mình có thể đề xuất bước tiếp theo." : "I can propose the next step.");
  }
  const fact = decision.currentState.facts.find((item) => item.state === "PRESENT");
  const base = fact
    ? (vi ? `Mình đã ghi nhận ${fact.concept.toLowerCase().replaceAll("_", " ")} trong cập nhật hiện tại.` : `I’ve accounted for the current ${fact.concept.toLowerCase().replaceAll("_", " ")}.`)
    : (vi ? "Mình đã cập nhật theo thông tin hiện tại. Bạn muốn xử lý phần nào tiếp theo?" : "I’ve updated the current picture. What would you like to work on next?");
  return [base, decision.experiment?.userFacingMeaning, tool].filter(Boolean).join(" ");
}

export function realizeNaturalResponse(input: {
  decision: DanteDecision;
  strategyState: ResponseStrategyState;
  draftReply?: string;
}): string {
  const source = input.draftReply ?? deterministicReply(input.decision);
  const scrubbed = scrubInternalJargon(source, input.decision.userLanguage);
  const compressed = input.decision.flags?.templateAttractor || input.decision.flags?.alreadyExplainedRationale
    ? (input.decision.flags?.alreadyExplainedRationale && input.draftReply
      ? compressAlreadyExplainedReply({ language: input.decision.userLanguage })
      : compressRepeatedParagraphs(scrubbed, input.strategyState))
    : scrubbed;

  const validated = validateOutputClaims({ draft: compressed, decision: input.decision });
  return validated.repairedText;
}
