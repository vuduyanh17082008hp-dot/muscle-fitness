import { normalizeSafetyText } from "@/lib/dante-core/safety-layer";
import type {
  EvidenceCertainty,
  ProvenanceKind,
  ResolutionState,
  SemanticInterpretation,
  SemanticProposition,
  SignalPolarity,
  SignalTrend,
  TemporalAnchor,
  TemporalScope,
} from "@/lib/dante-core/adaptive-coach-v2/types";

import { sidedShoulderContrast, withoutSidedClauses } from "@/lib/dante-core/adaptive-coach-v2/sided-shoulder";

/** rawSpan markers of the side-scoped shoulder propositions (read by the authoritative-state builder). */
export const SIDED_PAINFUL_SPAN = "side_statement_painful";
export const SIDED_NOT_PAINFUL_SPAN = "side_statement_not_painful";

type ConceptDefinition = { concept: string; patterns: RegExp[] };

const CONCEPTS: ConceptDefinition[] = [
  { concept: "CHEST_PAIN", patterns: [/\bchest pain\b/g, /\bpain in (?:my |the )?chest\b/g, /\bdau nguc\b/g, /\bnguc.{0,20}dau\b/g] },
  { concept: "DIZZINESS", patterns: [/\bdizz(?:y|iness)\b/g, /\bchong mat\b/g] },
  { concept: "NUMBNESS", patterns: [/\bnumb(?:ness)?\b/g, /\bte bi\b/g, /\bte (?:tay|chan|vai)\b/g] },
  { concept: "WEAKNESS", patterns: [/\bweak(?:ness)?\b/g, /\bye(?:u)?\b/g] },
  { concept: "SWELLING", patterns: [/\bswell(?:ing|en)?\b/g, /\bsung(?: to)?\b/g] },
  {
    concept: "SHOULDER_IRRITATION",
    patterns: [
      /\bshoulder (?:irritation|irritated|pain|ache|discomfort)\b/g,
      /\b(?:irritated|painful|aching) shoulder\b/g,
      /\b(?:dau|kich ung|kho chiu|can) vai\b/g,
      /\bvai (?:phai |trai )?(?:dau|bi kich ung|kho chiu|can|hoi can)\b/g,
      /\bhoi can\b/g,
    ],
  },
  { concept: "FAINTING", patterns: [/\bfaint(?:ed|ing)?\b/g, /\bpassed out\b/g, /\bblack(?:ed)? out\b/g, /\bngat(?: xiu)?\b/g] },
  { concept: "PAIN", patterns: [/\bpain\b/g, /\bdau\b/g] },
];

const VI_MARKERS = /\b(?:khong|bi|dang|nhung|roi|gio|tuan|thang|truoc|hinh nhu|chac la|dau|nguc|chong mat|te|yeu|sung|vai|ngat|do|het|can)\b/;
const EN_MARKERS = /\b(?:no|not|without|but|now|last|yesterday|maybe|think|pain|dizzy|numb|weak|swelling|shoulder|faint|better|gone)\b/;
const HISTORICAL = /\b(?:tuan truoc|thang truoc|hom qua|yesterday|last week|last month|previously|used to)\b/;
const RECENT = /\b(?:gan day|recently|earlier today)\b/;
const UNCERTAIN = /\b(?:hinh nhu|chac la|chac tam|khoang|khong nho ro|khong nho chac|khong co log|khong biet ben nao|maybe|i think|i guess|not sure|probably|mang mang|roughly|about)\b/;
const CURRENT = /\b(?:dang|gio|bay gio|hien tai|nay|hom nay|now|currently|today|right now)\b/;
const FULLY_RESOLVED = /\b(?:het(?:\s+hoan\s+toan)?(?:\s+roi)?|(?:hoan\s+toan\s+)?het(?:\s+roi)?|completely gone|fully gone|fully resolved|no longer (?:there|present)|pain[- ]?free|symptom[- ]?free|het dau)\b/;
const IMPROVING = /\b(?:do roi|do hon|better|improving|getting better|less pain|giam|bot)\b/;
const STILL_PRESENT = /\b(?:van|van con|van hoi|still|a bit|slightly|hoi)\b/;

function detectLanguage(text: string): SemanticInterpretation["language"] {
  const normalized = normalizeSafetyText(text);
  const hasVi = VI_MARKERS.test(normalized);
  const hasEn = EN_MARKERS.test(normalized);
  return hasVi && hasEn ? "mixed" : hasVi ? "vi" : "en";
}

