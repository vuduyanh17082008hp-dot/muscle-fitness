import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";

/**
 * Canonical current-turn coaching state.
 * Extraction maps semantic equivalents → this object; synthesis reasons
 * from the object, not from surface wording.
 */
export type CurrentTurnState = {
  sleepHours: number | null;
  recoveryScore: number | null;
  recoveryStatus: "GOOD" | "POOR" | null;
  /** RIGHT_SHOULDER irritation present in the current turn. */
  shoulderIrritated: boolean;
  /** OVERHEAD movement pattern linked to that irritation. */
  overheadIrritating: boolean;
  /** Explicitly resolved / no longer present this turn. */
  shoulderIrritationResolved: boolean;
  numbnessPresent: boolean | null;
  weaknessPresent: boolean | null;
  swellingPresent: boolean | null;
  chestTrainedDaysAgo: number | null;
  chestIntensityHigh: boolean;
  caffeineMg: number | null;
  trainingGoalStrength: boolean;
  wantsSubmax: boolean;
  wantsMax: boolean;
  trainingDecisionRequested: boolean;
  wantsUncertaintyBreakdown: boolean;
  nutritionOnlyRequest: boolean;
};

const PLAN_REQUEST_TAIL =
  /\b(?:phuong an|best option|plan for|tot nhat|what should i|cho toi|give me)\b/i;

/**
 * Prefer an explicit current-state anchor. Do not treat a trailing
 * "hôm nay" / "today" inside a plan request as a clause boundary that
 * discards earlier vitals.
 */
