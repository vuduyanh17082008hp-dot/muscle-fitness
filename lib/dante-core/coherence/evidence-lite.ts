/**
 * P-18 — claim-level evidence controller lite.
 * Only claims that need user-specific/verified data fail without it.
 * GENERAL / SAFETY guidance never requires telemetry.
 */

export type ClaimGroundingNeed =
  | "GENERAL_GUIDANCE"
  | "USER_STATE_DEPENDENT"
  | "VERIFIED_DATA_CLAIM"
  | "SAFETY_GUIDANCE"
  | "DIAGNOSTIC_OR_MEDICAL_CLAIM";

const VERIFIED_CLAIM =
  /\byour recovery score is\b|\brecovery score is \d+\b|\byour readiness(?: score)? is\b|\byou (?:logged|have logged)\b|\byour (?:calories|kcal) are \d+/i;
const USER_STATE =
  /\bbecause your recovery (?:has )?(?:dropped|is low)\b|\blower (?:today['’]?s )?volume because\b|\bgiven your (?:logged|recovery|sleep)\b/i;
const DIAGNOSTIC =
  /\byou have (?:a |an )?(?:tear|sprain|tendin(?:itis|opathy)|meniscus|fracture)\b|\bthis is (?:likely )?(?:a )?(?:tear|sprain|tendin(?:itis|opathy)|meniscus)\b|\bthe cause is\b|\bwhat is wrong with your (?:knee|shoulder)\b/i;
const DIAGNOSIS_DENIED = /not a diagnosis|cannot diagnose|can['’]?t diagnose|do not diagnose|khong (?:phai )?chan doan|không (?:phải )?chẩn đoán/i;
const SAFETY =
  /\bdon['’]?t (?:push|train) through\b|\bstop if\b|\bpain gets worse\b|\bgives? way\b|\blocks?\b|\bswell(?:s|ing)\b|\bget (?:it )?checked\b|\bdoctor or physio\b|\bseek (?:assessment|medical)\b/i;

export function classifyClaimGrounding(text: string): ClaimGroundingNeed {
  if (DIAGNOSTIC.test(text) && !DIAGNOSIS_DENIED.test(text)) return "DIAGNOSTIC_OR_MEDICAL_CLAIM";
  if (VERIFIED_CLAIM.test(text)) return "VERIFIED_DATA_CLAIM";
  if (USER_STATE.test(text)) return "USER_STATE_DEPENDENT";
  if (SAFETY.test(text)) return "SAFETY_GUIDANCE";
  return "GENERAL_GUIDANCE";
}

function keepSentence(
  sentence: string,
  need: ClaimGroundingNeed,
  input: { hasVerifiedData: boolean; hasUserState: boolean },
): boolean {
  if (need === "VERIFIED_DATA_CLAIM") return input.hasVerifiedData;
  if (need === "USER_STATE_DEPENDENT") return input.hasUserState;
  if (need === "DIAGNOSTIC_OR_MEDICAL_CLAIM") return false;
  return true;
}

export function applyEvidenceLite(input: {
  draft: string;
  hasVerifiedData?: boolean;
  hasUserState?: boolean;
  language: "en" | "vi";
}): string {
  const draft = input.draft.trim();
  if (!draft) return input.draft;
  const hasVerifiedData = input.hasVerifiedData ?? false;
  const hasUserState = input.hasUserState ?? false;
  const paras = draft.split(/\n{2,}/);
  const keptParas: string[] = [];
  let blockedDiagnosis = false;
  for (const para of paras) {
    const kept: string[] = [];
    for (const part of para.split(/(?<=[.!?…])\s+/).map((item) => item.trim()).filter(Boolean)) {
      const need = classifyClaimGrounding(part);
      if (need === "DIAGNOSTIC_OR_MEDICAL_CLAIM") {
        blockedDiagnosis = true;
        continue;
      }
      if (keepSentence(part, need, { hasVerifiedData, hasUserState })) kept.push(part);
    }
    if (kept.length > 0) keptParas.push(kept.join(" "));
  }
  if (blockedDiagnosis) {
    keptParas.push(input.language === "vi"
      ? "Mình không chẩn đoán chấn thương qua chat."
      : "I can't diagnose an injury over chat.");
  }
  if (keptParas.length === 0) {
    return input.language === "vi"
      ? "Mình không đủ dữ liệu đã xác minh để nêu con số đó."
      : "I don't have verified data for that number.";
  }
  return keptParas.join("\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
