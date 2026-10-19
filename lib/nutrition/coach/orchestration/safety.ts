import { reviseClaimSpans } from "@/lib/intelligence/performance-core/claim-revision"
import { detectLanguage } from "./context"
import type { Language, ResponseMode } from "./types"

/**
 * Planner-level safety screen (N1.6.4 Phase 2).
 *
 * ADDITIVE to the existing intent.ts pre-gate, which is untouched: this only ever makes the coach MORE
 * conservative. It is deterministic (no model), runs before understanding/planning, and a model or a
 * continuation ("yes ...") can never override it. When it fires, normal coaching stops: no continuation of
 * a meal plan, no macro fitting, no tools, no personalized prescription, no diagnosis.
 */

export type SafetyKind = "chest_pain" | "extreme_restriction" | "prolonged_fasting" | "purging" | "pregnancy" | "diabetes" | "kidney" | "medication" | "allergy_conflict" | "supplement_medical" | "supplement_claim"

export type SafetyScreen = { kind: SafetyKind; mode: Extract<ResponseMode, "SAFE_REDIRECT" | "ESCALATE" | "REFUSE_POLICY">; item?: string }

export const SAFETY_RESPONSE_CONTRACT = {
  acknowledgeConcern: true,
  avoidNormalCoachingContinuation: true,
  provideSafeGeneralInformationOnly: true,
  recommendProfessionalSupportWhenAppropriate: true,
  doNotProvidePersonalizedPrescription: true,
  doNotProvideHarmfulInstructions: true,
} as const

const L = "(?<![\\p{L}\\p{N}])"
const R = "(?![\\p{L}\\p{N}])"
const word = (alternatives: string) => new RegExp(`${L}(?:${alternatives})${R}`, "iu")

const NUMBER_WORDS: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, week: 7, hai: 2, ba: 3, bốn: 4, năm: 5, sáu: 6, bảy: 7, tuần: 7 }
const toNumber = (token: string): number => (/^\d+$/.test(token) ? Number(token) : (NUMBER_WORDS[token.toLowerCase()] ?? 0))
const COUNT = "(\\d+|two|three|four|five|six|seven|hai|ba|bốn|năm|sáu|bảy|a week|một tuần)"

const CHEST = word("chest\\s+(?:pain|hurts?|tight\\w*|pressure|đau|tức)|pain in (?:my )?chest|(?:can'?t|cannot|hard to) breathe|short(?:ness)? of breath|faint(?:ed|ing)?|passed out|đau ngực|tức ngực|ngực\\s+(?:tôi\\s+|mình\\s+)?(?:đau|tức)|khó thở|ngất xỉu|ngất")
const PURGE = word("vomit\\w*|purg\\w*|laxatives?|diuretics?|throw(?:ing)? up|make myself (?:sick|throw up|vomit)|nôn|ói ra|ép ói|móc họng|thuốc xổ|thuốc nhuận tràng|starve myself|nhịn đói cho gầy")
const FASTING = [
  new RegExp(`(?:haven'?t|have not|hasn'?t|didn'?t|did not)\\s+(?:\\p{L}+\\s+){0,3}?(?:eaten|eat|had (?:any )?food)[^.?!]{0,25}?${COUNT}\\s*(?:days?|ngày)`, "iu"),
  new RegExp(`${COUNT}\\s*(?:days?|ngày)\\s+(?:without|no|không)\\s+(?:eating|food|ăn)`, "iu"),
  new RegExp(`(?:fast(?:ing)?|nhịn ăn)\\s+(?:for\\s+)?${COUNT}\\s*(?:days?|ngày)`, "iu"),
  new RegExp(`(?:không ăn|chưa ăn)[^.?!]{0,20}?${COUNT}\\s*ngày`, "iu"),
  new RegExp(`${COUNT}\\s*ngày\\s+(?:rồi\\s+)?(?:không|chưa)\\s+ăn`, "iu"),
]
const RESTRICTION = [
  /\b(?:only|just)\s+(?:eat(?:ing)?\s+)?(\d{3,4})\s*(?:k?cals?|calories|calo)\b(?!\s*(?:left|remaining|more|for\s+(?:this|the|my|dinner|lunch|breakfast|a\s+(?:meal|snack))|in\s+(?:this|the|my)|per\s+meal|a\s+meal|còn))/i,
  /\beat(?:ing)?\s+(?:only\s+)?(\d{3,4})\s*(?:k?cals?|calories)\s+(?:a|per|every|each)\s+day\b/i,
  /\b(\d{3,4})\s*(?:kcal|k?cal(?:orie)?s?|calo)\b[^.?!]{0,24}\bday\b/i,
  /\b(?:half|halve)\b[^.?!]{0,24}\b(?:calories|kcal|cals|intake)\b|\b(?:calories|kcal|cals|intake)\b[^.?!]{0,24}\b(?:half|halve)\b/i,
  /\bcut as hard as possible\b/i,
  /\bcut\s+(?:down\s+)?to\s+(\d{3,4})\s*(?:k?cals?|calories)\b/i,
  /chỉ\s+ăn\s+(\d{3,4})\s*(?:k?cal|calo)/iu,
  /ăn\s+(\d{3,4})\s*(?:k?cal|calo)\s*(?:mỗi|một|\/)\s*ngày/iu,
]
const PREGNANCY = word("pregnan\\w*|expecting a baby|breast-?feeding|nursing mother|lactating|mang thai|có bầu|bà bầu|đang bầu|cho con bú")
const DIABETES = word("diabet\\w*|insulin|hba1c|blood sugar (?:medication|control|spikes?)|tiểu đường|đái tháo đường|đường huyết")
const KIDNEY = word("kidney(?!\\s+beans?)\\w*|renal|dialysis|ckd|egfr|bệnh thận|suy thận|chạy thận|sỏi thận")
const MEDICATION = word("medication|medicine|prescription|warfarin|metformin|statins?|blood thinners?|antidepress\\w*|ssri|lithium|levothyroxine|uống thuốc|đang dùng thuốc|thuốc (?:điều trị|kê đơn|huyết áp|tiểu đường|tây)")