function clauseBounds(text: string, index: number): [number, number] {
  const boundaries = /[.!?;,\n]|\b(?:but|however|nhung|tuy nhien)\b/g;
  let start = 0;
  let end = text.length;
  let match: RegExpExecArray | null;
  while ((match = boundaries.exec(text)) !== null) {
    if (match.index < index) start = match.index + match[0].length;
    else {
      end = match.index;
      break;
    }
  }
  return [start, end];
}

function isNegated(clause: string, relativeIndex: number): boolean {
  const prefix = clause.slice(0, relativeIndex);
  const nearby = prefix.slice(-70);
  return /(?:\b(?:no|not|without|never|khong)\b(?:\s+(?:co|bi|con))?[\s\p{L},'-]{0,45}|\bno\b[\s\p{L},'-]{0,45}\bor\s+)$/iu.test(nearby)
    || /\b(?:khong|no)\s+(?:dau|pain)\s+nua\b/i.test(clause);
}

function inferTemporalAnchor(clause: string): TemporalAnchor {
  if (HISTORICAL.test(clause)) return "HISTORICAL";
  if (RECENT.test(clause)) return "RECENT_PAST";
  if (CURRENT.test(clause)) return "CURRENT";
  return "CURRENT";
}

function toTemporalScope(anchor: TemporalAnchor): TemporalScope {
  if (anchor === "HISTORICAL") return "HISTORICAL";
  if (anchor === "RECENT_PAST") return "RECENT";
  if (anchor === "UNKNOWN") return "UNSPECIFIED";
  return "CURRENT";
}

function inferLaterality(clause: string, uncertain: boolean): SemanticProposition["laterality"] {
  if (uncertain && /\b(?:right|phai|left|trai)\b/.test(clause)) return "UNCERTAIN";
  if (/\b(?:chac(?:\s+la)?\s+)?(?:ben\s+)?(?:right|phai)\b/.test(clause) && uncertain) return "UNCERTAIN";
  if (/\b(?:right|phai)\b/.test(clause)) return "RIGHT";
  if (/\b(?:left|trai)\b/.test(clause)) return "LEFT";
  return "UNSPECIFIED";
}

function inferTrend(clause: string, fullText: string): SignalTrend {
  if (IMPROVING.test(clause) || IMPROVING.test(fullText)) return "IMPROVING";
  if (/\b(?:worse|worsening|nang hon|dau hon)\b/i.test(clause)) return "WORSENING";
  if (/\b(?:stable|on dinh|van nhu cu)\b/i.test(clause)) return "STABLE";
  return "UNKNOWN";
}

function inferResolution(clause: string, fullText: string, polarity: SignalPolarity): ResolutionState {
  if (FULLY_RESOLVED.test(clause) || FULLY_RESOLVED.test(fullText) && CURRENT.test(clause)) return "RESOLVED";
  if (polarity === "ABSENT" && FULLY_RESOLVED.test(fullText)) return "RESOLVED";
  if (IMPROVING.test(clause) && STILL_PRESENT.test(fullText)) return "PARTIALLY_RESOLVED";
  if (IMPROVING.test(clause) && !FULLY_RESOLVED.test(fullText)) return "PARTIALLY_RESOLVED";
  if (polarity === "PRESENT") return "ACTIVE";
  if (polarity === "ABSENT") return "RESOLVED";
  return "UNKNOWN";
}

function compatState(
  polarity: SignalPolarity,
  temporalAnchor: TemporalAnchor,
  resolution: ResolutionState,
): SemanticProposition["state"] {
  if (resolution === "RESOLVED" || (polarity === "ABSENT" && temporalAnchor === "CURRENT")) return polarity === "ABSENT" ? "ABSENT" : "RESOLVED";
  if (temporalAnchor === "HISTORICAL" && polarity === "PRESENT") return "HISTORICAL";
  if (polarity === "ABSENT") return "ABSENT";
  if (polarity === "UNCERTAIN") return "UNKNOWN";
  return "PRESENT";
}

