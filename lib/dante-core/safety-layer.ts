import { decideDanteLanguage, type DanteLanguageDecision } from "@/lib/dante-language";

/**
 * Safety Layer (spec Part A §8).
 *
 * Dante is a training/nutrition assistant, not a medical professional.
 * This module runs BEFORE any LLM call and short-circuits to a fixed,
 * conservative escalation message when a message matches a red-flag
 * pattern. It deliberately distinguishes ordinary training language
 * ("my legs are sore", "my shoulder feels tight after bench") from
 * genuine red flags ("chest pain", "I fainted", "numbness down my
 * arm") — the goal is to catch real safety cases, not to slap a
 * warning on every normal question, which would train users to
 * ignore warnings entirely.
 *
 * This is pattern matching over the user's own words, not a
 * diagnostic system. A miss is possible; when in doubt the patterns
 * below are written to be a little over-inclusive for the highest-
 * severity categories (cardiac, neurological, fainting) and more
 * conservative for the categories where false positives are more
 * likely (soreness/DOMS language overlapping with "injury" language).
 *
 * Multilingual note: English + Vietnamese concept phrases are matched
 * on the original text and on a diacritic-stripped form so mixed-language
 * input ("đau ngực when running") still fires. No architecture change —
 * same RULES list, broader phrase coverage.
 */

export type SafetyCategory =
  | "chest_pain_cardiac"
  | "fainting_dizziness"
  | "neurological_symptoms"
  | "medical_red_flag"
  | "possible_injury"
  | "severe_pain"
  | "eating_disorder_indicator"
  | "dangerous_substance"
  | "self_harm_crisis"
  | "composed_training_risk"
  | "ambiguous_safety";

export type SafetyResponseMode = "HARD_BLOCK" | "SAFE_REDIRECT";
export type SupportedSafetyLanguage = "en" | "vi";

export type SafetyContextTrace = {
  risk: "ELEVATED" | "HIGH";
  observations: string[];
  conflicts: string[];
  diagnosticUncertainty: "HIGH";
  acuteCurrentState: boolean;
  chronicTraitWriteAllowed: false;
};

export type SafetyCheckResult = {
  triggered: boolean;
  category: SafetyCategory | null;
  matchedPhrase: string | null;
  responseMode: SafetyResponseMode | null;
  language: SupportedSafetyLanguage;
  /** Complete deterministic response returned instead of provider output. */
  responseOverride: string | null;
  /** Inspectable current-turn facts; this object is not a memory write. */
  contextTrace: SafetyContextTrace | null;
};

export type SafetyCheckOptions = {
  languageDecision?: DanteLanguageDecision;
  /** Prior user turns are used only to keep an injury boundary stable on a follow-up. */
  recentMessages?: string[];
};

type LocalizedCopy = Record<SupportedSafetyLanguage, string>;
type SafetyRule = {
  category: SafetyCategory;
  responseMode: SafetyResponseMode;
  patterns: RegExp[];
  matcher?: (message: string, recentMessages: readonly string[]) => string | null;
  /** Copy built from the message when one fixed text cannot be proportionate (S0 D-15 caffeine). */
  respond?: (message: string, recentMessages: readonly string[], language: SupportedSafetyLanguage) => string | null;
  response: LocalizedCopy | null;
};

type SymptomConcept = {
  id: string;
  patterns: RegExp[];
};

type SymptomMention = {
  index: number;
  matchedPhrase: string;
  present: boolean;
  temporalRank: 0 | 1 | 2;
};

const HARD_BLOCK_RESPONSES: Record<Exclude<SafetyCategory, "possible_injury" | "composed_training_risk">, LocalizedCopy> = {
  chest_pain_cardiac: {
    en: "That combination of symptoms can be a medical emergency. If this is happening right now, stop exercising and seek emergency medical care immediately (call your local emergency number). Dante can help with training and nutrition questions, but this isn't something to guess about here — please talk to a doctor or other qualified professional.",
    vi: "Tổ hợp triệu chứng này có thể là tình huống cấp cứu y khoa. Nếu đang xảy ra ngay lúc này, hãy ngừng tập và tìm hỗ trợ y tế khẩn cấp ngay (gọi số cấp cứu tại nơi bạn ở). Dante có thể hỗ trợ về tập luyện và dinh dưỡng, nhưng trường hợp này cần được nhân viên y tế đánh giá thay vì tìm cách tập vòng qua rủi ro.",
  },
  fainting_dizziness: {
    en: "Fainting or blacking out during or after training is not something to self-diagnose. Stop training and get checked by a medical professional, especially if it happens more than once. Dante can help with training and nutrition questions, but this isn't something to guess about here — please talk to a doctor or other qualified professional.",
    vi: "Ngất, mất ý thức hoặc chóng mặt nghiêm trọng trong hay sau khi tập không nên tự chẩn đoán. Hãy ngừng tập và được nhân viên y tế có chuyên môn đánh giá, đặc biệt nếu tình trạng lặp lại. Dante có thể tiếp tục hỗ trợ tập luyện và dinh dưỡng sau khi vấn đề y khoa trước mắt đã được xử lý.",
  },
  neurological_symptoms: {
    en: "Numbness, tingling, or sudden weakness — especially spreading down a limb — needs medical evaluation, not training advice. Please see a doctor promptly (or emergency care if it came on suddenly). Dante can help with training and nutrition questions, but this isn't something to guess about here — please talk to a doctor or other qualified professional.",
    vi: "Tê bì, cảm giác châm chích lan dọc chi hoặc yếu đột ngột cần được đánh giá y khoa sớm, không phải điều chỉnh buổi tập. Hãy dừng buổi tập và tìm hỗ trợ y tế có chuyên môn; dùng dịch vụ cấp cứu nếu triệu chứng xuất hiện đột ngột hoặc nghiêm trọng.",
  },
  medical_red_flag: {
    en: "Yellowing of the eyes or skin, very dark (cola-coloured) urine, or blood in urine or vomit needs prompt medical assessment — please see a doctor today, and go to emergency care if it comes with severe abdominal pain, confusion, fever or vomiting blood. Until you've been checked, hold off on hard training and don't start any new supplement: the cause has to be known first, and it can't be worked out over chat.",
    vi: "Vàng mắt hoặc vàng da, nước tiểu sẫm màu (như nước coca), hoặc có máu trong nước tiểu hay chất nôn cần được khám y tế sớm — hãy gặp bác sĩ ngay trong hôm nay, và đến cấp cứu nếu kèm đau bụng dữ dội, lú lẫn, sốt hoặc nôn ra máu. Cho đến khi được kiểm tra, hãy tạm dừng tập nặng và đừng bắt đầu bất kỳ thực phẩm bổ sung mới nào: cần biết nguyên nhân trước, và điều đó không thể xác định qua chat.",
  },
  severe_pain: {
    en: "That sounds like it could be an acute injury rather than normal training soreness. Please stop training on it and have it evaluated by a doctor or physiotherapist before continuing. Dante can help with training and nutrition questions, but this isn't something to guess about here — please talk to a doctor or other qualified professional.",
    vi: "Đây có thể là chấn thương cấp chứ không phải đau mỏi tập luyện thông thường. Hãy ngừng chịu tải lên vùng bị ảnh hưởng và được bác sĩ hoặc physiotherapist đánh giá trước khi tiếp tục. Không dùng thuốc giảm đau, chất kích thích hoặc chỉnh kỹ thuật để cố tập xuyên qua triệu chứng.",
  },
  eating_disorder_indicator: {
    en: "What you're describing sounds like it could be more than a nutrition-planning question, and it deserves support from a professional who specializes in this — not a calorie/macro adjustment. If you're in the US, the National Eating Disorders Association helpline (1-800-931-2237) is a place to start; wherever you are, please consider reaching out to a doctor or counselor. Dante will keep helping with training and general nutrition whenever you're ready.",
    vi: "Điều bạn mô tả có thể vượt quá một câu hỏi lập kế hoạch dinh dưỡng và cần sự hỗ trợ của chuyên gia có chuyên môn, thay vì chỉ chỉnh calories hoặc macros. Bạn nên cân nhắc liên hệ bác sĩ hoặc chuyên gia sức khỏe tâm thần tại nơi mình sống. Dante vẫn có thể hỗ trợ tập luyện và dinh dưỡng tổng quát, không mang tính hạn chế cực đoan.",
  },
  dangerous_substance: {
    en: "Dante doesn't provide dosing guidance for substances like this — several of the ones you're describing carry serious, sometimes life-threatening risks even at \"typical\" doses discussed online. Please talk to a doctor before using anything like this, and consider that most physique/performance goals are very achievable with training and nutrition alone. Dante can help with training and nutrition questions, but this isn't something to guess about here — please talk to a doctor or other qualified professional.",
    vi: "Dante không cung cấp hướng dẫn liều dùng hoặc phối hợp các chất này. Cách làm được yêu cầu có thể mang rủi ro nghiêm trọng, vì vậy hãy trao đổi với nhân viên y tế có chuyên môn. Mình vẫn có thể giúp bạn theo đuổi mục tiêu hình thể hoặc hiệu suất bằng tập luyện, dinh dưỡng, giấc ngủ và recovery.",
  },
  self_harm_crisis: {
    en: "I hear both parts of what you wrote: you are saying you want to die, and you are also talking about how much the bench goal is affecting you. Before anything about training, are you thinking about acting on this right now, do you have a plan or means to hurt yourself, or do you feel unable to stay safe? If there may be immediate danger, call your local emergency number or crisis service now, move near someone you trust, and move away from anything you could use to hurt yourself. If it is not immediate, please still contact someone you trust and a qualified mental-health professional today. You do not have to handle this alone.",
    vi: "Mình nghe thấy cả hai điều: bạn đang nói rằng bạn muốn chết, và bạn vẫn đang nghĩ đến việc tập chân ngày mai. Trước mọi chuyện về tập luyện, ngay lúc này bạn có đang nghĩ đến việc hành động theo điều đó, có kế hoạch hoặc phương tiện làm hại bản thân, hay cảm thấy mình không thể giữ an toàn không? Nếu có nguy hiểm trước mắt, hãy gọi số cấp cứu hoặc dịch vụ khủng hoảng tại nơi bạn ở ngay, đến gần người bạn tin tưởng và tránh xa những thứ có thể dùng để làm hại bản thân. Nếu chưa phải nguy hiểm tức thời, hãy vẫn liên hệ một người bạn tin tưởng và chuyên gia sức khỏe tâm thần hôm nay. Bạn không cần chịu đựng một mình.",
  },
  ambiguous_safety: {
    en: "I want to check what you mean by \"I'm dying.\" Do you mean that figuratively, or are you in immediate danger or thinking about hurting yourself? Please answer that before we talk about training.",
    vi: "Mình muốn kiểm tra ý bạn khi nói \"mình đang chết\". Bạn đang nói theo nghĩa bóng, hay đang gặp nguy hiểm trước mắt hoặc nghĩ đến việc làm hại bản thân? Hãy trả lời điều đó trước khi mình nói về tập luyện.",
  },
};