// Supplement boundary (narrow, pre-CIH): medical context + a supplement + a request to OPTIMISE its use (dose, timing, stack,
// cycle, treatment, "can I take") stops coaching. Naming a supplement, or asking what it is, stays normal education.
const SUPPLEMENT = word("supplements?|supps?|white kidney beans?(?: extract)?|kidney bean extract|wkbe|phaseolus\\w*|carb blockers?|fat burners?|milk thistle|silymarin|tudca|nac|berberine|ashwagandha|chromium|alpha[- ]lipoic acid|cinnamon (?:extract|capsules?|pills?)|apple cider vinegar (?:pills?|capsules?|gummies)|liver (?:support|protect\\w*|detox|cleanse|aid)|kidney (?:support|protect\\w*|detox|cleanse)|organ support|on[- ]cycle support|thực phẩm chức năng|thực phẩm bổ sung|kế sữa|đậu thận trắng")
const LIVER = word("liver (?:enzymes?|disease|damage|problems?|issues?|values?|panel|function)|fatty liver|hepatitis|cirrhosis|(?:high|elevated|raised) (?:alt|ast|ggt)|men gan|gan nhiễm mỡ|viêm gan|xơ gan")
// A stack sold to "protect" an organ is a treatment claim even with no diagnosis stated ("liver and kidney stack for the gym").
const ORGAN_STACK = word("(?:liver|kidneys?|gan|thận)[^.?!]{0,30}(?:stack|support|protect\\w*|detox|cleanse)|(?:stack|support|protect\\w*|detox|cleanse)[^.?!]{0,30}(?:liver|kidneys?|gan|thận)")
const PED_CONTEXT = word("steroids?|anabolic|sarm\\w*|prohormone\\w*|on[- ]cycle")
// Claim intent, one alternation per class. SUPPLEMENT_OPTIMISE (the medical-context stop) is their union: it matches what it always did.
const DOSING = "dos(?:e|es|ing|age)|how (?:much|many|often|long)|capsules?|pills?|tablets?|\\d+\\s*mg|per day|daily|liều|uống (?:mấy|bao nhiêu)|bao nhiêu viên|mấy viên"
const TIMING = "when (?:should|do|can|to|is)|what time|best time|timing|before (?:or after )?(?:a |my |each )?(?:meals?|eating|food|carbs|bed|training|workouts?)|after (?:a |my |each )?(?:meals?|eating|food|carbs|training|workouts?)|with (?:meals?|food|carbs)|khi nào|lúc nào|trước (?:bữa )?ăn|sau (?:bữa )?ăn"
const STACK = "stack\\w*|cycl(?:e|es|ing)|combin\\w*|kết hợp"
const INTERACTION = "(?:can|should|could|may) i (?:still )?(?:take|use|start|try|add|combine)|is it (?:safe|ok|okay)|safe (?:to take|for me)|uống được không|dùng được không|có nên (?:uống|dùng)"
const TREATMENT = "treat\\w*|cure\\w*|fix|reverse|lower (?:my|the)|bring (?:down|my)|chữa|trị"
const SUPPLEMENT_OPTIMISE = word([DOSING, TIMING, STACK, INTERACTION, TREATMENT].join("|"))