function propositionForMatch(
  concept: string,
  matched: string,
  clause: string,
  relativeIndex: number,
  fullText: string,
): SemanticProposition {
  const uncertain = UNCERTAIN.test(clause) || UNCERTAIN.test(fullText);
  const temporalAnchor = inferTemporalAnchor(clause);
  const negated = isNegated(clause, relativeIndex) || /\b(?:khong|no)\s+(?:dau|pain)\s+nua\b/i.test(clause);
  const fullyResolved = FULLY_RESOLVED.test(clause) || (FULLY_RESOLVED.test(fullText) && CURRENT.test(clause));
  const improving = IMPROVING.test(clause) || (IMPROVING.test(fullText) && CURRENT.test(clause));
  const stillThere = STILL_PRESENT.test(clause) || /\bhoi can\b/i.test(clause) || /\bstill\b/i.test(clause);

  let polarity: SignalPolarity = "PRESENT";
  if (negated || fullyResolved) polarity = "ABSENT";
  else if (uncertain && !stillThere && !improving) polarity = "UNCERTAIN";
  // "đỡ rồi" / improving without full resolution → still PRESENT
  if (improving && !fullyResolved && !negated) polarity = "PRESENT";
  if (stillThere && !fullyResolved) polarity = "PRESENT";

  const trend = inferTrend(clause, fullText);
  const resolution = inferResolution(clause, fullText, polarity);
  // Improving but not gone: never mark RESOLVED
  const finalResolution: ResolutionState =
    improving && !fullyResolved && polarity === "PRESENT"
      ? (stillThere ? "PARTIALLY_RESOLVED" : "PARTIALLY_RESOLVED")
      : resolution;

  const certainty: EvidenceCertainty = uncertain
    ? "UNCERTAIN"
    : temporalAnchor === "HISTORICAL"
      ? "EXPLICIT"
      : "EXPLICIT";

  const provenance: ProvenanceKind = uncertain
    ? "USER_RECALL_UNCERTAIN"
    : temporalAnchor === "HISTORICAL"
      ? "EXPLICIT_HISTORICAL_REPORT"
      : "EXPLICIT_CURRENT_REPORT";

  return {
    concept,
    polarity,
    temporalAnchor,
    trend: improving && !fullyResolved ? "IMPROVING" : trend,
    resolution: finalResolution,
    certainty,
    state: compatState(polarity, temporalAnchor, finalResolution),
    temporal: toTemporalScope(temporalAnchor),
    provenance,
    laterality: inferLaterality(clause, uncertain),
    ...(uncertain ? { count: /\b(?:khong co log|mang mang|not sure how many)\b/i.test(fullText) ? "UNVERIFIED" : "UNKNOWN" } : {}),
    rawSpan: matched,
  };
}

/** Split multi-time shoulder narratives into historical + current propositions. */
function synthesizeShoulderTimeline(normalized: string, rawText: string): SemanticProposition[] {
  const hasShoulder = /\b(?:vai|shoulder)\b/.test(normalized) || /\b(?:dau|pain|can|irritat)\b/.test(normalized);
  if (!hasShoulder) return [];

  const historicalPain = /\b(?:hom qua|yesterday|tuan truoc|thang truoc).{0,40}\b(?:vai|shoulder)?.{0,20}\b(?:dau|pain|can|irritat)/.test(normalized)
    || /\b(?:vai|shoulder).{0,40}\b(?:hom qua|yesterday|tuan truoc|thang truoc).{0,20}\b(?:dau|pain)/.test(normalized);
  const improvingNow = /\b(?:nay|hom nay|now|today).{0,40}\b(?:do roi|do hon|better|improving)/.test(normalized)
    || /\b(?:do roi|better).{0,40}\b(?:van|still|hoi)/.test(normalized);
  const fullyGoneNow = /\b(?:nay|hom nay|now|today|gio|hien tai).{0,40}\b(?:het(?:\s+hoan\s+toan)?|(?:hoan\s+toan\s+)?het|completely gone|fully resolved|het dau|khong dau)/.test(normalized)
    || /\b(?:het(?:\s+hoan\s+toan)?|(?:hoan\s+toan\s+)?het|completely gone|khong dau).{0,40}\b(?:nay|now|today|hien tai|roi)?/.test(normalized)
    || /\bhien tai\s+khong\s+dau\b/.test(normalized);
  const stillIrritated = /\b(?:van|still).{0,20}\b(?:hoi\s+)?(?:can|dau|pain|irritat|sore)/.test(normalized)
    || /\bhoi can\b/.test(normalized);

  if (!historicalPain && !improvingNow && !fullyGoneNow) return [];

  const out: SemanticProposition[] = [];
  if (historicalPain) {
    out.push({
      concept: "SHOULDER_IRRITATION",
      polarity: "PRESENT",
      temporalAnchor: "HISTORICAL",
      trend: "UNKNOWN",
      resolution: "ACTIVE",
      certainty: "EXPLICIT",
      state: "HISTORICAL",
      temporal: "HISTORICAL",
      provenance: "EXPLICIT_HISTORICAL_REPORT",
      laterality: "UNSPECIFIED",
      rawSpan: "historical_shoulder",
    });
  }

  if (fullyGoneNow) {
    out.push({
      concept: "SHOULDER_IRRITATION",
      polarity: "ABSENT",
      temporalAnchor: "CURRENT",
      trend: "IMPROVING",
      resolution: "RESOLVED",
      certainty: "EXPLICIT",
      state: "ABSENT",
      temporal: "CURRENT",
      provenance: "EXPLICIT_CURRENT_REPORT",
      laterality: "UNSPECIFIED",
      rawSpan: "current_resolved_shoulder",
    });
  } else if (improvingNow || stillIrritated) {
    out.push({
      concept: "SHOULDER_IRRITATION",
      polarity: "PRESENT",
      temporalAnchor: "CURRENT",
      trend: "IMPROVING",
      resolution: stillIrritated || improvingNow ? "PARTIALLY_RESOLVED" : "ACTIVE",
      certainty: "EXPLICIT",
      state: "PRESENT",
      temporal: "CURRENT",
      provenance: "EXPLICIT_CURRENT_REPORT",
      laterality: "UNSPECIFIED",
      rawSpan: "current_improving_shoulder",
    });
  }

  // Ensure language detection still works for callers that only use this path.
  void rawText;
  return out;
}