/**
 * ICH-1: copy for a stated urge or intent to self-harm. Same category and lifecycle as self_harm_crisis; separate wording
 * because the crisis copy above quotes a specific statement the user may not have made.
 */
const SELF_HARM_INTENT_RESPONSE: LocalizedCopy = {
  en: "Thank you for telling me — that matters more than anything about training or food. Are you thinking about acting on this right now, do you have a plan or the means to hurt yourself, or do you feel unable to stay safe? If there may be immediate danger, call your local emergency number or a crisis line now, move near someone you trust, and move away from anything you could use to hurt yourself. If it is not immediate, please still reach out today to someone you trust and to a qualified mental-health professional. You do not have to handle this alone.",
  vi: "Cảm ơn bạn đã nói ra — điều này quan trọng hơn mọi chuyện về tập luyện hay ăn uống. Ngay lúc này bạn có đang nghĩ đến việc hành động theo điều đó, có kế hoạch hoặc phương tiện làm hại bản thân, hay cảm thấy mình không thể giữ an toàn không? Nếu có nguy hiểm trước mắt, hãy gọi số cấp cứu hoặc đường dây hỗ trợ khủng hoảng tại nơi bạn ở ngay, đến gần người bạn tin tưởng và tránh xa những thứ có thể dùng để làm hại bản thân. Nếu chưa phải nguy hiểm tức thời, hôm nay bạn vẫn hãy liên hệ một người bạn tin tưởng và một chuyên gia sức khỏe tâm thần. Bạn không cần chịu đựng một mình.",
};

/**
 * S0 D-15: a stated caffeine intake, read as what the user said — never with an assumed pill strength. Reference points
 * are the FDA's: up to 400 mg/day for most healthy adults; ~1,200 mg taken rapidly can cause seizures.
 */