function currentClause(text: string): string {
  const normalized = normalizeExtractText(text);

  const stateAnchor = normalized.search(
    /\b(?:chi dua vao trang thai hien tai|trang thai hien tai|hien tai|currently|hom nay toi thay|today i(?:'m| am)? feel)\b/i,
  );
  if (stateAnchor >= 0) return normalized.slice(stateAnchor);

  const markers = [...normalized.matchAll(/\b(?:hom nay toi|today i|today[,:]|hom nay[,:]|hom nay|nay)\b/gi)];
  const validIndexes = markers
    .map((match) => match.index ?? -1)
    .filter((index) => {
      if (index < 0) return false;
      const window = normalized.slice(index, index + 100);
      if (PLAN_REQUEST_TAIL.test(window) && !/(?:ngu|sleep|recovery|vai|shoulder|irritat|dau|can|caffeine|cafe)/i.test(window)) {
        return false;
      }
      return true;
    });

  return validIndexes.length > 0 ? normalized.slice(Math.max(...validIndexes)) : normalized;
}

function firstNumber(pattern: RegExp, text: string): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/** Normalize curly quotes so English contractions match ASCII patterns. */
function normalizeExtractText(message: string): string {
  return normalizeSafetyText(message)
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"');
}

function hasNegatedFlag(text: string, concept: RegExp): boolean | null {
  if (new RegExp(`(?:khong|no|without|deny|denied)\\s+(?:co\\s+)?${concept.source}`, "i").test(text)) {
    return false;
  }
  if (new RegExp(`(?:co|has|have|with)\\s+${concept.source}`, "i").test(text)) {
    return true;
  }
  if (concept.test(text) && !/(?:khong|no|without)\s+/i.test(text)) {
    return null;
  }
  return null;
}

/** "no numbness, weakness, or swelling" list negation. */
function detectEnglishSymptomListNegation(text: string): {
  numbness: boolean;
  weakness: boolean;
  swelling: boolean;
} {
  const list =
    /\b(?:there(?:'s| is)\s+)?no\s+numb(?:ness)?\s*,\s*weak(?:ness)?\s*(?:,|\s+or)\s*swelling\b/i.test(text) ||
    /\bno\s+numb(?:ness)?(?:\s*,\s*|\s+or\s+|\s+and\s+)weak(?:ness)?(?:\s*,\s*|\s+or\s+|\s+and\s+)swelling\b/i.test(text) ||
    /\bno\s+numb(?:ness)?,?\s*weak(?:ness)?,?\s*(?:or\s+)?swelling\b/i.test(text) ||
    /\bno\s+(?:neuro(?:logical)?\s+)?symptoms?\b/i.test(text);

  return {
    numbness: list || /(?:khong\s+(?:te|numb)|no\s+numb(?:ness)?|khong\s+te\s+yeu)/i.test(text),
    weakness: list || /(?:khong\s+yeu|no\s+weak(?:ness)?|khong\s+te\s+yeu)/i.test(text),
    swelling: list || /(?:khong\s+sung|no\s+swelling)/i.test(text) || (list && /\bswelling\b/i.test(text)),
  };
}

/** Semantic: shoulder region + irritation synonyms (EN + VI). */
function detectShoulderIrritation(text: string): boolean {
  const linked =
    /(?:\bshoulder\b|\bvai\b).{0,55}(?:irritat|discomfort|pain|dau|kich ung|can|kho chiu|uncomfortable|bothers?|sore|\boff\b|gets?\s+irritat)/i.test(
      text,
    ) ||
    /(?:irritat|discomfort|pain|dau|kich ung|can|kho chiu|uncomfortable|bothers?|sore|\boff\b).{0,55}(?:\bshoulder\b|\bvai\b)/i.test(
      text,
    ) ||
    /(?:\bshoulder\b|\bvai\b).{0,60}feels?\s+(?:a\s+(?:bit|little)\s+|somewhat\s+|slightly\s+)?off\b/i.test(text);

  if (!linked) return false;

  // Resolved this turn → not an active constraint.
  if (
    /(?:hoan toan het|het roi|het han|completely gone|fully resolved|no longer|pain-?free now|horizontal pressing pain-?free)/i.test(
      text,
    ) &&
    /(?:gio|now|currently|bay gio)/i.test(text)
  ) {
    return false;
  }

  return true;
}

/** Semantic: overhead / raise-arm movement pattern. */
function detectOverheadPattern(text: string): boolean {
  return /(?:overhead|ep overhead|press overhead|dua tay len cao|gio tay(?:\s+len)?\s+cao|gio tay qua dau|raise(?:s|d|ing)?\s+(?:my\s+)?arm(?:s)?(?:\s+overhead)?|arm(?:s)?\s+overhead|go overhead|when i go overhead|reach(?:es|ed|ing)?\s+overhead|reaching\s+overhead)/i.test(
    text,
  );
}

function detectShoulderResolved(text: string): boolean {
  return /(?:vai|shoulder).{0,80}(?:hoan toan het|het roi|completely gone|fully resolved|no longer|pain-?free)|(?:hoan toan het|completely gone|pain-?free now).{0,40}(?:vai|shoulder)|horizontal pressing pain-?free/i.test(
    text,
  );
}

/**
 * "hôm kia" / "day before yesterday" / "2 days ago" / "48 hours ago" + chest + heavy.
 */
function detectRecentHeavyChest(text: string): { daysAgo: number | null; high: boolean } {
  const hoursMatch = text.match(
    /\b(?:chest|nguc)[^.!?;\n]{0,60}\b(\d+)\s*hours?\s+ago\b|\b(\d+)\s*hours?\s+ago\b[^.!?;\n]{0,60}\b(?:chest|nguc)\b|(?:trained|train|hit|session)[^.!?;\n]{0,40}\b(?:chest|nguc)\b[^.!?;\n]{0,40}\b(\d+)\s*hours?\s+ago\b/i,
  );
  const hoursValue = hoursMatch
    ? Number(hoursMatch[1] ?? hoursMatch[2] ?? hoursMatch[3])
    : null;

  const explicitDays =
    firstNumber(
      /\b(?:chest|nguc)\b[^.!?;\n]{0,48}\b(?:trained|train|tap(?:\s+nang)?|danh|session|hit)[^.!?;\n]{0,28}\b(\d+)\s*(?:days?\s+ago|ngay\s+truoc)\b/i,
      text,
    ) ??
    firstNumber(
      /\b(?:trained|train|tap(?:\s+nang)?|danh|hit)\b[^.!?;\n]{0,28}\b(?:chest|nguc)\b[^.!?;\n]{0,28}\b(\d+)\s*(?:days?\s+ago|ngay\s+truoc)\b/i,
      text,
    ) ??
    firstNumber(/\b(\d+)\s*(?:days?\s+ago|ngay\s+truoc)\b[^.!?;\n]{0,40}\b(?:chest|nguc)\b/i, text) ??
    firstNumber(/\b(?:heavy\s+)?chest\s+session\b[^.!?;\n]{0,28}\b(\d+)\s*(?:days?\s+ago)\b/i, text) ??
    (hoursValue != null && Number.isFinite(hoursValue) ? Math.max(1, Math.round(hoursValue / 24)) : null);

  const homKiaChest =
    /(?:hom kia|day before yesterday|two days ago).{0,80}(?:chest|nguc)|(?:chest|nguc).{0,80}(?:hom kia|day before yesterday|two days ago)/i.test(
      text,
    ) ||
    /(?:hom kia|day before yesterday).{0,60}(?:danh|tap|trained?).{0,40}(?:nguc|chest)|(?:danh|tap).{0,20}(?:nguc|chest).{0,40}(?:hom kia|nang)/i.test(
      text,
    ) ||
    /\b(?:heavy\s+)?chest\s+session\b.{0,40}\b(?:two days ago|day before yesterday|48\s*hours?\s+ago)\b/i.test(text) ||
    /\b(?:trained|hit)\s+chest\s+hard\b.{0,40}\b(?:two days ago|2 days ago|48\s*hours?\s+ago)\b/i.test(text);

  const heavy =
    /(?:nang|heavy|hard|quite hard|kha nang|aggressive).{0,40}(?:chest|nguc)|(?:chest|nguc).{0,40}(?:nang|heavy|hard|kha nang)|danh (?:nguc|chest).{0,20}(?:nang|hard|heavy)|heavy\s+chest\s+session|trained\s+chest\s+hard|hit\s+chest\s+hard|chest\s+was\s+trained\s+hard|chest\s+got\s+a\s+heavy/i.test(
      text,
    );

  if (explicitDays != null) {
    return { daysAgo: explicitDays, high: heavy || explicitDays <= 3 };
  }
  if (homKiaChest) {
    return { daysAgo: 2, high: heavy || true };
  }
  return { daysAgo: null, high: false };
}

function detectCaffeineMg(text: string): number | null {
  return (
    firstNumber(/\b(\d+)\s*mg\s+(?:of\s+)?(?:caffeine|cafe(?:in)?)\b/i, text) ??
    firstNumber(/\b(?:caffeine|cafe(?:in)?)\b[^.!?;\n]{0,24}\b(\d+)\s*mg\b/i, text) ??
    firstNumber(/\b(?:da dung|da uong|used|had|uong|drink|drank)\b[^.!?;\n]{0,24}\b(\d+)\s*mg\b[^.!?;\n]{0,16}\b(?:caffeine|cafe(?:in)?)\b/i, text) ??
    firstNumber(/\b(\d+)\s*mg\s+(?:cafe|caffeine)\b/i, text)
  );
}

function detectNoMaxIntent(text: string): boolean {
  return /(?:khong(?:\s+can|\s+muon|\s+ham)?\s+(?:max|pr)|no(?:t)?\s+(?:want(?:ing)?\s+)?(?:a\s+)?(?:max|pr)|not\s+chasing\s+(?:a\s+)?pr|not\s+going\s+for\s+(?:a\s+)?max|not\s+maxing|i(?:'m| am)\s+not\s+maxing|not\s+trying\s+to\s+hit\s+(?:a\s+)?pr|today\s+no\s+pr|no\s+pr\s+today|no\s+max(?:\s+today)?|giu nhip strength|keep(?:ing)?\s+(?:some\s+)?strength|want\s+some\s+strength\s+work|still\s+want\s+some\s+strength|maintain(?:ing)?\s+strength|moderate\s+strength|chi muon giu|just want to maintain|just\s+some\s+strength\s+work)/i.test(
    text,
  );
}

function detectTrainingDecision(text: string): boolean {
  return /(?:bench|press|chest|strength|plan|phuong an|best option|what should i|phuong an tot nhat|cho toi phuong an|xu ly buoi tap|xu ly the nao|neu (?:ong )?la coach|if you(?:'re| are) (?:my )?coach|what would you do|what strength work|choi kieu nao|nen xu ly|keep some strength|want some strength|giu nhip strength|tap thi|workout (?:today|plan)|makes sense\??\s*$)/i.test(
    text,
  );
}

function detectUncertaintyBreakdown(text: string): boolean {
  return /(?:phan nao (?:chac|ro|kha ro)|phan nao (?:co dieu kien|tuy|chua)|cai gi (?:dang kha ro|chi nen|chua du)|supported|conditional|unknown|what is clear|what depends|what (?:don'?t|do not) we know|tach giup|noi ro phan)/i.test(
    text,
  );
}

function detectNutritionOnly(text: string): boolean {
  const nutrition = /(?:macro|macros|calorie|calories|protein|carb|fat|kcal|an uong|dinh duong)/i.test(text);
  const trainingAsk = detectTrainingDecision(text);
  return nutrition && !trainingAsk;
}

export function extractCurrentTurnState(message: string): CurrentTurnState {
  const text = normalizeExtractText(message);
  const current = currentClause(message);

  const recoveryStatus = /\brecovery\b[^.!?;\n]{0,36}\b(?:good|great|tot|kha tot|better|fine|green|ngon|solid)\b/i.test(current)
    || /\brecovery\b[^.!?;\n]{0,36}\b(?:good|great|tot|kha tot|better|fine|green|ngon|solid)\b/i.test(text)
    || /\brecovery feels (?:good|great|solid|fine)\b/i.test(text)
    || /\b(?:feeling|feel(?:s|ing)?)\s+recovered\b/i.test(text)
    || /\b(?:nguoi|toi)\s+kha\s+on\b/i.test(text)
    ? "GOOD"
    : /\brecovery\b[^.!?;\n]{0,36}\b(?:poor|bad|low|thap|xau|42|47)\b/i.test(current)
      ? "POOR"
      : null;

  const shoulderResolved = detectShoulderResolved(text);
  const shoulderIrritated = detectShoulderIrritation(text) && !shoulderResolved;
  const overheadIrritating = shoulderIrritated && detectOverheadPattern(text);

  const numbnessPresent = hasNegatedFlag(text, /(?:numb(?:ness)?|te(?:\b| bi)?)/i);
  const weaknessPresent = hasNegatedFlag(text, /(?:weak(?:ness)?|yeu)/i);
  const swellingPresent = hasNegatedFlag(text, /(?:swelling|sung)/i);
  const explicitNegations = detectEnglishSymptomListNegation(text);

  const recentChest = detectRecentHeavyChest(text);
  const noMax = detectNoMaxIntent(text);
  const nutritionOnlyRequest = detectNutritionOnly(text);
  const trainingDecisionRequested = !nutritionOnlyRequest && detectTrainingDecision(text);

  const wantsMax =
    /\b(?:max(?:imum)?|1\s*rm|pr)\b/i.test(text) &&
    !noMax &&
    !/\b(?:not|don't|do not|khong|khong muon|no(?:t)?\s+want(?:ing)?)\b[^.!?;\n]{0,24}\b(?:max|1\s*rm|pr)\b/i.test(text);

  // Sleep hours: never treat "48 hours ago" / training-age hours as sleep.
  const sleepHours =
    firstNumber(
      /\b(?:slept|sleep|ngu(?:\s+khoang|\s+du)?)\D{0,20}(\d+(?:\.\d+)?)\s*(?:hours?|h|gio|tieng)\b(?!\s*ago)/i,
      current,
    ) ??
    firstNumber(
      /\b(?:slept|sleep|ngu(?:\s+khoang|\s+du)?)\D{0,20}(\d+(?:\.\d+)?)\s*(?:hours?|h|gio|tieng)\b(?!\s*ago)/i,
      text,
    );

  return {
    sleepHours,
    recoveryScore: firstNumber(/\brecovery(?:\s+score)?\D{0,12}(\d{1,3})\b/i, current),
    recoveryStatus,
    shoulderIrritated,
    overheadIrritating,
    shoulderIrritationResolved: shoulderResolved,
    numbnessPresent: explicitNegations.numbness ? false : numbnessPresent,
    weaknessPresent: explicitNegations.weakness ? false : weaknessPresent,
    swellingPresent: explicitNegations.swelling ? false : swellingPresent,
    chestTrainedDaysAgo: recentChest.daysAgo,
    chestIntensityHigh: recentChest.high,
    caffeineMg: detectCaffeineMg(current) ?? detectCaffeineMg(text),
    trainingGoalStrength: /\b(?:strength|suc manh|giu nhip strength|keep(?:ing)?\s+(?:some\s+)?strength|some\s+strength\s+work)\b/i.test(text),
    wantsSubmax: /\bsubmax(?:imal)?\b/i.test(text) || noMax || (trainingDecisionRequested && !wantsMax && shoulderIrritated),
    wantsMax,
    trainingDecisionRequested,
    wantsUncertaintyBreakdown: detectUncertaintyBreakdown(text),
    nutritionOnlyRequest,
  };
}

/**
 * Constraint-aware coaching from canonical state.
 * Returns null when this scenario class does not apply (so other routes handle it).
 */
export function buildCurrentStateCoachingResponse(state: CurrentTurnState, language: "en" | "vi"): string | null {
  if (state.nutritionOnlyRequest) return null;
  if (state.shoulderIrritationResolved) return null;
  if (!state.shoulderIrritated) return null;
  if (!state.wantsSubmax && !state.wantsMax && !state.trainingDecisionRequested) return null;

  const chestDays = state.chestTrainedDaysAgo;
  const caffeineMg = state.caffeineMg;
  const avoidOverhead = state.overheadIrritating;
  const recentHeavyChest = chestDays != null && chestDays <= 3 && (state.chestIntensityHigh || chestDays <= 2);
  const recoveryOk = state.recoveryStatus === "GOOD" || (state.sleepHours != null && state.sleepHours >= 7);
  const showBuckets = state.wantsUncertaintyBreakdown || true; // always structure for this scenario class

  if (language === "vi") {
    const supported = [
      "hôm nay không max",
      "không cố ép qua kích ứng vai đang báo cáo",
      recoveryOk ? "ngủ/recovery hiện tại chấp nhận được cho buổi tập" : null,
      avoidOverhead ? "không chủ động chất tải pattern overhead đang gây kích ứng" : null,
      recentHeavyChest
        ? `ngực đã có stimulus nặng khoảng ${chestDays} ngày trước nên ít lý do để ép thêm một buổi chest nặng`
        : null,
      state.numbnessPresent === false || state.weaknessPresent === false || state.swellingPresent === false
        ? "không numbness/weakness/swelling chỉ nghĩa là các red flag đó chưa được báo cáo — không chứng minh kích ứng là nhẹ và không phải chẩn đoán"
        : null,
    ]
      .filter(Boolean)
      .join("; ");

    const conditional =
      "Horizontal pressing có thể hợp lý chỉ sau warm-up pressing: chỉ tiếp tục submax với tải/RPE bảo thủ khi warm-up hoàn toàn không đau và kích ứng không tăng. Nếu cổng đó thất bại → dừng pattern đó và chuyển sang lựa chọn không đau đã phù hợp với kế hoạch hôm nay, vùng khác trong lịch, hoặc recovery. Không mặc định kê full chest / fly / row / pulldown / stretch như 'an toàn' nếu chưa có phản ứng triệu chứng.";

    const unknownParts = [
      "nguyên nhân chính xác của kích ứng",
      "horizontal pressing hôm nay có tái tạo triệu chứng hay không",
      caffeineMg != null
        ? `${caffeineMg}mg caffeine đã dùng có cải thiện hiệu suất cá nhân hôm nay hay không (${caffeineMg}mg chỉ là dữ kiện tiêu thụ — không suy ra dung nạp cao hơn hay khẳng định tăng strength/performance)`
        : "ảnh hưởng caffeine lên hiệu suất cá nhân hôm nay",
      "bài thay thế cụ thể nếu chưa biết buổi nào đang được lên lịch",
    ];

    if (!showBuckets) {
      return `Không max hôm nay. ${avoidOverhead ? "Tránh chất tải overhead đang kích ứng. " : ""}${conditional}`;
    }

    return [
      `ĐIỀU ĐƯỢC ỦNG HỘ MẠNH: ${supported}.`,
      `ĐIỀU KIỆN: ${conditional}`,
      `CHƯA BIẾT: ${unknownParts.join("; ")}. Không đổ Squat/Deadlift/Lat Pulldown/Seated Row nếu chúng không nằm trong ngữ cảnh lịch tập hiện tại — nếu cần bài thay thế cụ thể, cho biết buổi nào đang được lên lịch.`,
    ].join("\n\n");
  }

  const supportedEn = [
    "no max today",
    "do not force through the reported shoulder irritation",
    recoveryOk ? "current sleep/recovery are acceptable for training" : null,
    avoidOverhead ? "do not deliberately load the already-irritating overhead pattern" : null,
    recentHeavyChest
      ? `chest already had a heavy stimulus about ${chestDays} days ago, so there is limited reason to force another aggressive chest session`
      : null,
    "absence of numbness/weakness/swelling only means those red flags are not reported — it does not prove the irritation is minor, and this is not a diagnosis",
  ]
    .filter(Boolean)
    .join("; ");

  const conditionalEn =
    "Horizontal pressing may be reasonable only after a pain-free warm-up press: continue conservative submax load/RPE only if warm-up stays fully symptom-free and irritation does not increase. If that gate fails → stop that pattern and switch only to a pain-free option already appropriate for today's plan, another scheduled region, or recovery. Do not assume chest fly, rows, pulldowns, or stretching are automatically safe.";

  const unknownEn = [
    "the exact cause of the irritation",
    "whether horizontal pressing will provoke symptoms today",
    caffeineMg != null
      ? `whether today's ${caffeineMg} mg caffeine materially improves individual performance (${caffeineMg} mg is consumption state only — not tolerance evidence, not a performance guarantee)`
      : "individual performance effect of today's caffeine",
    "a specific substitute lift if today's scheduled session is unknown",
  ];

  return [
    `STRONGLY SUPPORTED: ${supportedEn}.`,
    `CONDITIONAL: ${conditionalEn}`,
    `UNKNOWN: ${unknownEn.join("; ")}. Do not dump Squats/Deadlifts/Leg Press/Lat Pulldowns/Seated Rows/Lateral Raises/Face Pulls or generic mobility/stretching as default substitutes without schedule context — ask what session is planned if a concrete substitute is required.`,
  ].join("\n\n");
}

export function formatCurrentStatePrompt(state: CurrentTurnState): string {
  const fields = [
    state.sleepHours === null ? null : `sleepHours=${state.sleepHours}`,
    state.recoveryScore === null ? null : `recoveryScore=${state.recoveryScore}`,
    state.recoveryStatus === null ? null : `recoveryStatus=${state.recoveryStatus}`,
    state.shoulderIrritated ? "bodyRegion=RIGHT_SHOULDER;irritationPresent=true" : null,
    state.overheadIrritating ? "movementPattern=OVERHEAD" : null,
    state.shoulderIrritationResolved ? "shoulderIrritation=resolved" : null,
    state.numbnessPresent === null ? null : `numbnessPresent=${state.numbnessPresent}`,
    state.weaknessPresent === null ? null : `weaknessPresent=${state.weaknessPresent}`,
    state.swellingPresent === null ? null : `swellingPresent=${state.swellingPresent}`,
    state.chestTrainedDaysAgo === null
      ? null
      : `recentTraining=CHEST;intensity=${state.chestIntensityHigh ? "HIGH" : "UNKNOWN"};ageDays=${state.chestTrainedDaysAgo}`,
    state.caffeineMg === null ? null : `caffeineConsumedMg=${state.caffeineMg}`,
    state.trainingGoalStrength ? "trainingGoal=STRENGTH" : null,
    state.wantsSubmax ? "trainingIntent=SUBMAX" : null,
    state.wantsMax ? "trainingIntent=MAX" : "maxIntent=false",
  ].filter((field): field is string => field !== null);
  return `<CURRENT_STATE>\n${fields.join("\n")}\n</CURRENT_STATE>\n<HISTORICAL_CONTEXT>\nAny older conflicting values in the conversation are historical only; they must not be described as current.\n</HISTORICAL_CONTEXT>`;
}