// TREATMENT_OUTCOME: a supplement asked to change an organ, a lab marker or a disease ("does TUDCA lower liver enzymes?").
// No stated condition is needed: the question itself asks for a clinical result. MECHANISM != CLINICAL BENEFIT.
const OUTCOME_WORDS = "treat\\w*|cure\\w*|heal\\w*|fix\\w*|revers\\w*|repair\\w*|lower\\w*|reduc\\w*|decreas\\w*|drop|bring(?:s|ing)? down|normali[sz]\\w*|improv\\w*|protect\\w*|restor\\w*|regenerat\\w*|help\\w*|support\\w*|good for|chữa|trị|hạ|giảm|phục hồi|bảo vệ|cải thiện|giúp|tốt cho|bổ|mát"
const OUTCOME = word(OUTCOME_WORDS)
const CLINICAL_TARGET_WORDS = "liver|hepatic|kidneys?(?!\\s+beans?)|renal|enzymes?|alt|ast|ggt|bilirubin|creatinine|egfr|blood sugar|blood glucose|glucose|a1c|hba1c|insulin resistance|cholesterol|ldl|triglycerides?|blood pressure|hypertension|diabet\\w*|hepatitis|cirrhosis|gan|(?<!đậu )thận|đường huyết|tiểu đường|mỡ máu|huyết áp"
const CLINICAL_TARGET = word(CLINICAL_TARGET_WORDS)
// A pick asked FOR an organ, marker or disease ("best supps for my liver") asks for a clinical result without an outcome verb.
const PICK_FOR_CLINICAL = word(`(?:best|top|recommend\\w*|good|what)[^.?!]{0,40}?(?:for|cho) (?:my |your |the |his |her |a )?(?:healthy |better )?(?:${CLINICAL_TARGET_WORDS})`)
// "Detox"/"cleanse" of an organ is a treatment claim whatever is being sold, so it needs no named product.
const ORGAN_DETOX = word("(?:detox\\w*|cleans\\w*|flush\\w*|purif\\w*|thải độc|giải độc|thanh lọc)[^.?!]{0,30}(?:liver|kidneys?|gan|thận)|(?:liver|kidneys?|gan|thận)[^.?!]{0,30}(?:detox\\w*|cleans\\w*|flush\\w*|thải độc|giải độc|thanh lọc)")
// "What should I take/drink to ..." asks for a product to do the job, even with none named.
const SEEKS_PRODUCT = word("what (?:should|can|do) i (?:take|drink|use)|what (?:to|supplements?) (?:take|helps?|works?)|(?:something|anything) (?:to take|i can take)|uống gì|dùng gì|thuốc gì")
const REFERS_TO_IT = word("it|this|that|these|those|they|nó|cái (?:đó|này)|loại (?:đó|này)")
const MECHANISM = word("how (?:does|do|is|are)[^.?!]{0,40}(?:work|act|function|absorb\\w*)|mechanism|cơ chế|hoạt động (?:thế nào|ra sao|như thế nào)")
const BENEFIT = word("benefits?|help\\w*|good for|worth (?:it|taking)|evidence|effective|works?|tác dụng|lợi ích|hiệu quả|có tốt")

export type SupplementClaimIntent = "GENERAL_EDUCATION" | "MECHANISM" | "POSSIBLE_BENEFIT" | "TREATMENT_OUTCOME" | "DOSING" | "TIMING" | "STACK" | "INTERACTION"
const USE_CLASSES: Array<[SupplementClaimIntent, RegExp]> = [["DOSING", word(DOSING)], ["TIMING", word(TIMING)], ["STACK", word(STACK)], ["INTERACTION", word(INTERACTION)]]
const USE_REQUESTS: ReadonlySet<SupplementClaimIntent> = new Set(["DOSING", "TIMING", "STACK", "INTERACTION"])

/**
 * What is being asked ABOUT a supplement; null when the message is not about one. `intent` is the most restrictive class that
 * applies (a use request outranks a claim question); `treatmentOutcome` is reported separately because "how much does X lower
 * my ALT?" is both. Education and mechanism questions are never stopped by this classification.
 */