export type CaffeineIntake = {
  /** Pills / tablets named, or null when the amount is given only in mg. */
  pills: number | null;
  /** Strength of one pill, only when the user stated it. */
  perPillMg: number | null;
  /** Total stated mg; null when it cannot be known without assuming a strength. */
  totalMg: number | null;
  /** Several amounts spread over the day ("200 mg in the morning, 200 mg later"), not one exposure. */
  distributed: boolean;
  /** The user said it was one exposure ("all at once", "cùng lúc"). */
  atOnce: boolean;
  timing: "INGESTED" | "CONTEMPLATED" | "UNCLEAR";
  /** Symptoms reported in the same message (racing heart, chest pain, vomiting, …). */
  symptoms: boolean;
};
const CAFFEINE = String.raw`(?:caffeine|cafein|caffein|caphein|no-?doz|vivarin)`;
const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, mot: 1, hai: 2, ba: 3, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
const NUM = String.raw`\b(\d+|${Object.keys(COUNT_WORDS).join("|")})`;
const MG = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(?:mg|milligrams?)\b`;
const PILL = String.raw`(?:pills?|tablets?|tabs|capsules?|caps|vien)\b`;
// "2 x 600 mg" and "2 600 mg caffeine pills": a count, then the strength of each.
const COUNT_TIMES_STRENGTH = [new RegExp(String.raw`${NUM}\s*x\s*${MG}`), new RegExp(String.raw`${NUM}\s+${MG}\s*(?:of\s+)?(?:${CAFFEINE}\s*)?${PILL}`)];
const PILL_COUNT = new RegExp(String.raw`${NUM}\s*(?:${CAFFEINE}\s*)?${PILL}`);
const TOTAL_AFTER = /^\s*(?:in )?(?:total|altogether|all together|combined|tong(?: cong)?)\b/;
const SPREAD = /\b(?:then|later|afterwards?|again|another|morning|afternoon|evening|throughout|over the day|spread|buoi sang|buoi chieu|sau do)\b/;
// Codex S0 P2: one total said to be spread over the day ("600 mg over the whole day") is a daily total, not one exposure.
const OVER_THE_DAY = /\b(?:over (?:the (?:whole |entire |course of the )?|a )?day|throughout the day|all day(?: long)?|across the day|during the day|over several (?:doses|hours)|in (?:several|a few|multiple) doses|spread (?:out )?over|rai rac|(?:trong |suot )?ca ngay|chia (?:ra )?(?:nhieu|vai) lan)\b/;
// Only an exposure the user says was single is called "in one go"; no timing said, no timing invented.
const AT_ONCE = /\b(?:all at once|at once|in one go|in one dose|at the same time|together|cung luc|mot lan|mot hoi)\b/;
const INGESTED = /\b(?:took|taken|had|swallowed|downed|drank|consumed|ingested|already|da uong|vua uong|lo uong|uong roi|da dung|hom nay (?:toi|minh|em) uong)\b|\broi\s*[.!?]*$/;
const CONTEMPLATED = /\b(?:thinking|think about|want(?:s|ed)? to|going to|gonna|plan(?:ning)? to|should i|can i|could i|would|is it|is that|is this|ok|okay|fine|safe|if i|muon|dinh|duoc khong|co nen|co sao khong)\b/;
const CAFFEINE_SYMPTOMS = /\b(?:heart (?:is )?(?:racing|pounding|beating fast)|racing heart|palpitations?|chest (?:pain|tightness|hurts?)|shak(?:y|ing)|trembl\w*|vomit\w*|throwing up|threw up|nause\w*|dizz\w*|confus\w*|seizure|can'?t breathe|tim dap nhanh|hoi hop|dau nguc|tuc nguc|run ray|tay run|nguoi run|non mua|buon non|chong mat|lu lan|co giat|kho tho)\b/;
// ponytail: a short list; a follow-up naming another substance must not inherit "caffeine" from the previous message.
const OTHER_SUBSTANCE = /\b(?:ibuprofen|paracetamol|acetaminophen|aspirin|tylenol|advil|panadol|creatine|melatonin|vitamin|magnesium|zinc|iron|fish oil|omega|ashwagandha|beta[- ]alanine|citrulline|thuoc giam dau)\b/;
const amount = (token: string) => Number(token.replace(/[., ](?=\d{3}\b)/g, "")) || COUNT_WORDS[token] || 0;

/**
 * The caffeine intake a message states, or null when it states none. A message that names no substance ("I already took
 * 4 pills of 200 mg") is about caffeine only when the user's previous message was.
 */
export function parseCaffeineIntake(message: string, recentMessages: readonly string[] = []): CaffeineIntake | null {
  const text = normalizeSafetyText(message).replace(/×/g, " x ");
  const previous = recentMessages.length ? normalizeSafetyText(recentMessages[recentMessages.length - 1]) : "";
  if (!new RegExp(CAFFEINE).test(text) && !(new RegExp(CAFFEINE).test(previous) && !OTHER_SUBSTANCE.test(text))) return null;
  let pills: number | null = null;
  let perPillMg: number | null = null;
  let totalMg: number | null = null;
  let distributed = false;
  const counted = COUNT_TIMES_STRENGTH.map((re) => text.match(re)).find(Boolean);
  if (counted) {
    pills = amount(counted[1]);
    perPillMg = amount(counted[2]);
  } else {
    // "1 200 mg" is 1,200 mg once no count-and-strength reading applies.
    const spaced = text.replace(/\b(\d{1,2}) (\d{3})(?=\s*(?:mg|milligrams?)\b)/g, "$1$2");
    const doses = [...spaced.matchAll(new RegExp(MG, "g"))].map((m) => ({ mg: amount(m[1]), total: TOTAL_AFTER.test(spaced.slice((m.index ?? 0) + m[0].length)) }));
    const pillMatch = spaced.match(PILL_COUNT);
    if (pillMatch) {
      pills = amount(pillMatch[1]);
      // Several mg figures beside a pill count and none called the total: which one is the strength is not said.
      if (doses.some((dose) => dose.total)) totalMg = doses.find((dose) => dose.total)!.mg;
      else if (doses.length === 1) perPillMg = doses[0].mg;
    } else if (doses.length) {
      distributed = !AT_ONCE.test(spaced) && ((doses.length > 1 && SPREAD.test(spaced)) || (doses.length === 1 && OVER_THE_DAY.test(spaced)));
      totalMg = distributed ? doses.reduce((sum, dose) => sum + dose.mg, 0) : Math.max(...doses.map((dose) => dose.mg));
    } else return null;
  }
  // Codex S0 final P2: pills said to be spread over the day are read as such, for the copy only (see caffeineSeverity).
  if (pills !== null) distributed = !AT_ONCE.test(text) && OVER_THE_DAY.test(text);
  if (pills !== null && perPillMg !== null) totalMg = pills * perPillMg;
  return { pills, perPillMg, totalMg, distributed, atOnce: AT_ONCE.test(text), timing: INGESTED.test(text) ? "INGESTED" : CONTEMPLATED.test(text) ? "CONTEMPLATED" : "UNCLEAR", symptoms: CAFFEINE_SYMPTOMS.test(text) };
}

/** Total caffeine the message states, in mg, or null when it states none or the strength is unknown. */
export const statedCaffeineMg = (message: string, recentMessages: readonly string[] = []): number | null => parseCaffeineIntake(message, recentMessages)?.totalMg ?? null;

/**
 * DANGEROUS: one exposure ≥ 1,000 mg, or ≥ 5 pills of unknown strength. HIGH: above the 400 mg/day reference when it was
 * already taken, comes as pills, or brings symptoms; 3–4 pills of unknown strength. A bare figure only talked about
 * ("a real coach wouldn't be scared of 500 mg") stays with the model, which answers it with the caffeine knowledge.
 */
export function caffeineSeverity(intake: CaffeineIntake): "DANGEROUS" | "HIGH" | null {
  if (intake.totalMg === null) {
    if ((intake.pills ?? 0) >= 5) return "DANGEROUS";
    return (intake.pills ?? 0) >= 3 || (intake.symptoms && intake.timing === "INGESTED") ? "HIGH" : null;
  }
  // Pills keep their severity whatever the stated timing; only a spread mg total steps down.
  if (intake.totalMg >= 1000 && (!intake.distributed || intake.pills !== null)) return "DANGEROUS";
  // Asking whether to take more than the 400 mg/day reference ("is 999 mg okay?") gets the same deterministic answer as taking it.
  if (intake.totalMg > 400) return intake.timing !== "UNCLEAR" || intake.pills !== null || intake.symptoms ? "HIGH" : null;
  return intake.symptoms && intake.timing === "INGESTED" && intake.totalMg >= 200 ? "HIGH" : null;
}

/** Deterministic copy proportional to the stated dose, timing, symptoms and what is unknown. Never calls an amount safe. */
export function caffeineSafetyResponse(intake: CaffeineIntake, language: SupportedSafetyLanguage): string {
  const severity = caffeineSeverity(intake) ?? "HIGH";
  const vi = language === "vi";
  const fmt = (n: number) => n.toLocaleString(vi ? "vi-VN" : "en-US");
  const known = intake.totalMg !== null;
  const amt = !known
    ? (vi ? `${intake.pills} viên caffeine chưa rõ hàm lượng` : `${intake.pills} caffeine pills of unknown strength`)
    : intake.pills !== null && intake.perPillMg !== null
      ? (vi ? `${intake.pills} viên × ${fmt(intake.perPillMg)} mg (${fmt(intake.totalMg!)} mg)` : `${intake.pills} × ${fmt(intake.perPillMg)} mg (${fmt(intake.totalMg!)} mg)`)
      : `${fmt(intake.totalMg!)} mg`;
  const taken = intake.timing === "INGESTED";
  const callNow = vi ? "Hãy gọi cấp cứu hoặc trung tâm chống độc ngay và đừng ở một mình." : "Call your local emergency number or poison control now and don't stay alone.";
  // Codex S0 final P2: timing is named only as the user stated it; unstated, it is neither "at once" nor "over the day".
  const when = intake.atOnce ? (vi ? " cùng lúc" : " at once") : intake.distributed ? (vi ? " trong ngày" : " over the day") : "";
  const askTiming = intake.atOnce || intake.distributed ? "" : vi
    ? " Nếu được, cho mình biết mỗi viên bao nhiêu mg và bạn uống trong bao lâu — nhưng đừng chờ điều đó mới gọi giúp đỡ."
    : " If you can, tell me the mg per pill and over what time you took them — but don't wait on that to get help.";
  const lines: string[] = [];
  if (taken && intake.symptoms) {
    lines.push(vi ? `Các triệu chứng bạn kể sau ${amt} caffeine cần được xử lý ngay.` : `The symptoms you describe after ${amt} of caffeine need attention now.`);
    lines.push(severity === "DANGEROUS" ? callNow : vi
      ? "Nếu bạn đau ngực, tim đập rất nhanh hoặc loạn nhịp, run dữ dội, nôn, lú lẫn hay co giật, hãy gọi cấp cứu hoặc trung tâm chống độc ngay; nếu không, ngừng mọi caffeine, đừng tập và ở cạnh người khác cho đến khi đỡ."
      : "If you have chest pain, a very fast or irregular heartbeat, severe shaking, vomiting, confusion or a seizure, call your local emergency number or poison control now; otherwise stop all caffeine, don't train, and stay with someone until it settles.");
  } else if (severity === "DANGEROUS") {
    if (!known) {
      lines.push(taken
        ? (vi ? `Uống ${intake.pills} viên caffeine${when} có thể là liều nguy hiểm — không biết hàm lượng nên mình không thể nói bạn đã uống bao nhiêu. Hãy gọi cấp cứu hoặc trung tâm chống độc ngay, cầm theo vỏ hộp, và đừng ở một mình.${askTiming}` : `${intake.pills} caffeine pills${when} can be a dangerous dose — without their strength I can't say how much you took. Call your local emergency number or poison control now with the package in hand, and don't stay alone.${askTiming}`)
        : (vi ? `Bạn đừng uống nhiều như vậy. Mình không biết hàm lượng nên không thể nói con số, nhưng ${intake.pills} viên caffeine${when} rất dễ thành liều nguy hiểm.` : `Please don't take that many. I don't know their strength, so I can't put a number on it, but ${intake.pills} caffeine pills${when} can easily add up to a dangerous dose.`));
    } else {
      lines.push(taken
        ? (vi ? `${amt} caffeine${intake.atOnce ? " uống cùng lúc" : intake.distributed ? " trong ngày" : ""} là liều nguy hiểm. Hãy gọi cấp cứu hoặc trung tâm chống độc ngay, kể cả khi bạn vẫn thấy ổn — triệu chứng có thể tăng dần trong vài giờ tới — và đừng ở một mình.` : `${amt} of caffeine${intake.atOnce ? " taken at once" : intake.distributed ? " over the day" : ""} is a dangerous dose. Call your local emergency number or poison control now, even if you feel all right so far — symptoms can build over the next hours — and don't stay alone.`)
        : (vi ? `Bạn đừng uống lượng đó. ${amt} caffeine${when} là liều nguy hiểm: khoảng 1.200 mg uống nhanh có thể gây co giật và tim đập quá nhanh hoặc loạn nhịp.` : `Please don't take that. ${amt} of caffeine${when} is a dangerous dose: amounts around 1,200 mg taken quickly can cause seizures and a dangerously fast or irregular heartbeat.`));
    }
    if (intake.timing === "UNCLEAR") lines.push(vi ? `Nếu bạn đã uống rồi: ${callNow.charAt(0).toLowerCase()}${callNow.slice(1)}` : `If you have already taken it: ${callNow.charAt(0).toLowerCase()}${callNow.slice(1)}`);
  } else if (!known) {
    lines.push(vi
      ? `${intake.pills} viên caffeine có thể đã vượt mức 400 mg mỗi ngày mà hầu hết người trưởng thành khỏe mạnh được khuyên không nên vượt — hãy xem hàm lượng trên nhãn${taken ? " và không dùng thêm caffeine hôm nay." : " trước khi uống."}`
      : `${intake.pills} caffeine pills could already be more than the 400 mg a day most healthy adults are advised not to exceed — check the strength on the label${taken ? " and have no more caffeine today." : " before taking any."}`);
  } else {
    // Codex S0 P2: a whole-day total is never "in one go"; with no timing said, none is invented.
    const once = intake.distributed ? (vi ? " trong ngày" : " over the day") : intake.atOnce ? (vi ? " trong một lần" : " in one go") : "";
    lines.push(taken
      ? (vi ? `${amt} caffeine${once} là nhiều hơn mức 400 mg mỗi ngày mà hầu hết người trưởng thành khỏe mạnh được khuyên không nên vượt. Đừng dùng thêm caffeine hôm nay và ở gần người có thể giúp bạn nếu cần.` : `${amt} of caffeine${once} is more than the 400 mg a day most healthy adults are advised not to exceed. Have no more caffeine today and stay where someone can help you if you need it.`)
      : (vi ? `Mình khuyên bạn không nên: ${amt} caffeine${once} là nhiều hơn mức 400 mg mỗi ngày mà hầu hết người trưởng thành khỏe mạnh được khuyên không nên vượt.` : `I'd advise against that: ${amt} of caffeine${once} is more than the 400 mg a day most healthy adults are advised not to exceed.`));
  }
  if (!(taken && intake.symptoms)) {
    lines.push(vi
      ? "Nếu thấy đau ngực, tim đập nhanh hay loạn nhịp, run hoặc bồn chồn dữ dội, nôn, lú lẫn hay co giật, hãy gọi cấp cứu hoặc trung tâm chống độc ngay."
      : "If you notice chest pain, a racing or irregular heartbeat, severe shaking or agitation, vomiting, confusion or a seizure, call your local emergency number or poison control now.");
  }
  lines.push(taken
    ? (vi ? "Đừng tập khi đã uống lượng đó." : "Don't train on it.")
    : (vi ? "Nếu muốn có thêm năng lượng trước khi tập, một khẩu phần caffeine bình thường — hoặc không dùng — ít rủi ro hơn nhiều, và bác sĩ hoặc dược sĩ có thể cho bạn biết mức phù hợp với bạn." : "For a pre-workout boost, a normal single serving — or none — carries far less risk, and a doctor or pharmacist can tell you what is right for you."));
  return lines.join(" ");
}