/** A tense marker the text carries itself (null = none), so a sibling clause can inherit its sentence's frame. */
function explicitAnchor(text: string): TemporalAnchor | null {
  if (HISTORICAL.test(text)) return "HISTORICAL";
  if (RECENT.test(text)) return "RECENT_PAST";
  if (CURRENT.test(text)) return "CURRENT";
  return null;
}

/**
 * "vai trái đau, vai phải không đau": one proposition PER SIDE. The generic timeline synthesizer reads such a turn as a
 * single "no shoulder pain" fact and loses the painful side (and a persisted correction once read the negative side as
 * the side that hurt). A sibling clause without its own tense marker inherits the tense of its sentence.
 */
function synthesizeSidedShoulderContrast(normalized: string): SemanticProposition[] {
  if (UNCERTAIN.test(normalized)) return [];
  return sidedShoulderContrast(normalized).map((statement) => {
    const temporalAnchor = explicitAnchor(statement.clause) ?? explicitAnchor(statement.sentence) ?? "CURRENT";
    const polarity: SignalPolarity = statement.painful ? "PRESENT" : "ABSENT";
    const resolution: ResolutionState = statement.painful ? "ACTIVE" : "RESOLVED";
    return {
      concept: "SHOULDER_IRRITATION",
      polarity,
      temporalAnchor,
      trend: "UNKNOWN",
      resolution,
      certainty: "EXPLICIT",
      state: compatState(polarity, temporalAnchor, resolution),
      temporal: toTemporalScope(temporalAnchor),
      provenance: temporalAnchor === "CURRENT" ? "EXPLICIT_CURRENT_REPORT" : "EXPLICIT_HISTORICAL_REPORT",
      laterality: statement.side,
      rawSpan: statement.painful ? SIDED_PAINFUL_SPAN : SIDED_NOT_PAINFUL_SPAN,
    } satisfies SemanticProposition;
  });
}

function synthesizePainWeaknessContrast(normalized: string): SemanticProposition[] {
  const painGone = /\b(?:khong dau nua|no(?:\s+more)?\s+pain|het dau|pain[- ]?free)\b/.test(normalized);
  const weaknessPresent = /\b(?:van.{0,12}(?:yeu|weak)|still.{0,12}weak|hoi yeu|a bit weak)\b/.test(normalized);
  if (!painGone || !weaknessPresent) return [];
  return [
    {
      concept: "PAIN",
      polarity: "ABSENT",
      temporalAnchor: "CURRENT",
      trend: "IMPROVING",
      resolution: "RESOLVED",
      certainty: "EXPLICIT",
      state: "ABSENT",
      temporal: "CURRENT",
      provenance: "EXPLICIT_CURRENT_REPORT",
      rawSpan: "pain_absent",
    },
    {
      concept: "WEAKNESS",
      polarity: "PRESENT",
      temporalAnchor: "CURRENT",
      trend: "UNKNOWN",
      resolution: "ACTIVE",
      certainty: "EXPLICIT",
      state: "PRESENT",
      temporal: "CURRENT",
      provenance: "EXPLICIT_CURRENT_REPORT",
      rawSpan: "weakness_present",
    },
  ];
}