export function classifySupplementClaim(message: string, recent: Array<{ role: string; text: string }> = []): { intent: SupplementClaimIntent; treatmentOutcome: boolean; item?: string } | null {
  const text = message.trim()
  const named = text.match(SUPPLEMENT)?.[0] ?? (REFERS_TO_IT.test(text) ? recent.map((turn) => turn.text).join(" \n ").match(SUPPLEMENT)?.[0] : undefined)
  const organDetox = ORGAN_DETOX.test(text)
  const subject = Boolean(named) || SEEKS_PRODUCT.test(text)
  if (!subject && !organDetox) return null
  const treatmentOutcome = organDetox || (subject && ((OUTCOME.test(text) && CLINICAL_TARGET.test(text)) || PICK_FOR_CLINICAL.test(text)))
  const use = named ? USE_CLASSES.find(([, pattern]) => pattern.test(text))?.[0] : undefined
  const intent = use ?? (treatmentOutcome ? "TREATMENT_OUTCOME" : MECHANISM.test(text) ? "MECHANISM" : BENEFIT.test(text) ? "POSSIBLE_BENEFIT" : "GENERAL_EDUCATION")
  // A generic word ("supps") names no product: the copy then speaks about supplements in general.
  const item = named && !/^(?:supplements?|supps?)$/i.test(named) ? named.toLowerCase() : undefined
  return { intent, treatmentOutcome, ...(item ? { item } : {}) }
}

// OUTPUT integrity for supplement EDUCATION (Final Repair D1). The screen above only sees the QUESTION, so "What does TUDCA do?"
// reaches the model, and a prompt rule alone did not stop "may reduce liver stress" / "may aid in detoxification" coming back.
// A sentence that pairs a benefit verb with an organ, disease or lab marker (or mentions detox at all) is a clinical claim and is
// removed; identity, mechanism, studied context and stated uncertainty are kept. MECHANISM != CLINICAL BENEFIT.
const CLAIM_VERB = `${OUTCOME_WORDS.replace("heal\\w*", "heal(?:s|ed|ing)?")}|benefi\\w*|aid(?:s|ed|ing)?|promot\\w*|enhanc\\w*|boost\\w*|alleviat\\w*|prevent\\w*|hỗ trợ|tăng cường|ngăn ngừa`
// Narrower than CLINICAL_TARGET: a bare "enzyme" or "glucose" is how a mechanism is described ("inhibits the alpha-amylase enzyme").
const CLAIM_TARGET = word("liver|hepat\\w*|kidneys?(?!\\s+beans?)|renal|organs?|alt|ast|ggt|bilirubin|creatinine|egfr|blood sugar|blood glucose|a1c|hba1c|insulin (?:resistance|sensitivity)|cholesterol|ldl|triglycerides?|blood pressure|hypertension|diabet\\w*|cirrhosis|gan|(?<!đậu )thận|đường huyết|tiểu đường|mỡ máu|huyết áp")
const DETOX_WORDS = "detox\\w*|cleans(?:e|es|ed|ing)|toxins?|thải độc|giải độc|thanh lọc|độc tố"
// A claim that is denied, questioned, or reported as what was studied / what is advertised is education, not a claim.
const NOT_ASSERTED = word("no|not|never|nothing|none|neither|nor|cannot|can'?t|doesn'?t|don'?t|isn'?t|aren'?t|won'?t|hasn'?t|haven'?t|without|unproven|unclear|whether|studied|researched|investigated|examined|tested|marketed|sold|advertised|không|chưa|chẳng|nghiên cứu|quảng cáo")

function assertsClinicalBenefit(sentence: string): boolean {
  const claim = (CLAIM_TARGET.test(sentence) ? sentence.match(word(`${CLAIM_VERB}|${DETOX_WORDS}`)) : null) ?? sentence.match(word(DETOX_WORDS))
  if (!claim) return false
  // ponytail: cue-before-claim heuristic over the 60 characters ahead of the claim; a parser/classifier belongs to the future CIH layer.
  return !NOT_ASSERTED.test(sentence.slice(Math.max(0, claim.index! - 60), claim.index!))
}

const EDUCATION_CAVEAT = {
  en: "How a supplement is thought to work is not proof of a health benefit: the human evidence is limited and mixed, so I can't promise a result for any condition or lab marker. For a health concern, a doctor or pharmacist is the right person to ask.",
  vi: "Cơ chế được cho là có không đồng nghĩa với lợi ích sức khỏe đã được chứng minh: bằng chứng trên người còn hạn chế và chưa thống nhất, nên mình không thể hứa kết quả cho bất kỳ bệnh lý hay chỉ số xét nghiệm nào. Nếu bạn lo về sức khỏe, hãy hỏi bác sĩ hoặc dược sĩ.",
}

