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
  matcher?: (message: string) => string | null;
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
              && !hasFollowingResolution(text, endIndex),
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
    category: "severe_pain",
    responseMode: "HARD_BLOCK",
    patterns: [
      /\bsevere pain\b/i,
      /\bexcruciating\b/i,
      /\bheard? a pop\b/i,
      /\bfelt (a |it )?pop\b/i,
      /\bcan'?t (put weight on|walk on|move) (my |the )?(leg|arm|knee|shoulder|back)\b/i,
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
    category: "ambiguous_safety",
    responseMode: "HARD_BLOCK",
    patterns: [/^\s*i(?:'m| am) dying\s*[.!?]*$/i],
    response: HARD_BLOCK_RESPONSES.ambiguous_safety,
  },
];

function matchRule(message: string): { rule: SafetyRule; matchedPhrase: string } | null {
  for (const rule of RULES) {
    if (rule.matcher) {
      const matchedPhrase = rule.matcher(message);
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
  let matched = matchRule(message);
  if (matched?.rule.responseMode === "HARD_BLOCK") {
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