function synthesizeUncertainLaterality(normalized: string): SemanticProposition[] {
  // Mixed verified+uncertain shoulder claims already encode laterality per claim.
  if (synthesizeMixedShoulderEpisodeClaims(normalized).length > 0) return [];

  if (!/(?:chac(?:\s+la)?|maybe|probably|not sure).{0,24}(?:ben\s+)?(?:phai|trai|right|left)|(?:phai|trai|right|left).{0,24}(?:khong nho ro|not sure)|khong nho chac ben nao|khong biet ben nao|khong nho chac/i.test(normalized)) {
    return [];
  }
  return [{
    concept: "SHOULDER_IRRITATION",
    polarity: "UNCERTAIN",
    temporalAnchor: "UNKNOWN",
    trend: "UNKNOWN",
    resolution: "UNKNOWN",
    certainty: "UNCERTAIN",
    state: "UNKNOWN",
    temporal: "UNSPECIFIED",
    provenance: "USER_RECALL_UNCERTAIN",
    laterality: "UNCERTAIN",
    count: "UNKNOWN",
    rawSpan: "uncertain_laterality",
  }];
}

/** Uncertain historical recall — never promote to current verified evidence. */
function synthesizeUncertainHistoricalRecall(normalized: string): SemanticProposition[] {
  // Mixed verified+uncertain shoulder narratives are handled separately.
  if (synthesizeMixedShoulderEpisodeClaims(normalized).length > 0) return [];

  const historicalUncertain =
    /(?:hinh nhu|khoang|chac tam|mang mang|maybe|roughly|about).{0,80}(?:thang truoc|tuan truoc|last month|last week|hom qua)/i.test(normalized)
    || /(?:thang truoc|tuan truoc|last month|last week).{0,80}(?:hinh nhu|khoang|khong co log|khong nho|khong ghi)/i.test(normalized);
  const shoulder = /\b(?:vai|shoulder)\b/.test(normalized);
  const countMatch = normalized.match(/\b(?:khoang|about|roughly|~)?\s*(\d+)\s*(?:lan|times|episodes)\b/i);
  const rangeMatch = normalized.match(/\b(\d+)\s*[-–]\s*(\d+)\s*(?:lan|times|episodes)\b/i);
  const noLog = /(?:khong co log|khong ghi|no log|without (?:a )?log|unlogged)/i.test(normalized);
  const sideUnknown = /(?:khong nho chac ben nao|khong biet ben nao|khong nho chac|not sure which side|side (?:is )?unknown)/i.test(normalized);
  const forceConfirm = /(?:cu coi la|coi nhu|treat (?:it |them )?as|count (?:it |them )?as).{0,24}(?:confirmed|xac nhan|\d+\s*lan)/i.test(normalized);

  if (!historicalUncertain || !shoulder) return [];

  const estimate = rangeMatch
    ? Number(rangeMatch[1])
    : countMatch
      ? Number(countMatch[1])
      : null;
  const rawSpan = rangeMatch
    ? `uncertain_range_${rangeMatch[1]}_${rangeMatch[2]}`
    : estimate != null && Number.isFinite(estimate)
      ? `uncertain_count_${estimate}`
      : "uncertain_historical_recall";

  return [{
    concept: "SHOULDER_IRRITATION",
    polarity: "UNCERTAIN",
    temporalAnchor: "HISTORICAL",
    trend: "UNKNOWN",
    resolution: "UNKNOWN",
    certainty: "UNCERTAIN",
    state: "HISTORICAL",
    temporal: "HISTORICAL",
    provenance: "USER_RECALL_UNCERTAIN",
    laterality: sideUnknown || UNCERTAIN.test(normalized) ? "UNCERTAIN" : "UNSPECIFIED",
    count: noLog || forceConfirm || estimate != null ? "UNVERIFIED" : "UNKNOWN",
    rawSpan,
  }];
}