/** The existing hard-block copy for a category, for callers that reach the same boundary by another route (ICH-1 supplement policy). */
const INSULIN_HYPO_LEAD: LocalizedCopy = {
  en: "After insulin, feeling faint, shaky, sweaty or confused can be dangerously low blood sugar. Take fast sugar now if you can swallow safely — juice, a regular soft drink, glucose tablets or sweets — and don't stay alone. Call emergency services now if you are confused, very drowsy, can't keep sugar down, or pass out.",
  vi: "Sau khi dùng insulin, cảm giác muốn ngất, run, vã mồ hôi hay lú lẫn có thể là hạ đường huyết nguy hiểm. Uống ngay đồ ngọt hấp thu nhanh nếu nuốt được an toàn — nước trái cây, nước ngọt có đường, viên glucose hoặc kẹo — và đừng ở một mình. Gọi cấp cứu ngay nếu lú lẫn, rất buồn ngủ, không nuốt được đồ ngọt hoặc ngất.",
};

export function hardBlockCopy(category: Exclude<SafetyCategory, "possible_injury" | "composed_training_risk">, language: SupportedSafetyLanguage): string {
  return HARD_BLOCK_RESPONSES[category][language];
}

/**
 * Strip Vietnamese (and other) combining marks so "đau ngực" and "dau nguc"
 * share one concept match path. Does not invent medical meaning — only
 * normalizes orthography before the same RULES patterns run.
 */
export function normalizeSafetyText(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    // Vietnamese "đ" / "Đ" are not decomposed by NFD — map explicitly.
    .replace(/đ/g, "d");
}

const TEMPORAL_BOUNDARY = /[.!?;,\n]|\b(?:but|however|yet|although|though|nhung|tuy nhien)\b/gi;
const NEGATION_SCOPE_BOUNDARY = /[.!?;,\n]|\b(?:but|however|yet|although|though|nhung|tuy nhien)\b|\b(?:and\s+)?(?:now|today|currently|suddenly|gio|bay gio|hien tai)\b/gi;

function lastBoundaryEnd(text: string, beforeIndex: number, boundary: RegExp): number {
  const prefix = text.slice(0, beforeIndex);
  const matcher = new RegExp(boundary.source, boundary.flags);
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(prefix)) !== null) {
    end = match.index + match[0].length;
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  return end;
}

function nextBoundaryStart(text: string, afterIndex: number): number {
  const suffix = text.slice(afterIndex);
  const matcher = new RegExp(TEMPORAL_BOUNDARY.source, TEMPORAL_BOUNDARY.flags);
  const match = matcher.exec(suffix);
  return match ? afterIndex + match.index : text.length;
}

function temporalRankAt(text: string, index: number, endIndex: number): 0 | 1 | 2 {
  const start = lastBoundaryEnd(text, index, TEMPORAL_BOUNDARY);
  const end = nextBoundaryStart(text, endIndex);
  const clause = text.slice(start, end);
  const nearby = text.slice(Math.max(0, index - 40), Math.min(text.length, endIndex + 140));
  // Explicit correction: "tê tay … nói nhầm / đó là tuần trước" → historical only.
  if (
    /(?:noi nham|said (?:it )?wrong|i misspoke|do la (?:tuan|thang) truoc|that was last (?:week|month)|(?:was|were) last (?:week|month))/i.test(nearby)
  ) {
    return 0;
  }
  if (/\b(?:now|today|currently|at present|hom nay|bay gio|gio|hien tai)\b/i.test(clause)) return 2;
  if (/\b(?:yesterday|earlier|before|previously|used to|hom qua|ngay hom qua|tuan truoc|thang truoc|last week|last month)\b/i.test(clause)) return 0;
  return 1;
}

function hasNearbyNegation(text: string, symptomIndex: number): boolean {
  const start = lastBoundaryEnd(text, symptomIndex, NEGATION_SCOPE_BOUNDARY);
  const prefix = text.slice(start, symptomIndex).slice(-80);
  // "chưa hết / không hết / chưa khỏi đau ngực" = it has NOT gone: the symptom is still present, never negated.
  if (/\b(?:chua|khong|ko)\s+(?:het|khoi|bot|giam|do|thuyen giam)\s*(?:han\s*)?$/.test(prefix)) return false;
  // Include list-style Vietnamese negation: "không đau ngực, không chóng mặt"
  // where a comma may sit between "không" and a later sibling symptom.
  return /(?:\b(?:no|not|without|never|deny|denies|denied|khong|ko|chang|chua|khoi|het(?!\s+(?:suc|nuoc|minh|cach|y|ca)\b))\b|\b(?:khong|ko)\s+(?:co|bi|cam|thay|bi\s+cam)\b|\b(?:do|does|did)\s+not\s+(?:currently\s+)?(?:have|feel|experience)\b|\b(?:don't|doesn't|didn't)\s+(?:currently\s+)?(?:have|feel|experience)\b)(?:[\s\p{L}',-]{0,48})$/iu.test(prefix);
}

function hasFollowingResolution(text: string, symptomEnd: number): boolean {
  const suffix = text.slice(symptomEnd, symptomEnd + 120);
  // Vietnamese resolution after the symptom: "đau ngực hết rồi / khỏi rồi / biến mất" (but never "hết sức" = very).
  if (/^\s*(?:da\s+)?(?:het(?!\s+(?:suc|nuoc|minh|cach|y|ca)\b)|khoi|bien mat)(?:\s+(?:roi|han|hoan toan|han roi))?\b/.test(suffix)) return true;
  return /^\s*(?:(?:is|are|was|were|has|have|had|went|feels?)\s+)?(?:now\s+|currently\s+)?(?:gone|resolved|absent|none|not present|no longer present|went away|khong con)\b/i.test(suffix)
    || /\b(?:nhung|but|however|yet)\b[^.!?;\n]{0,40}\b(?:gio|now|currently|hom nay)\b[^.!?;\n]{0,40}\b(?:het(?:\s+hoan\s+toan)?|gone|resolved|khong con)\b/i.test(suffix)
    || /\b(?:gio|now|currently)\b[^.!?;\n]{0,30}\b(?:het(?:\s+hoan\s+toan)?|completely gone|fully resolved)\b/i.test(suffix);
}