/**
 * Rewrites a model reply on a supplement turn so it stays education. Clinical-benefit spans go through the
 * canonical reviseClaimSpans path (identity heads stay; dependent "therefore" lines go). One evidence caveat
 * is appended. `removed` = sentences dropped or shortened (0 = reply untouched, including every non-supplement turn).
 */
export function supplementEducationReply(reply: string, message: string, recent: Array<{ role: string; text: string }> = []): { reply: string; removed: number } {
  if (!classifySupplementClaim(message, recent)) return { reply, removed: 0 }
  const revised = reviseClaimSpans(reply, assertsClinicalBenefit)
  if (revised.removed === 0) return { reply, removed: 0 }
  const caveat = EDUCATION_CAVEAT[detectLanguage(message, "en") === "en" ? "en" : "vi"]
  return { reply: revised.reply ? `${revised.reply}\n\n${caveat}` : caveat, removed: revised.removed }
}

// "when should I take it?" after a supplement was named earlier: the pronoun still means the supplement.
const TAKES_IT = word("(?:take|taking|use|using|start|dose|stack|cycle|combine) (?:it|them|that|this|those|these)|uống (?:nó|cái đó)|dùng (?:nó|cái đó)")

// A condition keyword alone is context, not a crisis: only a request for personal targets, doses, plans or weight-loss
// numbers interrupts. "Can I eat X" is a personal clearance for diabetes/kidney, but general food-safety for pregnancy.
const PRESCRIPTIVE = word("how much|how many|exactly|should i|tell me|per day|every day|daily|targets?|dos(?:e|ing|age)|units|what (?:should|can|do) i eat|meal plan|diet plan|plan for me|cut(?:ting)?\\s+\\d+|lose weight|weight loss|bao nhiêu|mỗi ngày|ăn gì|nên ăn|kế hoạch|thực đơn|giảm (?:cân|nhanh)|liều")
const CLEARANCE = word("can i (?:eat|have|drink)|is it (?:safe|ok|okay)|safe for me|được không|có nên")
const personal = (text: string, clearance: boolean) => PRESCRIPTIVE.test(text) || (clearance && CLEARANCE.test(text))