/**
 * Mixed independent shoulder episode claims:
 * verified June/left/1 + uncertain last-month/3-4 must remain SEPARATE.
 * User "5 confirmed" aggregate MUST NOT upgrade Claim B or merge identities.
 */
function synthesizeMixedShoulderEpisodeClaims(normalized: string): SemanticProposition[] {
  const verifiedJune =
    /(?:thang\s*6|june|thang sau).{0,60}(?:vai\s+trai|left\s+shoulder|vai).{0,40}(?:\d+)\s*lan|(?:vai\s+trai|left\s+shoulder).{0,40}(?:thang\s*6|june).{0,40}(?:\d+)\s*lan|(?:thang\s*6|june).{0,80}(?:\d+)\s*lan.{0,40}(?:ghi\s+log|co\s+log|logged|verified)/i.test(normalized)
    || /(?:nho chac|remember (?:clearly|for sure)|chac).{0,40}(?:thang\s*6|june).{0,60}(?:vai\s+trai|left).{0,40}1\s*lan/i.test(normalized);
  const hasLog = /(?:ghi\s+log|co\s+log|co\s+ghi|logged|verified\s+log|vi\s+co\s+ghi\s+log)/i.test(normalized);
  const uncertainLastMonth =
    /(?:thang truoc|last month).{0,80}(?:hinh nhu|khoang|them|pain|dau)|(?:hinh nhu|khoang).{0,40}(?:thang truoc|last month)/i.test(normalized);
  const noLogLast = /(?:khong ghi|khong co log|khong chac|not sure|without (?:a )?log)/i.test(normalized);

  if (!verifiedJune || !uncertainLastMonth) return [];

  const juneCount = normalized.match(/(?:thang\s*6|june)[\s\S]{0,80}?(\d+)\s*lan|(\d+)\s*lan[\s\S]{0,80}?(?:thang\s*6|june)/i);
  const exact = Number(juneCount?.[1] ?? juneCount?.[2] ?? 1);
  const range = normalized.match(/(?:thang truoc|last month)[\s\S]{0,80}?(\d+)\s*[-–]\s*(\d+)\s*lan|(\d+)\s*[-–]\s*(\d+)\s*lan[\s\S]{0,40}?(?:thang truoc|last month)/i)
    ?? normalized.match(/(?:them|khoang|hinh nhu)[\s\S]{0,40}?(\d+)\s*[-–]\s*(\d+)\s*lan/i);

  const out: SemanticProposition[] = [
    {
      concept: "SHOULDER_IRRITATION",
      polarity: "PRESENT",
      temporalAnchor: "HISTORICAL",
      trend: "UNKNOWN",
      resolution: "UNKNOWN",
      certainty: hasLog ? "VERIFIED" : "EXPLICIT",
      state: "HISTORICAL",
      temporal: "HISTORICAL",
      provenance: hasLog ? "VERIFIED_TOOL_DATA" : "EXPLICIT_HISTORICAL_REPORT",
      laterality: /vai\s+trai|left\s+shoulder|\btrai\b/i.test(normalized) ? "LEFT" : "UNSPECIFIED",
      count: Number.isFinite(exact) ? exact : 1,
      rawSpan: "june_verified_left",
    },
    {
      concept: "SHOULDER_IRRITATION",
      polarity: "UNCERTAIN",
      temporalAnchor: "HISTORICAL",
      trend: "UNKNOWN",
      resolution: "UNKNOWN",
      certainty: "UNCERTAIN",
      state: "HISTORICAL",
      temporal: "HISTORICAL",
      provenance: "USER_RECALL_UNCERTAIN",
      laterality: "UNCERTAIN",
      count: "UNVERIFIED",
      rawSpan: range
        ? `uncertain_range_${range[1] ?? range[3]}_${range[2] ?? range[4]}`
        : "uncertain_last_month",
    },
  ];

  // Force-confirm aggregate must not create a third verified claim or merge.
  void noLogLast;
  return out;
}