function inferredCurrentAbsence(text: string, afterIndex: number): SymptomMention | null {
  const suffix = text.slice(afterIndex, afterIndex + 160);
  // Vietnamese "now none": "hiện tại không đau." / "giờ hết đau rồi" — only when the pain word is not the start of a
  // DIFFERENT body part ("hiện tại không đau vai"), which would wrongly clear the symptom mentioned before it.
  const vi = suffix.match(
    /\b(?:hien tai|bay gio|hom nay|gio)\b[^.!?;\n]{0,30}?\b(?:khong\s+(?:con\s+)?dau(?:\s+nua)?|het\s+dau|khong\s+con(?:\s+nua)?|khoi\s+roi)(?=\s*(?:[.!?;,]|$|\s(?:va|nhung|roi|luon)\b))/,
  );
  if (vi && vi.index !== undefined) {
    return { index: afterIndex + vi.index, matchedPhrase: vi[0], present: false, temporalRank: 2 };
  }
  const match = suffix.match(
    /(?:\b(?:today|now|currently|at present)\b[^.!?;\n]{0,70}\b(?:gone|resolved|absent|none|no longer|khong con|(?:i\s+)?(?:do not|don't)(?:\s+(?:have|feel|experience)(?:\s+(?:it|that|this))?)?)\b|\b(?:none|no longer|khong con)\b[^.!?;\n]{0,30}\b(?:today|now|currently|at present)\b)/i,
  );
  if (!match || match.index === undefined) return null;
  return {
    index: afterIndex + match.index,
    matchedPhrase: match[0],
    present: false,
    temporalRank: 2,
  };
}

/**
 * Resolve each symptom concept independently so a local denial of one symptom
 * cannot suppress a different current red flag. Current/today/now statements
 * outrank historical ones; within the same time frame, the later statement wins.
 */
// S0 D-04: "What should I do if I ever get chest pain while lifting?" asks about a symptom they do not have. Persisted as a
// fresh episode it held the whole chat. A present cue in the same clause ("if my chest hurts now", "this chest pain") still counts.
const HYPOTHETICAL_LEAD = /(?<![a-z])(?:if|what if|in case|suppose|supposing|whenever|should (?:i|you|someone) ever|neu|gia su|lo nhu|phong khi|khi nao)(?![a-z])[^.!?;,\n]*$/;
const PRESENT_CUE = /(?<![a-z])(?:right now|now|currently|at the moment|today|still|again|this|these|keep|since|bay gio|hien tai|dang|luc nay|van|hom nay)(?![a-z])/;
export function hypotheticalAt(text: string, start: number, end: number): boolean {
  const clauseStart = Math.max(...[".", "!", "?", ";", "\n"].map((mark) => text.lastIndexOf(mark, start - 1))) + 1;
  const ends = [".", "!", "?", ";", "\n"].map((mark) => text.indexOf(mark, end)).filter((at) => at >= 0);
  const clause = text.slice(clauseStart, ends.length ? Math.min(...ends) : text.length);
  return HYPOTHETICAL_LEAD.test(text.slice(clauseStart, start)) && !PRESENT_CUE.test(clause);
}

function matchPresentSymptom(message: string, concepts: SymptomConcept[]): string | null {
  const text = normalizeSafetyText(message);

  for (const concept of concepts) {
    const mentions: SymptomMention[] = [];
    const seen = new Set<string>();

    for (const pattern of concept.patterns) {
      const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
      const matcher = new RegExp(pattern.source, flags);
      let match: RegExpExecArray | null;

      while ((match = matcher.exec(text)) !== null) {
        const endIndex = match.index + match[0].length;
        const key = `${match.index}:${endIndex}`;
        // A symptom phrase never legitimately spans a clause boundary. Reversed patterns such as "ngực.{0,24}đau"
        // otherwise pair a symptom in one clause with a pain word in the NEXT one ("đau ngực, hiện tại không đau"),
        // inheriting that clause's "now" and turning a historical/resolved report into a fresh emergency.
        // A bare comma alone ("đau, ngực trái") is still one symptom phrase; a comma that crosses into a clause with
        // its own time/negation cue ("… ngực, hiện tại không đau") is what must not be paired.
        const spansClause = /[.!?;\n]/.test(match[0])
          || (match[0].includes(",") && /\b(?:hien tai|bay gio|gio|hom nay|now|currently|today|khong|no|not|het|khoi|nhung|but|however)\b/.test(match[0]));
        if (!seen.has(key) && !spansClause) {
          seen.add(key);
          mentions.push({
            index: match.index,
            matchedPhrase: match[0],
            present:
              !/^\s*khong\s+te\b/i.test(match[0])
              && !hasNearbyNegation(text, match.index)
              && !hasFollowingResolution(text, endIndex)
              && !hypotheticalAt(text, match.index, endIndex),
            temporalRank: temporalRankAt(text, match.index, endIndex),
          });

          const absence = inferredCurrentAbsence(text, endIndex);
          if (absence) mentions.push(absence);
        }
        if (match[0].length === 0) matcher.lastIndex += 1;
      }
    }

    const resolved = mentions.sort((left, right) =>
      right.temporalRank - left.temporalRank || right.index - left.index,
    )[0];
    // Historical-only mentions (rank 0) must not become a current emergency by themselves.
    if (resolved?.present && resolved.temporalRank > 0) return resolved.matchedPhrase;
  }

  return null;
}

const CHEST_PAIN_SYMPTOMS: SymptomConcept[] = [
  {
    id: "chest_pain",
    patterns: [
      /\bchest pain\b/i,
      /\bpain in (?:my |the )?chest\b/i,
      /\bchest hurts?\b/i,
      /\bhurts? in (?:my |the )?chest\b/i,
      /\bmy chest (?:is |feels )?(?:hurt(?:ing)?|aching|tight)\b/i,
      /\btightness in (?:my |the )?chest\b/i,
      /đau ngực/i,
      /dau nguc/i,
      /đau ở ngực/i,
      /dau o nguc/i,
      /ngực.{0,24}đau/i,
      /nguc.{0,24}dau/i,
      /đau.{0,24}ngực/i,
      /dau.{0,24}nguc/i,
    ],
  },
  {
    id: "breathing_distress",
    patterns: [
      /\bcan'?t breathe\b/i,
      /\bshort(?:ness)? of breath\b/i,
      /khó thở/i,
      /kho tho/i,
      /không thở được/i,
      /khong tho duoc/i,
      /toi kho tho/i,
    ],
  },
  {
    id: "cardiac_rhythm",
    patterns: [/\bheart (?:is )?racing\b/i, /\birregular heartbeat\b/i],
  },
];

const FAINTING_DIZZINESS_SYMPTOMS: SymptomConcept[] = [
  {
    id: "fainting",
    patterns: [
      /\bfaint(?:ed|ing)?\b/i,
      /\bpassed out\b/i,
      /\bblack(?:ed)? out\b/i,
      /ngất xỉu/i,
      /ngat xiu/i,
      /(?<![\p{L}])ngất(?![\p{L}])/iu,
      /(?<![\p{L}])ngat(?![\p{L}])/iu,
      /bị ngất/i,
      /bi ngat/i,
    ],
  },
  {
    id: "dizziness",
    patterns: [
      /\bdizz(?:y|iness)\b/i,
      /\bsevere(?:ly)? dizzy\b/i,
      /\broom (?:is|was) spinning\b/i,
      /chóng mặt/i,
      /chong mat/i,
    ],
  },
];

const NEUROLOGICAL_SYMPTOMS: SymptomConcept[] = [
  {
    id: "numbness",
    patterns: [
      /\bnumb(?:ness)?\b/i,
      /\bcan'?t feel my (?:arm|leg|hand|foot)\b/i,
      /\bloss of (?:feeling|sensation)\b/i,
      /te bi/i,
      /te tay|te chan/i,
      // Current-absence form ("hiện tại không tê") — must be matchable so negation wins.
      /\bkhong\s+te\b/i,
    ],
  },
  {
    id: "tingling",
    patterns: [/\btingl(?:e|es|ed|ing)\b/i],
  },
  {
    id: "sudden_weakness",
    patterns: [
      /\bsudden weakness\b/i,
      /\bsuddenly (?:became|become|felt|feel|got|get) weak\b/i,
      /\bsuddenly lost (?:my )?strength\b/i,
      /yeu dot ngot/i,
    ],
  },
  {
    id: "slurred_speech",
    patterns: [/\bslurred speech\b/i],
  },
];

/**
 * Red-flag signs outside training (jaundice, rhabdomyolysis-type urine, bleeding). Not an emergency by themselves, but
 * never something to coach or supplement around — also the classic PED / hepatotoxic-supplement warning signs.
 */
const MEDICAL_RED_FLAG_SYMPTOMS: SymptomConcept[] = [
  {
    id: "jaundice",
    patterns: [
      /\byellow(?:ing|ish)? (?:eyes|skin|whites of (?:my )?eyes)\b/i,
      /\b(?:eyes|skin)\b[^.!?;,\n]{0,20}\b(?:turn(?:ed|ing)?|look(?:s|ing)?|are|is|went|gone|getting|got)\s+(?:a bit |kind of |slightly )?yellow\b/i,
      /\bjaundice\w*\b/i,
      /\bvang (?:da|mat)\b/i,
      /\b(?:mat|da) (?:bi )?vang\b/i,
    ],
  },
  {
    id: "dark_urine",
    patterns: [
      /\b(?:cola|tea|coffee)[- ](?:colou?red )?(?:urine|pee)\b/i,
      /\b(?:dark brown|brown|very dark) (?:urine|pee)\b/i,
      /\b(?:urine|pee) (?:is |was |looks |turned )?(?:dark brown|brown|cola)/i,
      /\bnuoc tieu (?:sam|nau|mau nau|den)\b/i,
    ],
  },
  {
    id: "bleeding",
    patterns: [
      /\bblood in (?:my )?(?:urine|pee|vomit|stool|poop)\b/i,
      /\b(?:vomit(?:ing|ed)?|throwing up|threw up|coughing up|coughed up) blood\b/i,
      /\b(?:tieu|non|ho) ra mau\b/i,
    ],
  },
];

const RED_FLAG_HEADACHE: SymptomConcept[] = [
  {
    id: "red_flag_headache",
    patterns: [
      /\bworst headache\b/i,
      /\b(?:sudden(?:ly)?|thunderclap|explosive)\b.{0,30}\bheadache\b/i,
      /\bheadache\b.{0,30}\b(?:came on (?:suddenly|out of nowhere)|out of nowhere|like a thunderclap)\b/i,
      /\bheadache\b.{0,60}\b(?:stiff neck|fever|confus\w*|vomit\w*|throwing up|blurr\w* vision|double vision|(?:lost|losing|changes? in) (?:my )?vision|slurr\w*|weakness|numb\w*|(?:hit|bumped|banged|knocked) (?:my )?head|head (?:injury|knock))\b/i,
      /\b(?:hit|bumped|banged|knocked) (?:my )?head\b.{0,60}\bheadache\b/i,
      /\b(?:stiff neck|fever)\b.{0,40}\bheadache\b/i,
      /dau dau (?:du doi|nhu bua bo|kinh khung|khung khiep|dot ngot)/i,
      /dau dau.{0,40}(?:cung co|sot cao|non oi|mo mat|nhin mo|lu lan|dap dau|va dau)/i,
    ],
  },
];

const RED_FLAG_HEADACHE_RESPONSE: LocalizedCopy = {
  en: "A headache that is sudden and severe, the worst you've had, or that comes with a stiff neck, fever, vomiting, confusion, vision changes, weakness or numbness — or after a knock to the head — needs medical assessment today, not training advice. Please don't train; get checked promptly, and use emergency care if it came on suddenly or is getting worse.",
  vi: "Đau đầu đột ngột và dữ dội, đau nhất từ trước đến giờ, hoặc kèm cứng cổ, sốt, nôn, lú lẫn, thay đổi thị lực, yếu hay tê — hoặc sau khi bị va đập vào đầu — cần được khám y tế ngay trong hôm nay, không phải lời khuyên tập luyện. Đừng tập hôm nay; hãy đi khám sớm, và đến cấp cứu nếu cơn đau xuất hiện đột ngột hoặc ngày càng nặng.",
};

const RULES: SafetyRule[] = [
  {
    category: "chest_pain_cardiac",
    responseMode: "HARD_BLOCK",
    patterns: [],
    matcher: (message) => matchPresentSymptom(message, CHEST_PAIN_SYMPTOMS),
    response: HARD_BLOCK_RESPONSES.chest_pain_cardiac,
  },
  {
    category: "fainting_dizziness",
    responseMode: "HARD_BLOCK",
    patterns: [],
    matcher: (message) => matchPresentSymptom(message, FAINTING_DIZZINESS_SYMPTOMS),
    response: HARD_BLOCK_RESPONSES.fainting_dizziness,
  },
  {
    category: "neurological_symptoms",
    responseMode: "HARD_BLOCK",
    patterns: [],
    matcher: (message) => matchPresentSymptom(message, NEUROLOGICAL_SYMPTOMS),
    response: HARD_BLOCK_RESPONSES.neurological_symptoms,
  },
  {
    // MF-S1: an ordinary headache stays with the model (proportional advice); these headache shapes are not trained through.
    category: "neurological_symptoms",
    responseMode: "HARD_BLOCK",
    patterns: [],
    matcher: (message) => matchPresentSymptom(message, RED_FLAG_HEADACHE),
    response: RED_FLAG_HEADACHE_RESPONSE,
  },
  {
    category: "medical_red_flag",
    responseMode: "HARD_BLOCK",
    patterns: [],
    matcher: (message) => matchPresentSymptom(message, MEDICAL_RED_FLAG_SYMPTOMS),
    response: HARD_BLOCK_RESPONSES.medical_red_flag,
  },
  {
    category: "severe_pain",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bsevere pain\b/i,
      /\bexcruciating\b/i,
      /\bheard? a pop\b/i,
      /\bfelt (a |it )?pop\b/i,
      // MF-F2: inability to bear weight is a prompt-assessment sign wherever it is — the foot and ankle included.
      /\b(?:can'?t|cannot|can not|unable to) (?:put (?:any |much )?weight on|bear weight on|stand on|walk on|move) (?:my |the )?(?:leg|arm|knee|shoulder|back|foot|feet|ankle|heel|toes?|it)\b/i,
      /\b(?:can'?t|cannot|can not|unable to) (?:bear|take|put) (?:any )?weight\b/i,
      /\b(?:bone (?:is )?sticking out|looks? deformed)\b/i,
      // Folded Vietnamese ("không đặt chân xuống được", "không dồn lực lên…", "không đứng lên được", "không đi lại được").
      /\bkhong (?:the )?(?:dat chan xuong|don (?:luc|trong luong|suc) len|dung len duoc|di lai duoc|chiu (?:duoc )?(?:luc|trong luong))\b/i,
      /\bsomething (snapped|tore)\b/i,
      /chấn thương cấp/i,
      /chan thuong cap/i,
      /chảy máu nghiêm trọng/i,
      /chay mau nghiem trong/i,
      /chảy máu nhiều/i,
      /chay mau nhieu/i,
      /chảy máu không cầm/i,
      /chay mau khong cam/i,
      /đau dữ dội/i,
      /dau du doi/i,
    ],
    response: HARD_BLOCK_RESPONSES.severe_pain,
  },
  {
    category: "possible_injury",
    responseMode: "SAFE_REDIRECT",
    patterns: [
      /\b(sharp|stabbing) pain\b/i,
      /\bjoint (is |feels )?unstable\b/i,
      /\bswelling (that|which)? (won'?t|does'?nt) go down\b/i,
      /đau nhói/i,
      /dau nhoi/i,
      /khớp không ổn định/i,
      /khop khong on dinh/i,
      /(?:painkiller|thuốc giảm đau|thuoc giam dau).{0,180}(?:heavy squat|squat nặng|squat nang|tập nặng|tap nang)/i,
      /(?:đầu gối|dau goi|knee).{0,60}(?:bị gì|bi gi|what(?:'s| is) wrong|diagnos)/i,
    ],
    response: null,
  },
  {
    category: "eating_disorder_indicator",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bpurg(e|ing) after (eating|meals)\b/i,
      /\bmaking myself throw up\b/i,
      /\bhaven'?t eaten in \d+ days?\b/i,
      /\bstarv(e|ing) myself\b/i,
      /\bafraid to eat\b/i,
      /\bbinge and purge\b/i,
    ],
    response: HARD_BLOCK_RESPONSES.eating_disorder_indicator,
  },
  {
    category: "dangerous_substance",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\b(clenbuterol|dnp|dinitrophenol)\b.*\b(dose|dosage|how much|cycle)\b/i,
      /\b(how much|what dose|dosage) (of |for )?(clenbuterol|dnp|anabolic steroids?|sarms?)\b/i,
      /\bstack (steroids|sarms|clen)\b/i,
    ],
    response: HARD_BLOCK_RESPONSES.dangerous_substance,
  },
  {
    // S0 D-15: "10 caffeine pills, 200 mg each" was answered by the model with a generic caution.
    category: "dangerous_substance",
    responseMode: "HARD_BLOCK",
    patterns: [],
    // Proportional: only DANGEROUS/HIGH stop here; the copy says what was stated, what is unknown, and what to do now.
    matcher: (message, recent) => {
      const intake = parseCaffeineIntake(message, recent);
      const severity = intake && caffeineSeverity(intake);
      return severity ? `caffeine ${intake!.totalMg ?? "unknown"} mg ${severity}` : null;
    },
    respond: (message, recent, language) => {
      const intake = parseCaffeineIntake(message, recent);
      return intake ? caffeineSafetyResponse(intake, language) : null;
    },
    response: null,
  },
  {
    category: "self_harm_crisis",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\b(?:i\s+)?want to die\b/i,
      /\b(?:i\s+)?want to kill myself\b/i,
      /\b(?:i\s+)?(?:am|'m) going to kill myself\b/i,
      /\b(?:i\s+)?plan(?:ning)? to (?:kill myself|end my life)\b/i,
      /\b(?:i\s+)?(?:am|'m) suicidal\b/i,
      /\b(?:end|take) my life\b/i,
      /tôi muốn chết/i,
      /toi muon chet/i,
      /tao muốn chết/i,
      /tao muon chet/i,
      /mình muốn chết/i,
      /minh muon chet/i,
      /muốn tự tử/i,
      /muon tu tu/i,
      /tự sát/i,
      /tu sat/i,
      /không muốn sống nữa/i,
      /khong muon song nua/i,
    ],
    response: HARD_BLOCK_RESPONSES.self_harm_crisis,
  },
  {
    // ICH-1 (hard-safety false negative): a stated urge or intent to self-harm. Intent wording is required, so an
    // accidental injury report ("I keep hurting myself on deadlifts") stays with the injury rules.
    category: "self_harm_crisis",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\b(?:feel like|want(?:ing)? to|wanna|going to|gonna|thinking (?:about|of)|thoughts? of|urges? to|tempted to)\s+(?:hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?|kill(?:ing)?)\s+myself\b/i,
      /\bself[- ]?harm(?:ing)?\b/i,
      /(?:muon|dinh|nghi (?:den|toi) (?:viec|chuyen))\s+(?:tu\s+)?(?:lam hai|lam dau|hai|giet)\s+(?:ban than|chinh minh|minh)/i,
      /tu (?:hai|lam hai|lam dau) (?:ban than|chinh minh)/i,
    ],
    response: SELF_HARM_INTENT_RESPONSE,
  },
  {
    category: "ambiguous_safety",
    responseMode: "HARD_BLOCK",
    patterns: [/^\s*i(?:'m| am) dying\s*[.!?]*$/i],
    response: HARD_BLOCK_RESPONSES.ambiguous_safety,
  },
];

function matchRule(message: string, recentMessages: readonly string[] = []): { rule: SafetyRule; matchedPhrase: string } | null {
  for (const rule of RULES) {
    if (rule.matcher) {
      const matchedPhrase = rule.matcher(message, recentMessages);
      if (matchedPhrase) return { rule, matchedPhrase };
      continue;
    }
    for (const pattern of rule.patterns) {
      for (const candidate of [message, normalizeSafetyText(message)]) {
        const match = candidate.match(pattern);
        if (match) return { rule, matchedPhrase: match[0] };
      }
    }
  }
  return null;
}

function detectSafetyLanguage(message: string, options: SafetyCheckOptions): SupportedSafetyLanguage {
  const decision = options.languageDecision ?? decideDanteLanguage({ currentMessage: message, recentMessages: options.recentMessages });
  return decision.language === "vi" ? "vi" : "en";
}

function buildPossibleInjuryTrace(allMessages: string): SafetyContextTrace {
  const text = normalizeSafetyText(allMessages);
  const observations: string[] = [];
  if (/(?:ngu|sleep).{0,50}(?:3(?:[.,]5)?|4)\s*(?:tieng|gio|hours?)|(?:3(?:[.,]5)?|4)\s*(?:tieng|gio|hours?).{0,50}(?:ngu|sleep)/i.test(text)) observations.push("severe_sleep_reduction");
  if (/hrv.{0,60}(?:baseline|binh thuong|normal)/i.test(text)) observations.push("low_hrv_relative_to_baseline");
  if (/(?:resting heart rate|rhr).{0,60}(?:cao hon|higher|baseline|\+\s*\d+)/i.test(text)) observations.push("elevated_rhr_relative_to_baseline");
  if (/(?:cut|calorie deficit|caloric deficit|tham hut).{0,30}(?:\d{3,4}\s*kcal)?/i.test(text)) observations.push("calorie_deficit");
  if (/(?:bo lo|missed|skip(?:ped)?).{0,30}(?:pre-?workout|bua|meal)/i.test(text)) observations.push("missed_preworkout_meal");
  if (/\d{2,4}\s*mg.{0,20}(?:caffeine|cafein)|(?:caffeine|cafein).{0,20}\d{2,4}\s*mg/i.test(text)) observations.push("caffeine_already_consumed");
  if (/(?:dau nhoi|sharp pain|stabbing pain).{0,100}(?:goi|knee|gan banh che|patellar)|(?:goi|knee|gan banh che|patellar).{0,100}(?:dau nhoi|sharp pain|stabbing pain)/i.test(text)) observations.push("acute_knee_pain");
  else observations.push("acute_load_related_pain");
  if (/(?:bu|compensat|make up).{0,50}(?:volume|buoi tap)|volume.{0,50}(?:bu|compensat|make up)/i.test(text)) observations.push("weekly_volume_compensation_pressure");
  if (/squat.{0,30}(?:\d{2,3}\s*kg|nang|heavy)|(?:heavy|nang).{0,20}squat/i.test(text)) observations.push("planned_heavy_loading");

  const recoverySignals = observations.filter((item) => [
    "severe_sleep_reduction", "low_hrv_relative_to_baseline", "elevated_rhr_relative_to_baseline",
    "calorie_deficit", "missed_preworkout_meal", "caffeine_already_consumed",
  ].includes(item));
  const conflicts: string[] = [];
  if (observations.includes("planned_heavy_loading")) conflicts.push("performance_goal_vs_safety");
  if (observations.includes("weekly_volume_compensation_pressure") && recoverySignals.length > 0) conflicts.push("weekly_volume_vs_recovery");
  if (/(?:toi da quyet dinh|i(?:'ve| have) decided|qua than trong|too cautious|hieu co the minh hon ai|understand my body better)/i.test(text)) conflicts.push("user_preference_vs_risk");
  return {
    risk: recoverySignals.length >= 2 ? "HIGH" : "ELEVATED",
    observations,
    conflicts,
    diagnosticUncertainty: "HIGH",
    acuteCurrentState: true,
    chronicTraitWriteAllowed: false,
  };
}

function factorLabels(language: SupportedSafetyLanguage, observations: string[]): string[] {
  const labels: Record<SupportedSafetyLanguage, Record<string, string>> = {
    vi: {
      severe_sleep_reduction: "thiếu ngủ nghiêm trọng trong nhiều đêm",
      low_hrv_relative_to_baseline: "HRV thấp rõ so với baseline",
      elevated_rhr_relative_to_baseline: "resting heart rate cao hơn baseline",
      calorie_deficit: "đang calorie deficit",
      missed_preworkout_meal: "bỏ lỡ bữa pre-workout",
      caffeine_already_consumed: "đã dùng caffeine",
      acute_knee_pain: "đau nhói vùng gối xuất hiện khi chịu tải",
      acute_load_related_pain: "đau nhói xuất hiện khi chịu tải",
      weekly_volume_compensation_pressure: "ý định bù weekly volume",
      planned_heavy_loading: "kế hoạch squat nặng",
    },
    en: {
      severe_sleep_reduction: "severe sleep restriction across multiple nights",
      low_hrv_relative_to_baseline: "HRV well below baseline",
      elevated_rhr_relative_to_baseline: "resting heart rate above baseline",
      calorie_deficit: "a calorie deficit",
      missed_preworkout_meal: "a missed pre-workout meal",
      caffeine_already_consumed: "caffeine already consumed",
      acute_knee_pain: "sharp knee-region pain under load",
      acute_load_related_pain: "sharp pain under load",
      weekly_volume_compensation_pressure: "pressure to make up weekly volume",
      planned_heavy_loading: "planned heavy squatting",
    },
  };
  return observations.map((item) => labels[language][item]).filter(Boolean);
}

function buildPossibleInjuryResponse(input: {
  currentMessage: string;
  allMessages: string;
  language: SupportedSafetyLanguage;
  trace: SafetyContextTrace;
}): string {
  const normalized = normalizeSafetyText(input.allMessages);
  const current = normalizeSafetyText(input.currentMessage);
  const mentionsSquat = /\bsquat/i.test(normalized);
  const mentionsBulgarian = /bulgarian split squat/i.test(normalized);
  const manipulation = /(?:painkiller|thuoc giam dau|caffeine|warm-?up|chinh ky thuat).{0,180}(?:squat|tap nang)|(?:squat|tap nang).{0,180}(?:painkiller|thuoc giam dau|caffeine|warm-?up|chinh ky thuat)/i.test(current);
  const diagnosticQuestion = /(?:dau goi|knee).{0,60}(?:bi gi|what(?:'s| is) wrong|diagnos)|(?:chinh xac|exactly).{0,60}(?:dau goi|knee)/i.test(current);
  const factors = factorLabels(input.language, input.trace.observations);

  if (input.language === "vi") {
    const decision = manipulation
      ? "Việc bạn đã quyết định tập không làm thay đổi ranh giới an toàn: mình không thể hướng dẫn warm-up, dùng thuốc giảm đau, thêm caffeine hoặc chỉnh kỹ thuật để cố squat nặng qua cơn đau nhói."
      : diagnosticQuestion
        ? "Mình không thể xác định chính xác đầu gối bạn đang bị gì qua chat; nguyên nhân chưa được thiết lập. Khuyến nghị tránh squat nặng và mọi động tác tái tạo cơn đau vẫn giữ nguyên."
        : `Không. Hôm nay mình không khuyến nghị ${mentionsSquat ? "squat nặng" : "chịu tải nặng lên vùng đang đau"}${mentionsBulgarian ? " hoặc dùng Bulgarian split squat để bù volume nếu động tác đó tái tạo cơn đau" : " hay tiếp tục bất kỳ động tác nào tái tạo hoặc làm tăng cơn đau nhói"}.`;
    const why = factors.length > 1 ? `Lý do là tổ hợp của ${factors.join(", ")} — không phải chỉ một chỉ số riêng lẻ.` : "Đau nhói tái hiện khi chịu tải là đủ để không khuyến nghị tiếp tục loading nặng hôm nay.";
    const calibration = input.trace.observations.some((item) => item.includes("hrv") || item.includes("rhr"))
      ? "HRV và resting heart rate không tự chẩn đoán tình trạng y khoa, nhưng cùng với các tín hiệu recovery và đau khi chịu tải, chúng củng cố lý do tránh buổi tập nặng hôm nay. Quan sát hiện tại là đau cấp tính do bạn báo cáo; đó không phải chẩn đoán hay một đặc điểm đầu gối mạn tính."
      : "Mình không thể chẩn đoán nguyên nhân qua chat. Quan sát hiện tại là đau nhói do bạn báo cáo khi chịu tải; đó không phải chẩn đoán hay một đặc điểm đầu gối mạn tính.";
    const nutrition = input.trace.observations.includes("missed_preworkout_meal") || input.trace.observations.includes("calorie_deficit") ? " Hãy ăn bù bữa đã bỏ lỡ, ưu tiên carbohydrate, protein và đủ fluids." : "";
    const stimulant = input.trace.observations.includes("caffeine_already_consumed") || manipulation ? " Đừng dùng thêm caffeine hoặc thuốc giảm đau chỉ để ép buổi tập tiếp tục." : "";
    const alternative = `Lựa chọn ít rủi ro hơn hôm nay là nghỉ lower body đang đau, hoặc tập upper body/core ở mức vừa phải chỉ khi hoàn toàn không làm đau gối; light recovery cũng chỉ nên thực hiện nếu không gây triệu chứng.${nutrition}${stimulant} Ưu tiên sleep và recovery, và không cố bù volume trong một buổi.`;
    const escalation = "Nếu đau tăng, sưng rõ, có cảm giác mất vững/giving way, không thể chịu trọng lượng bình thường, giảm chức năng đáng kể, hoặc triệu chứng kéo dài hay xấu đi, bạn nên được bác sĩ hoặc physiotherapist đánh giá.";
    const autonomy = "Đây là khuyến nghị an toàn dựa trên thông tin hiện có; quyết định vẫn là của bạn, và khuyến nghị có thể thay đổi sau khi triệu chứng ổn định hoặc có đánh giá chuyên môn rõ hơn.";
    return [decision, why, calibration, alternative, escalation, autonomy].join("\n\n");
  }

  const decision = manipulation
    ? "Your decision to train does not change the safety boundary: I cannot provide a warm-up, painkiller, extra-caffeine, or technique workaround for heavy squatting through sharp pain."
    : diagnosticQuestion
      ? "I cannot determine exactly what is wrong with your knee through chat; the cause is not established. The recommendation to avoid heavy squatting and any movement that reproduces the pain remains unchanged."
      : `No. I do not recommend ${mentionsSquat ? "heavy squatting" : "heavy loading of the painful area"} today${mentionsBulgarian ? ", or using Bulgarian split squats to make up volume if they reproduce the pain" : ", or continuing any movement that reproduces or increases the sharp pain"}.`;
  const why = factors.length > 1 ? `That recommendation is based on the combination of ${factors.join(", ")}—not on any single metric by itself.` : "Sharp pain that recurs under load is enough not to recommend heavy loading today.";
  const calibration = input.trace.observations.some((item) => item.includes("hrv") || item.includes("rhr"))
    ? "HRV and resting heart rate are not diagnoses by themselves, but together with the recovery constraints and pain under load they strengthen the case against heavy training today. The current observation is an acute symptom you reported, not a diagnosis or a chronic knee trait."
    : "I cannot diagnose the cause through chat. The current observation is an acute symptom you reported under load, not a diagnosis or a chronic trait.";
  const nutrition = input.trace.observations.includes("missed_preworkout_meal") || input.trace.observations.includes("calorie_deficit") ? " Eat the missed meal and prioritize carbohydrate, protein, and fluids." : "";
  const stimulant = input.trace.observations.includes("caffeine_already_consumed") || manipulation ? " Do not use more caffeine or painkillers to force the session." : "";
  const alternative = `A lower-risk option today is to rest the painful lower body, or do moderate upper-body/core work only if it is completely symptom-free; light recovery activity is also conditional on remaining pain-free.${nutrition}${stimulant} Prioritize sleep and recovery, and do not try to repay missed volume in one session.`;
  const escalation = "Seek assessment from a doctor or physiotherapist if pain worsens, obvious swelling appears, the knee gives way, normal weight-bearing is difficult, function drops significantly, or symptoms persist or worsen.";
  const autonomy = "This is the safest recommendation from the information available; the decision remains yours, and the recommendation can change when symptoms settle or qualified assessment adds better evidence.";
  return [decision, why, calibration, alternative, escalation, autonomy].join("\n\n");
}

function detectComposedTrainingRisk(message: string): { matchedPhrase: string; observations: string[] } | null {
  const text = normalizeSafetyText(message);
  const jointIrritation = /(?:shoulder|knee|elbow|hip|ankle|wrist|joint|vai|goi|khop|khuyu|co\s+tay).{0,45}(?:irritat|ache|sore|pain|hurts?|discomfort|dau|kich\s+ung)|(?:irritat|ache|sore|pain|hurts?|discomfort|dau|kich\s+ung).{0,45}(?:shoulder|knee|elbow|hip|ankle|wrist|joint|vai|goi|khop)/i.test(text);
  const poorRecovery = hasCurrentOrUnmarkedMatch(text, /\brecovery\s*(?:score\s*)?(?:is|was|at|=)?\s*(?:[0-4]\d|50)\b|\b(?:very low|poor|bad) recovery\b/i);
  const majorSleepLoss = hasCurrentOrUnmarkedMatch(text, /(?:slept|sleeping|sleep|ngu)\s*(?:only\s*)?(?:[0-4](?:[.,]\d+)?|4)\s*(?:hours?|h|gio|tieng)\b/i);
  const maxAttemptMentioned = /\b(?:pr|pb|personal record|one[- ]rep max|1\s*rm|max(?:imum)? attempt)\b|\b(?:max(?: out)?|record)\b.{0,24}\b(?:bench|squat|deadlift|lift)\b|(?:bench|squat|deadlift).{0,20}(?:1\s*rm|pr|max)|(?:1\s*rm|pr|max).{0,20}(?:bench|squat|duoc\s+khong)/i.test(text);
  const maxAttempt = maxAttemptMentioned && !/(?:\b(?:no|not|don't|do not|khong|ko|khong muon)\b)[^.!?;\n]{0,28}\b(?:pr|pb|1\s*rm|max(?:imum)?|record)\b/i.test(text);
  // Any reported joint pain paired with a max/1RM intention blocks the
  // max attempt; poor recovery or major sleep loss escalates the trace but
  // is not required to prevent pushing through pain for a test lift.
  if (!jointIrritation || !maxAttempt) return null;
  const observations = ["joint_irritation"];
  if (poorRecovery) observations.push("very_low_recovery");
  if (majorSleepLoss) observations.push("major_sleep_deprivation");
  observations.push("max_attempt_intent");
  return { matchedPhrase: "composed physical-risk signals", observations };
}

function hasCurrentOrUnmarkedMatch(text: string, pattern: RegExp): boolean {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(text)) !== null) {
    if (temporalRankAt(text, match.index, match.index + match[0].length) > 0) return true;
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  return false;
}

function buildComposedTrainingRiskResponse(
  language: SupportedSafetyLanguage,
  observations: string[],
): string {
  const hasLowRecovery = observations.includes("very_low_recovery");
  const hasMajorSleepLoss = observations.includes("major_sleep_deprivation");

  if (language === "vi") {
    const additionalRisks = [
      hasMajorSleepLoss ? "ngủ rất ít" : null,
      hasLowRecovery ? "recovery thấp" : null,
    ].filter((item): item is string => item !== null);
    const rationale = additionalRisks.length > 0
      ? `Khớp vai đang bị kích ứng, cùng với ${additionalRisks.join(" và ")}, làm tăng thêm rủi ro của một lần thử mức tạ tối đa.`
      : "Khớp vai đang bị kích ứng, và một lần thử 1RM là mức gắng sức tối đa; chỉ riêng tổ hợp hiện tại đó đã đủ để không thử max hôm nay.";

    return `Hôm nay đừng thử PR hoặc mức tạ tối đa. ${rationale} Mình không thể chẩn đoán nguyên nhân đau qua chat. Hãy giữ mục tiêu bench dài hạn, còn hôm nay nghỉ hoặc tập một buổi nhẹ hơn/nhóm cơ khác chỉ khi hoàn toàn không gây đau; tránh mọi động tác làm triệu chứng tăng. Nếu đau kéo dài, nặng lên, sưng, mất vững hoặc hạn chế vận động đáng kể, hãy đi khám hoặc gặp physiotherapist.`;
  }

  const additionalRisks = [
    hasMajorSleepLoss ? "major sleep loss" : null,
    hasLowRecovery ? "low recovery" : null,
  ].filter((item): item is string => item !== null);
  const rationale = additionalRisks.length > 0
    ? `The irritated shoulder, together with ${additionalRisks.join(" and ")}, adds risk to a max-effort attempt.`
    : "The shoulder is currently irritated, and a 1RM is a max-effort attempt; that current combination alone is enough not to max today.";

  return `Do not attempt the PR or a max-effort lift today. ${rationale} I cannot diagnose the cause of the shoulder symptom through chat. Keep the long-term strength goal; today choose rest or a lower-risk session around the irritated joint only if it is completely pain-free, and stop any movement that increases symptoms. Seek medical or physiotherapy assessment if the pain persists, worsens, swells, causes instability, or meaningfully limits movement.`;
}

function isContextualInjuryFollowUp(message: string, recentMessages: string[]): boolean {
  if (!recentMessages.some((item) => ["possible_injury", "severe_pain"].includes(matchRule(item)?.rule.category ?? ""))) return false;
  const current = normalizeSafetyText(message);
  return /(?:painkiller|thuoc giam dau|caffeine|warm-?up|chinh ky thuat).{0,180}(?:squat|tap nang)|(?:squat|tap nang).{0,180}(?:painkiller|thuoc giam dau|caffeine|warm-?up|chinh ky thuat)/i.test(current)
    || /(?:dau goi|knee).{0,60}(?:bi gi|what(?:'s| is) wrong|diagnos)|(?:chinh xac|exactly).{0,60}(?:dau goi|knee)/i.test(current);
}

export function checkSafety(message: string, options: SafetyCheckOptions = {}): SafetyCheckResult {
  const language = detectSafetyLanguage(message, options);

  // Explicit medical emergencies and self-harm always outrank training-risk
  // redirects so the existing safety gate cannot be weakened by composition.
  let matched = matchRule(message, options.recentMessages ?? []);
  if (matched?.rule.responseMode === "HARD_BLOCK") {
    return {
      triggered: true,
      category: matched.rule.category,
      matchedPhrase: matched.matchedPhrase,
      responseMode: "HARD_BLOCK",
      language,
      // H0 cluster B: faint / dizzy / confused after insulin is possible severe hypoglycaemia — first aid leads.
      responseOverride: (/\binsulin\b/i.test(normalizeSafetyText(message)) && (matched.rule.category === "fainting_dizziness" || matched.rule.category === "neurological_symptoms")
        ? `${INSULIN_HYPO_LEAD[language]}\n\n${matched.rule.response?.[language] ?? ""}`.trim()
        : null) ?? matched.rule.respond?.(message, options.recentMessages ?? [], language) ?? matched.rule.response?.[language] ?? null,
      contextTrace: {
        risk: "HIGH",
        observations: [matched.rule.category],
        conflicts: ["user_goal_vs_safety"],
        diagnosticUncertainty: "HIGH",
        acuteCurrentState: true,
        chronicTraitWriteAllowed: false,
      },
    };
  }

  const composedRisk = detectComposedTrainingRisk(message);
  if (composedRisk) {
    return {
      triggered: true,
      category: "composed_training_risk",
      matchedPhrase: composedRisk.matchedPhrase,
      responseMode: "SAFE_REDIRECT",
      language,
      responseOverride: buildComposedTrainingRiskResponse(language, composedRisk.observations),
      contextTrace: {
        risk: "HIGH",
        observations: composedRisk.observations,
        conflicts: ["performance_goal_vs_safety", "joint_irritation_vs_max_attempt"],
        diagnosticUncertainty: "HIGH",
        acuteCurrentState: true,
        chronicTraitWriteAllowed: false,
      },
    };
  }

  if (!matched && isContextualInjuryFollowUp(message, options.recentMessages ?? [])) {
    const possibleInjury = RULES.find((rule) => rule.category === "possible_injury");
    if (possibleInjury) matched = { rule: possibleInjury, matchedPhrase: "contextual injury follow-up" };
  }

  if (!matched) return { triggered: false, category: null, matchedPhrase: null, responseMode: null, language, responseOverride: null, contextTrace: null };

  const allMessages = [...(options.recentMessages ?? []), message].join("\n");
  const trace = buildPossibleInjuryTrace(allMessages);
  return {
    triggered: true,
    category: matched.rule.category,
    matchedPhrase: matched.matchedPhrase,
    responseMode: "SAFE_REDIRECT",
    language,
    responseOverride: buildPossibleInjuryResponse({ currentMessage: message, allMessages, language, trace }),
    contextTrace: trace,
  };
}
