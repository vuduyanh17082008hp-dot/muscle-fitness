import { decideDanteLanguage, type DanteLanguageDecision } from "@/lib/dante-language";

/** Deterministic safety gate. It never diagnoses or delegates safety policy to a provider. */
export type SafetyCategory =
  | "chest_pain_cardiac"
  | "fainting_dizziness"
  | "neurological_symptoms"
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
  response: LocalizedCopy | null;
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

/** Normalize orthography only; this does not infer a diagnosis. */
export function normalizeSafetyText(message: string): string {
  return message.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
}

const RULES: SafetyRule[] = [
  {
    category: "chest_pain_cardiac",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bchest pain\b/i, /\bpain in my chest\b/i, /\bchest hurts?\b/i,
      /\bhurts? in (my |the )?chest\b/i, /\bmy chest (is |feels )?(hurt(ing)?|aching|tight)\b/i,
      /\btightness in (my |the )?chest\b/i, /\bcan'?t breathe\b/i, /\bshort(ness)? of breath\b/i,
      /\bheart (is )?racing\b/i, /\birregular heartbeat\b/i, /đau ngực/i, /dau nguc/i,
      /đau ở ngực/i, /dau o nguc/i, /khó thở/i, /kho tho/i, /không thở được/i, /khong tho duoc/i,
    ],
    response: HARD_BLOCK_RESPONSES.chest_pain_cardiac,
  },
  {
    category: "fainting_dizziness",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bfaint(ed|ing)?\b/i, /\bpassed out\b/i, /\bblack(ed)? out\b/i, /\bsevere(ly)? dizzy\b/i,
      /\broom (is|was) spinning\b/i, /ngất xỉu/i, /ngat xiu/i, /(?<![\p{L}])ngất(?![\p{L}])/iu,
      /(?<![\p{L}])ngat(?![\p{L}])/iu, /bị ngất/i, /bi ngat/i, /chóng mặt nghiêm trọng/i,
      /chong mat nghiem trong/i, /chóng mặt nặng/i, /chong mat nang/i, /chóng mặt dữ/i, /chong mat du/i,
    ],
    response: HARD_BLOCK_RESPONSES.fainting_dizziness,
  },
  {
    category: "neurological_symptoms",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bnumbness\b/i, /\btingling down (my )?(arm|leg)\b/i, /\bcan'?t feel my (arm|leg|hand|foot)\b/i,
      /\bloss of (feeling|sensation)\b/i, /\bsudden weakness\b/i, /\bslurred speech\b/i,
      /tê bì/i, /te bi/i, /tê tay|tê chân/i, /te tay|te chan/i, /yếu đột ngột/i, /yeu dot ngot/i,
    ],
    response: HARD_BLOCK_RESPONSES.neurological_symptoms,
  },
  {
    category: "severe_pain",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bsevere pain\b/i, /\bexcruciating\b/i, /\bheard? a pop\b/i, /\bfelt (a |it )?pop\b/i,
      /\bcan'?t (put weight on|walk on|move) (my |the )?(leg|arm|knee|shoulder|back)\b/i,
      /\bsomething (snapped|tore)\b/i, /chấn thương cấp/i, /chan thuong cap/i,
      /chảy máu nghiêm trọng/i, /chay mau nghiem trong/i, /chảy máu nhiều/i, /chay mau nhieu/i,
      /chảy máu không cầm/i, /chay mau khong cam/i, /đau dữ dội/i, /dau du doi/i,
    ],
    response: HARD_BLOCK_RESPONSES.severe_pain,
  },
  {
    category: "possible_injury",
    responseMode: "SAFE_REDIRECT",
    patterns: [
      /\b(sharp|stabbing) pain\b/i, /\bjoint (is |feels )?unstable\b/i,
      /\bswelling (that|which)? (won'?t|does'?nt) go down\b/i, /đau nhói/i, /dau nhoi/i,
      /khớp không ổn định/i, /khop khong on dinh/i,
      /(?:painkiller|thuốc giảm đau|thuoc giam dau).{0,180}(?:heavy squat|squat nặng|squat nang|tập nặng|tap nang)/i,
      /(?:đầu gối|dau goi|knee).{0,60}(?:bị gì|bi gi|what(?:'s| is) wrong|diagnos)/i,
    ],
    response: null,
  },
  {
    category: "eating_disorder_indicator",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bpurg(e|ing) after (eating|meals)\b/i, /\bmaking myself throw up\b/i,
      /\bhaven'?t eaten in \d+ days?\b/i, /\bstarv(e|ing) myself\b/i, /\bafraid to eat\b/i,
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
    category: "ambiguous_safety",
    responseMode: "HARD_BLOCK",
    patterns: [/^\s*i(?:'m| am) dying\s*[.!?]*$/i],
    response: HARD_BLOCK_RESPONSES.ambiguous_safety,
  },
];

function matchRule(message: string): { rule: SafetyRule; matchedPhrase: string } | null {
  for (const rule of RULES) {
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
  const jointIrritation = /(?:shoulder|knee|elbow|hip|ankle|wrist|joint).{0,45}(?:irritat|ache|sore|pain|hurts?|discomfort)|(?:irritat|ache|sore|pain|hurts?|discomfort).{0,45}(?:shoulder|knee|elbow|hip|ankle|wrist|joint)/i.test(text);
  const poorRecovery = /\brecovery\s*(?:score\s*)?(?:is|at|=)?\s*(?:[0-4]\d|50)\b|\b(?:very low|poor|bad) recovery\b/i.test(text);
  const majorSleepLoss = /(?:slept|sleeping|sleep)\s*(?:only\s*)?(?:[0-4](?:[.,]\d+)?|4)\s*(?:hours?|h|gio|tieng)\b/i.test(text);
  const maxAttempt = /\b(?:pr|pb|personal record|one[- ]rep max|1\s*rm|max(?:imum)? attempt)\b|\b(?:max(?: out)?|record)\b.{0,24}\b(?:bench|squat|deadlift|lift)\b/i.test(text);
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

function buildComposedTrainingRiskResponse(language: SupportedSafetyLanguage): string {
  if (language === "vi") {
    return "Hôm nay đừng thử PR hoặc mức tạ tối đa. Bạn đang có nhiều tín hiệu cùng hướng: ngủ rất ít, recovery thấp và khớp vai bị kích ứng. Mình không thể chẩn đoán nguyên nhân đau qua chat, nhưng sự kết hợp này không phù hợp để cố max bench. Hãy giữ mục tiêu bench dài hạn, còn hôm nay nghỉ hoặc tập một buổi nhẹ hơn/nhóm cơ khác chỉ khi hoàn toàn không gây đau; tránh mọi động tác làm triệu chứng tăng. Nếu đau kéo dài, nặng lên, sưng, mất vững hoặc hạn chế vận động đáng kể, hãy đi khám hoặc gặp physiotherapist.";
  }
  return "Do not attempt the PR or a max-effort lift today. You have several signals pointing the same way: major sleep loss, low recovery, and an irritated shoulder. I cannot diagnose the cause of the shoulder symptom through chat, but that combination is not a good day to force a max attempt. Keep the long-term strength goal; today choose rest or a lower-risk session around the irritated joint only if it is completely pain-free, and stop any movement that increases symptoms. Seek medical or physiotherapy assessment if the pain persists, worsens, swells, causes instability, or meaningfully limits movement.";
}

function isContextualInjuryFollowUp(message: string, recentMessages: string[]): boolean {
  if (!recentMessages.some((item) => ["possible_injury", "severe_pain"].includes(matchRule(item)?.rule.category ?? ""))) return false;
  const current = normalizeSafetyText(message);
  return /(?:painkiller|thuoc giam dau|caffeine|warm-?up|chinh ky thuat).{0,180}(?:squat|tap nang)|(?:squat|tap nang).{0,180}(?:painkiller|thuoc giam dau|caffeine|warm-?up|chinh ky thuat)/i.test(current)
    || /(?:dau goi|knee).{0,60}(?:bi gi|what(?:'s| is) wrong|diagnos)|(?:chinh xac|exactly).{0,60}(?:dau goi|knee)/i.test(current);
}

export function checkSafety(message: string, options: SafetyCheckOptions = {}): SafetyCheckResult {
  const language = detectSafetyLanguage(message, options);
  const composedRisk = detectComposedTrainingRisk(message);
  if (composedRisk) {
    return {
      triggered: true,
      category: "composed_training_risk",
      matchedPhrase: composedRisk.matchedPhrase,
      responseMode: "SAFE_REDIRECT",
      language,
      responseOverride: buildComposedTrainingRiskResponse(language),
      contextTrace: {
        risk: "HIGH",
        observations: composedRisk.observations,
        conflicts: ["performance_goal_vs_safety", "joint_irritation_vs_recovery"],
        diagnosticUncertainty: "HIGH",
        acuteCurrentState: true,
        chronicTraitWriteAllowed: false,
      },
    };
  }
  let matched = matchRule(message);
  if (!matched && isContextualInjuryFollowUp(message, options.recentMessages ?? [])) {
    const possibleInjury = RULES.find((rule) => rule.category === "possible_injury");
    if (possibleInjury) matched = { rule: possibleInjury, matchedPhrase: "contextual injury follow-up" };
  }

  if (!matched) return { triggered: false, category: null, matchedPhrase: null, responseMode: null, language, responseOverride: null, contextTrace: null };
  if (matched.rule.responseMode === "HARD_BLOCK") {
    return {
      triggered: true,
      category: matched.rule.category,
      matchedPhrase: matched.matchedPhrase,
      responseMode: "HARD_BLOCK",
      language,
      responseOverride: matched.rule.response?.[language] ?? null,
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