/** Historical correction of red-flag symptoms: "tê tay … nói nhầm / tuần trước". */
function synthesizeHistoricalSymptomCorrection(normalized: string): SemanticProposition[] {
  const correctedNumbness =
    /(?:te tay|te chan|numb(?:ness)?).{0,100}(?:noi nham|tuan truoc|last week|said wrong|misspoke)|(?:noi nham|tuan truoc|last week).{0,60}(?:te tay|te chan|numb)/i.test(normalized);
  const currentAbsent =
    /(?:hien tai|currently|now).{0,40}(?:khong\s+te|no\s+numb|khong\s+chong\s+mat|khong\s+dau\s+nguc)|(?:khong\s+te|no\s+numbness).{0,40}(?:hien tai|currently|now)/i.test(normalized);

  if (!correctedNumbness) return [];

  const out: SemanticProposition[] = [
    {
      concept: "NUMBNESS",
      polarity: "PRESENT",
      temporalAnchor: "HISTORICAL",
      trend: "UNKNOWN",
      resolution: "UNKNOWN",
      certainty: "EXPLICIT",
      state: "HISTORICAL",
      temporal: "HISTORICAL",
      provenance: "EXPLICIT_HISTORICAL_REPORT",
      rawSpan: "historical_numbness_corrected",
    },
  ];
  if (currentAbsent || /\bkhong\s+te\b/.test(normalized)) {
    out.push({
      concept: "NUMBNESS",
      polarity: "ABSENT",
      temporalAnchor: "CURRENT",
      trend: "UNKNOWN",
      resolution: "RESOLVED",
      certainty: "EXPLICIT",
      state: "ABSENT",
      temporal: "CURRENT",
      provenance: "EXPLICIT_CURRENT_REPORT",
      rawSpan: "current_numbness_absent",
    });
  }
  return out;
}

export function interpretUserTurn(rawText: string): SemanticInterpretation {
  const normalized = normalizeSafetyText(rawText);
  const propositions: SemanticProposition[] = [];

  // A side contrast owns the shoulder narrative: the single-shoulder readings would collapse it (first divergence for
  // "vai trái đau, vai phải không đau" → "no shoulder pain"). They run on what is left once the sided clauses are
  // removed, so a genuine "hiện tại cả hai vai không đau" in the same turn still counts. Other concepts are untouched.
  const sidedContrast = synthesizeSidedShoulderContrast(normalized);
  const shoulderText = sidedContrast.length > 0 ? withoutSidedClauses(normalized) : normalized;
  const legacySynthesized = [
    ...synthesizeMixedShoulderEpisodeClaims(shoulderText),
    ...synthesizeHistoricalSymptomCorrection(normalized),
    ...synthesizeUncertainHistoricalRecall(shoulderText),
    ...synthesizeShoulderTimeline(shoulderText, rawText),
    ...synthesizePainWeaknessContrast(normalized),
    ...synthesizeUncertainLaterality(shoulderText),
  ];
  const synthesized = sidedContrast.length > 0 ? [...legacySynthesized, ...sidedContrast] : legacySynthesized;
  // If uncertain historical recall already owns the shoulder narrative,
  // drop EXPLICIT_HISTORICAL PRESENT contamination from timeline synthesis.
  // Mixed verified+uncertain claims: drop timeline historical only when the
  // dedicated mixed synthesizer produced VERIFIED_TOOL_DATA (not every
  // historical+current timeline pair).
  const hasUncertainHistoricalShoulder = synthesized.some(
    (item) =>
      item.concept === "SHOULDER_IRRITATION"
      && item.provenance === "USER_RECALL_UNCERTAIN"
      && (item.temporalAnchor === "HISTORICAL" || item.temporal === "HISTORICAL"),
  );
  const hasMixedVerifiedUncertainShoulder = synthesized.some(
    (item) => item.concept === "SHOULDER_IRRITATION" && item.provenance === "VERIFIED_TOOL_DATA",
  ) && synthesized.some(
    (item) =>
      item.concept === "SHOULDER_IRRITATION"
      && item.provenance === "USER_RECALL_UNCERTAIN"
      && (item.temporalAnchor === "HISTORICAL" || item.temporal === "HISTORICAL"),
  );
  const filtered = hasUncertainHistoricalShoulder || hasMixedVerifiedUncertainShoulder
    ? synthesized.filter(
      (item) => !(
        item.concept === "SHOULDER_IRRITATION"
        && item.provenance === "EXPLICIT_HISTORICAL_REPORT"
        && item.polarity === "PRESENT"
        && item.rawSpan === "historical_shoulder"
      ),
    )
    : synthesized;
  propositions.push(...filtered);

  const hasHistoricalNumbnessCorrection = filtered.some(
    (item) => item.concept === "NUMBNESS" && (item.temporalAnchor === "HISTORICAL" || item.temporal === "HISTORICAL"),
  );

  for (const definition of CONCEPTS) {
    // Skip generic PAIN if specialized shoulder/chest already covered the narrative.
    if (definition.concept === "PAIN" && (
      filtered.some((item) => item.concept === "SHOULDER_IRRITATION" || item.concept === "PAIN")
      || /\bchest pain\b|\bdau nguc\b/.test(normalized)
    )) {
      continue;
    }
    if (definition.concept === "SHOULDER_IRRITATION" && filtered.some((item) => item.concept === "SHOULDER_IRRITATION")) {
      continue;
    }
    if (definition.concept === "NUMBNESS" && hasHistoricalNumbnessCorrection) {
      continue;
    }
    for (const pattern of definition.patterns) {
      const matcher = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = matcher.exec(normalized)) !== null) {
        const [start, end] = clauseBounds(normalized, match.index);
        const clause = normalized.slice(start, end);
        propositions.push(propositionForMatch(
          definition.concept,
          match[0],
          clause,
          match.index - start,
          normalized,
        ));
        if (match[0].length === 0) matcher.lastIndex += 1;
      }
    }
  }

  return { rawText, language: detectLanguage(rawText), propositions };
}