const ALLERGY_STATEMENT =/\b(?:i'?m|i am|i have a|i have|am)\s+(?:severely\s+|really\s+)?allergic\s+to\s+([\p{L}][\p{L} ]{1,24}?)(?=[,.;!?]|\s+(?:and|but|so|please)\b|$)/iu
const ALLERGY_STATEMENT_VI = /(?:tôi|mình|em)\s+(?:bị\s+)?dị\s+ứng\s+(?:với\s+)?([\p{L}]+)/iu
const ADD_CUE = word("add|include|use|put|mix|sprinkle|stir|top (?:it )?with|with|thêm|cho thêm|bỏ thêm|dùng")
const NEGATION = word("no|not|don'?t|without|avoid|can'?t|never|except|free|allergic|không|tránh|dị ứng")

const stem = (term: string) => term.trim().toLowerCase().split(/\s+/)[0].replace(/(?:es|s)$/, "")
const contains = (text: string, term: string) => term.length >= 3 && new RegExp(`${L}${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu").test(text)

function fastingDays(text: string): number {
  for (const pattern of FASTING) {
    const match = text.match(pattern)
    if (match) return toNumber(match[1].trim().split(/\s+/).pop()!)
  }
  return 0
}

/** Medical context + supplement + optimisation request. `recent` lets a condition or supplement named a turn earlier still count. */
function supplementBoundary(text: string, recent: Array<{ role: string; text: string }>): string | null {
  if (!SUPPLEMENT_OPTIMISE.test(text)) return null
  const userHistory = recent.filter((turn) => turn.role === "user").map((turn) => turn.text).join(" \n ")
  const stated = `${text} \n ${userHistory}`
  const medical = PREGNANCY.test(stated) || DIABETES.test(stated) || KIDNEY.test(stated) || MEDICATION.test(stated) || LIVER.test(stated) || ORGAN_STACK.test(text) || PED_CONTEXT.test(text)
  if (!medical) return null
  const named = text.match(SUPPLEMENT) ?? (TAKES_IT.test(text) ? `${userHistory} \n ${recent.map((turn) => turn.text).join(" \n ")}`.match(SUPPLEMENT) : null)
  if (named) return named[0].toLowerCase()
  if (ORGAN_STACK.test(text)) return "organ support"
  return null
}

export function screenSafety(message: string, guards?: { allergies?: string[]; recent?: Array<{ role: string; text: string }> }): SafetyScreen | null {
  const text = message.trim()
  if (CHEST.test(text)) return { kind: "chest_pain", mode: "ESCALATE" }
  if (PURGE.test(text)) return { kind: "purging", mode: "REFUSE_POLICY" }
  if (fastingDays(text) >= 2) return { kind: "prolonged_fasting", mode: "ESCALATE" }
  for (const pattern of RESTRICTION) {
    const match = text.match(pattern)
    if (!match) continue
    if (match[1] === undefined || Number(match[1]) < 1200) return { kind: "extreme_restriction", mode: "SAFE_REDIRECT" }
  }

  // Allergy conflict: "I'm allergic to peanuts, add peanut butter." and profile allergies requested outright.
  const stated = text.match(ALLERGY_STATEMENT) ?? text.match(ALLERGY_STATEMENT_VI)
  if (stated) {
    const rest = text.slice((stated.index ?? 0) + stated[0].length)
    const allergen = stem(stated[1])
    if (contains(rest, allergen) && ADD_CUE.test(rest)) return { kind: "allergy_conflict", mode: "REFUSE_POLICY", item: stated[1].trim().toLowerCase() }
  }
  if (!NEGATION.test(text) && ADD_CUE.test(text)) {
    const hit = guards?.allergies?.find((allergy) => contains(text, stem(allergy)))
    if (hit) return { kind: "allergy_conflict", mode: "REFUSE_POLICY", item: hit.toLowerCase() }
  }

  // Before the condition branches: their replies are about food targets and would not address the supplement at all.
  const supplement = supplementBoundary(text, guards?.recent ?? [])
  const claim = classifySupplementClaim(text, guards?.recent ?? [])
  // Dose / timing / stack under medical context keeps its own stop; any other treatment-outcome question gets the claim boundary,
  // which needs no stated condition ("does TUDCA lower liver enzymes?").
  if (supplement && !(claim?.treatmentOutcome && !USE_REQUESTS.has(claim.intent))) return { kind: "supplement_medical", mode: "ESCALATE", item: supplement }
  if (claim?.treatmentOutcome) return { kind: "supplement_claim", mode: "SAFE_REDIRECT", ...(claim.item ? { item: claim.item } : {}) }

  if (PREGNANCY.test(text) && personal(text, false)) return { kind: "pregnancy", mode: "ESCALATE" }
  if (DIABETES.test(text) && personal(text, true)) return { kind: "diabetes", mode: "ESCALATE" }
  if (KIDNEY.test(text) && personal(text, true)) return { kind: "kidney", mode: "ESCALATE" }
  if (MEDICATION.test(text)) return { kind: "medication", mode: "ESCALATE" }
  return null
}

const PRO = { en: "a doctor or registered dietitian", vi: "bác sĩ hoặc chuyên gia dinh dưỡng" }

const REPLIES: Record<SafetyKind, { en: (item?: string) => string; vi: (item?: string) => string }> = {
  chest_pain: {
    en: () => "That matters more than any meal plan right now. Chest pain, trouble breathing or feeling faint can be serious — please stop, and contact your local emergency number or a doctor straight away. I'm pausing the food planning here; we can pick it up once you've been looked after.",
    vi: () => "Chuyện này quan trọng hơn mọi kế hoạch ăn uống lúc này. Đau ngực, khó thở hay choáng váng có thể nghiêm trọng — bạn hãy dừng lại và liên hệ cấp cứu hoặc bác sĩ ngay. Mình tạm dừng việc lên thực đơn, khi nào bạn ổn thì mình tiếp tục nhé.",
  },
  extreme_restriction: {
    en: () => `I won't plan around an intake that low — eating that little for more than a short while can drain your energy and health. If fat loss is the goal, I can help with a sustainable approach based on your profile. And if food feels stressful or hard to control, ${PRO.en} is a good next step.`,
    vi: () => `Mình sẽ không lên kế hoạch với mức ăn thấp như vậy — ăn quá ít kéo dài có thể hại sức khỏe và năng lượng. Nếu mục tiêu là giảm mỡ, mình có thể giúp một cách bền vững dựa trên hồ sơ của bạn. Và nếu việc ăn uống đang khiến bạn căng thẳng, ${PRO.vi} là người nên trao đổi.`,
  },
  prolonged_fasting: {
    en: () => `Going days without food is a real health concern, and it's beyond what I can safely coach. Please speak to ${PRO.en} soon, and if you feel weak, dizzy or unwell, get urgent care. I'm not going to plan meals around this — general, gentle eating guidance is best given by someone who can check on you.`,
    vi: () => `Nhiều ngày không ăn là vấn đề sức khỏe nghiêm trọng, vượt quá phạm vi mình có thể hướng dẫn an toàn. Bạn nên gặp ${PRO.vi} sớm, và nếu thấy yếu, chóng mặt hay khó chịu thì hãy đi khám khẩn cấp. Mình sẽ không lên thực đơn trong tình huống này.`,
  },
  purging: {
    en: () => `I can't help with that — making yourself sick or using laxatives to offset food can seriously harm your body, and I won't give instructions for it. You don't have to handle this alone: ${PRO.en}, or a local eating-disorder support line, can help without judgment. One meal never needs compensating for.`,
    vi: () => `Mình không thể hỗ trợ việc đó — gây nôn hay dùng thuốc xổ để bù đắp bữa ăn có thể gây hại nghiêm trọng, và mình sẽ không hướng dẫn. Bạn không phải đối mặt một mình: ${PRO.vi}, hoặc đường dây hỗ trợ rối loạn ăn uống tại địa phương, sẽ giúp bạn mà không phán xét. Một bữa ăn không bao giờ cần phải "bù".`,
  },
  pregnancy: {
    en: () => `Nutrition needs change during pregnancy and breastfeeding, so I won't give a personalised plan or numbers here. In general, food safety and a varied diet matter, but the specifics depend on you — please check with your midwife, doctor or ${PRO.en}. I can explain general nutrition concepts any time.`,
    vi: () => `Nhu cầu dinh dưỡng thay đổi khi mang thai và cho con bú, nên mình sẽ không đưa kế hoạch hay con số cá nhân hóa ở đây. Nói chung, an toàn thực phẩm và chế độ ăn đa dạng rất quan trọng, nhưng chi tiết tùy từng người — bạn nên hỏi bác sĩ, nữ hộ sinh hoặc ${PRO.vi}. Mình vẫn có thể giải thích các khái niệm dinh dưỡng chung.`,
  },
  diabetes: {
    en: () => `Managing blood sugar through food is best planned with your care team, especially if you use insulin or medication. I can explain general nutrition ideas (what carbs, fibre and protein do), but I can't set carb targets or say what's safe for you — please check with your doctor or ${PRO.en}.`,
    vi: () => `Kiểm soát đường huyết qua chế độ ăn nên được lên kế hoạch cùng đội ngũ y tế của bạn, nhất là khi bạn dùng insulin hoặc thuốc. Mình có thể giải thích các khái niệm dinh dưỡng chung (carb, chất xơ, đạm), nhưng không đặt mức carb hay nói điều gì an toàn cho bạn — hãy hỏi ${PRO.vi}.`,
  },
  kidney: {
    en: () => `With kidney disease, limits on protein, potassium or phosphorus are set by your care team and can change over time, so I won't give personalised targets or food lists. I can share general nutrition information, but please plan your diet with your doctor or a renal dietitian.`,
    vi: () => `Với bệnh thận, giới hạn về đạm, kali hay phốt pho do đội ngũ y tế quyết định và có thể thay đổi, nên mình sẽ không đưa mục tiêu hay danh sách món cá nhân hóa. Mình có thể chia sẻ thông tin dinh dưỡng chung, nhưng bạn hãy lên chế độ ăn cùng bác sĩ hoặc chuyên gia dinh dưỡng thận.`,
  },
  medication: {
    en: () => `Whether a food or supplement interacts with a medication isn't something I can judge safely. Please ask your pharmacist or doctor, and bring the exact medication name. I'm happy to help with general nutrition questions that don't depend on it.`,
    vi: () => `Việc thực phẩm hay thực phẩm bổ sung có tương tác với thuốc hay không, mình không thể đánh giá an toàn. Bạn hãy hỏi dược sĩ hoặc bác sĩ, kèm tên thuốc cụ thể. Mình vẫn sẵn sàng giúp các câu hỏi dinh dưỡng chung không phụ thuộc vào thuốc.`,
  },
  supplement_medical: {
    en: (item) => `I won't give a dose, timing, stack or cycle for ${item ?? "that supplement"} here. With a health condition, pregnancy or medication in the picture, a supplement can change how a medicine works or shift things like blood sugar, liver or kidney markers, so that call belongs to your doctor or pharmacist. What I can say in general: the research on supplements like this is limited and mixed, products vary a lot in strength and purity, and "natural" does not mean interaction-free. Take the exact product label to your pharmacist or doctor before starting or changing it. If it helps, I can suggest food-first options (fibre, protein, how meals are built) that don't rely on a supplement.`,
    vi: (item) => `Mình sẽ không đưa liều lượng, thời điểm uống, cách kết hợp hay chu kỳ dùng cho ${item ?? "thực phẩm bổ sung đó"}. Khi có bệnh lý, đang mang thai hoặc đang dùng thuốc, thực phẩm bổ sung có thể làm thay đổi tác dụng của thuốc hoặc ảnh hưởng đường huyết, chỉ số gan, thận, nên việc này cần bác sĩ hoặc dược sĩ quyết định. Điều mình có thể nói chung: bằng chứng cho các sản phẩm kiểu này còn hạn chế và chưa thống nhất, hàm lượng và độ tinh khiết giữa các sản phẩm rất khác nhau, và "tự nhiên" không có nghĩa là không tương tác. Bạn hãy mang nhãn sản phẩm cụ thể đến hỏi dược sĩ hoặc bác sĩ trước khi bắt đầu hay thay đổi. Nếu muốn, mình có thể gợi ý cách ăn uống (chất xơ, đạm, cách xây bữa ăn) không phụ thuộc vào thực phẩm bổ sung.`,
  },
  supplement_claim: {
    en: (item) => `I can't tell you that ${item ?? "any supplement or detox product"} will treat a condition, protect an organ or move a lab marker, and I won't suggest it as a treatment. A proposed mechanism or a small study is not the same as a proven benefit: for supplements like this the human evidence is limited and mixed, results differ between people and products, and nothing you swallow "detoxes" an organ — the liver and kidneys already do that work. If a test result is abnormal, or you have or suspect a liver, kidney or blood-sugar condition, the useful next step is a doctor finding the cause, not a supplement. I can explain in general terms what ${item ?? "a specific supplement"} is and what the research does and doesn't show, or help with food-first habits (regular meals, enough protein and fibre, less alcohol) that don't depend on one.`,
    vi: (item) => `Mình không thể nói rằng ${item ?? "bất kỳ thực phẩm bổ sung hay sản phẩm detox nào"} sẽ chữa bệnh, bảo vệ một cơ quan hay làm thay đổi chỉ số xét nghiệm, và mình sẽ không gợi ý nó như một cách điều trị. Cơ chế được đề xuất hay một nghiên cứu nhỏ không đồng nghĩa với lợi ích đã được chứng minh: với các sản phẩm kiểu này, bằng chứng trên người còn hạn chế và chưa thống nhất, kết quả khác nhau giữa từng người và từng sản phẩm, và không có thứ gì uống vào lại "thải độc" được cho một cơ quan — gan và thận vốn đã làm việc đó. Nếu kết quả xét nghiệm bất thường, hoặc bạn đang có hay nghi ngờ có vấn đề về gan, thận hay đường huyết, bước hữu ích tiếp theo là để bác sĩ tìm nguyên nhân, không phải dùng thực phẩm bổ sung. Mình có thể giải thích chung ${item ?? "một loại thực phẩm bổ sung cụ thể"} là gì và nghiên cứu cho thấy gì, chưa cho thấy gì, hoặc gợi ý thói quen ăn uống (ăn đều bữa, đủ đạm và chất xơ, bớt rượu bia) không phụ thuộc vào nó.`,
  },
  allergy_conflict: {
    en: (item) => `I won't add that — you've told me you're allergic${item ? ` to ${item}` : ""}, and allergies always come before preferences. I can suggest an alternative that avoids it; tell me what you're after (creamy, crunchy, protein, flavour). Always check labels for hidden traces.`,
    vi: (item) => `Mình sẽ không thêm món đó — bạn đã nói bị dị ứng${item ? ` ${item}` : ""}, và dị ứng luôn được ưu tiên hơn sở thích. Mình có thể gợi ý món thay thế không chứa nó; bạn muốn béo ngậy, giòn, nhiều đạm hay đậm vị? Nhớ kiểm tra nhãn để tránh lẫn tạp chất nhé.`,
  },
}

export function safetyReply(screen: SafetyScreen, message: string, fallback: Language = "en", forced?: "en" | "vi"): string {
  // `forced` = an explicit conversation-control language (ICH-1); it outranks what the message itself looks like.
  const language = forced ?? detectLanguage(message, fallback)
  const reply = REPLIES[screen.kind]
  return language === "en" ? reply.en(screen.item) : reply.vi(screen.item)
}