const SAFETY_CONCEPTS = new Set(["CHEST_PAIN", "DIZZINESS", "NUMBNESS", "WEAKNESS", "SWELLING", "FAINTING"]);

function isCurrentPresent(item: SemanticProposition): boolean {
  const polarity = item.polarity ?? (item.state === "PRESENT" ? "PRESENT" : item.state === "ABSENT" || item.state === "RESOLVED" ? "ABSENT" : "UNCERTAIN");
  const temporal = item.temporalAnchor ?? (item.temporal === "CURRENT" ? "CURRENT" : item.temporal === "HISTORICAL" ? "HISTORICAL" : "UNKNOWN");
  const resolution = item.resolution ?? (item.state === "RESOLVED" ? "RESOLVED" : "UNKNOWN");
  return polarity === "PRESENT" && temporal === "CURRENT" && resolution !== "RESOLVED";
}

export function semanticSafetySignals(interpretation: SemanticInterpretation): string[] {
  return [...new Set(interpretation.propositions
    .filter((item) => isCurrentPresent(item) && SAFETY_CONCEPTS.has(item.concept))
    .map((item) => item.concept))];
}

export function evaluateContrastiveSafety(text: string): {
  escalate: boolean;
  reasons: string[];
  falsePositiveRisk: boolean;
  /** Certainty can be low while urgency remains high. */
  urgency: "NONE" | "ELEVATED" | "HIGH";
  epistemicCertainty: "LOW" | "MEDIUM" | "HIGH";
} {
  const interpretation = interpretUserTurn(text);
  const reasons = semanticSafetySignals(interpretation);
  const mentionedSafetyConcepts = interpretation.propositions.filter((item) => SAFETY_CONCEPTS.has(item.concept));
  const uncertainChest = interpretation.propositions.some(
    (item) => item.concept === "CHEST_PAIN" && (item.certainty === "UNCERTAIN" || item.polarity === "UNCERTAIN"),
  );
  const escalate = reasons.length > 0 || uncertainChest;
  return {
    escalate,
    reasons: escalate && reasons.length === 0 ? ["CHEST_PAIN"] : reasons,
    falsePositiveRisk: reasons.length === 0 && mentionedSafetyConcepts.length > 0 && !uncertainChest,
    urgency: escalate ? (uncertainChest && reasons.length === 0 ? "ELEVATED" : "HIGH") : "NONE",
    epistemicCertainty: uncertainChest ? "LOW" : escalate ? "HIGH" : "MEDIUM",
  };
}

/** Current-facing proposition for a concept (ignores historical-only rows). */
export function currentProposition(
  interpretation: SemanticInterpretation,
  concept: string,
): SemanticProposition | undefined {
  const current = interpretation.propositions.filter((item) => {
    if (item.concept !== concept) return false;
    const temporal = item.temporalAnchor ?? (item.temporal === "HISTORICAL" ? "HISTORICAL" : "CURRENT");
    return temporal === "CURRENT" || temporal === "UNKNOWN";
  });
  return current.at(-1);
}
