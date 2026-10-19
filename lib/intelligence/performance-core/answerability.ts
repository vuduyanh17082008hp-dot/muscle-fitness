import { candidateCompleteness } from "./candidates";
import { checkOutputIntegrity, enforceIntegrity, safeContinuationPresent, tierContradictions } from "./output-integrity";
import { fold, hasTerm, sentences, tokens } from "./text";
import type { CandidateDecision, CandidatePriority, Identity, IntelligenceBrief, OptimizationFacet, RestrictedSubstanceUse } from "./types";

export type AnswerObligation = "DEFINE" | "COMPARE" | "ASSESS_EVIDENCE";
export type ObligationDisposition = "ANSWERED" | "NEEDS_CLARIFICATION" | "OUTSIDE_AUTHORITY" | "UNAVAILABLE";

// Only for a DEFINE turn with no nameable target. Letter lookarounds, not \b: JS \b is ASCII-only and would miss "là".
const LOOSE_IDENTITY = /(?<!\p{L})(?:is|are|là)(?!\p{L})/iu;
// "what is the best …", "what is my …" ask for a pick or a personal value, not what something is.
const DEFINE_ASK = /\b(?:what(?:'s| is| are)|define)\s+(?!(?:the |a |an )?(?:best|better|worst|right|ideal|optimal|most|good|difference|point|purpose|dose|dosage|amount|reason|benefits?|evidence|deal|plan|way|time|my|your|our|there|wrong|going on|happening|left|next)\b)\S/i;
const UNKNOWN_LINE = /can(?:not|'t) (?:confidently )?identify|won'?t guess|không thể xác định|chưa thể xác định/i;
// An evidence ASSESSMENT, not just an evidence word: "mixed into water", "a limited budget", "studied hard" are not one.
const EVIDENCE_LINE = /not (?:(?:well|firmly|clearly|yet|fully|strongly|reliably)[- ])?(?:established|proven|supported)|no (?:[a-z]+ )?(?:evidence|benefit is established)|well[- ]supported|(?:limited|insufficient|mixed|weak|strong|good|moderate|solid|consistent|little|some) (?:evidence|data|research|support|studies|results|findings)|(?:evidence|research|data|results|findings|support)(?: (?:for|on|behind|about) [^.!?]{1,60}?)? (?:is|are|was|were|remains?) (?:limited|insufficient|mixed|weak|strong|thin|inconsistent|unclear|moderate|solid)|(?:has|have) been studied|(?:studies|trials|research) (?:show|shows|suggest|suggests|found|find)|không thể nói|hạn chế|won'?t rank|cannot rank|could not finish|no matching source/i;
const COMPARE_LINE = /\b(?:compar\w*|versus|\bvs\b|than|while|whereas|so với|không thể so)\b/i;

/** Question classes for this repair. A turn may carry more than one. Dose and safety stay with the existing screen. */
export function deriveObligations(message: string): AnswerObligation[] {
  const kinds: AnswerObligation[] = [];
  if (DEFINE_ASK.test(message) || (/(?:là gì|la gi)/iu.test(message) && !/tốt nhất|nên|bao nhiêu/iu.test(message))) kinds.push("DEFINE");
  if (/\b(?:compare\w*|versus|\bvs\b|better than)\b/i.test(message) || /so sánh/iu.test(message)) kinds.push("COMPARE");
  if (/\b(?:does|do|proven|evidence|effective|build muscle|improve\w*|better than|có tốt|có hiệu quả)\b/i.test(message)) kinds.push("ASSESS_EVIDENCE");
  return kinds;
}

export function obligationDisposition(kind: AnswerObligation, reply: string, brief: IntelligenceBrief, question?: string): ObligationDisposition | null {
  const unknown = brief.knowledge.entityStatus === "UNKNOWN_ENTITY" || (brief.knowledge.unresolvedEntities?.length ?? 0) > 0;
  if (kind === "DEFINE") {
    if (unknown && UNKNOWN_LINE.test(reply)) return "NEEDS_CLARIFICATION";
    if (!unknown && defined(reply, brief, question)) return "ANSWERED";
    if (UNKNOWN_LINE.test(reply)) return unknown ? "NEEDS_CLARIFICATION" : "UNAVAILABLE";
    return null;
  }
  if (kind === "COMPARE") {
    if (unknown && UNKNOWN_LINE.test(reply)) return "NEEDS_CLARIFICATION";
    if (COMPARE_LINE.test(reply) || EVIDENCE_LINE.test(reply)) return "ANSWERED";
    return null;
  }
  if (EVIDENCE_LINE.test(reply)) return "ANSWERED";
  // Grading a hormonal/drug product's performance evidence is never coaching's call, whatever the turn's posture.
  if (brief.posture.decision === "HARD_STOP" || brief.posture.decision === "MEDICAL_ESCALATION" || brief.knowledge.gaps.some((gap) => gap.boundary === "PED_DRUG")) return "OUTSIDE_AUTHORITY";
  return null;
}

const SUBSTANCE_REFUSAL: Record<"en" | "vi", Record<RestrictedSubstanceUse, string>> = {
  en: {
    USE_OPTIMIZATION: "I won't give doses, cycles, stacks or instructions for using it, or rank what works best: without medical supervision that guidance can cause serious harm.",
    SOURCING: "I won't help with where to buy or source it.",
    EVASION: "I won't help with avoiding detection or drug testing.",
  },
  vi: {
    USE_OPTIMIZATION: "Mình sẽ không đưa liều, chu kỳ, cách phối hợp hay hướng dẫn sử dụng, cũng không xếp hạng loại nào hiệu quả hơn: ngoài sự theo dõi y tế, hướng dẫn kiểu đó có thể gây hại nghiêm trọng.",
    SOURCING: "Mình sẽ không giúp tìm nơi mua hay nguồn hàng.",
    EVASION: "Mình sẽ không giúp né phát hiện hay qua mặt xét nghiệm doping.",
  },
};
const SUBSTANCE_SYMPTOM_LEAD = {
  en: "What you're describing while using it needs a medical check soon: stop taking it and tell the doctor exactly what you used; if it is severe or getting worse, get urgent care.",
  vi: "Điều bạn mô tả trong lúc đang dùng cần được khám y tế sớm: hãy ngừng dùng và nói rõ với bác sĩ bạn đã dùng gì; nếu triệu chứng nặng hoặc đang xấu đi, hãy đi cấp cứu.",
};
const SUBSTANCE_CONTINUATION = {
  en: "What I can do instead: explain how it works and what its risks and warning signs are. I can also help you reach the same goal with training and nutrition. If you're already using it, I can talk through stopping and what to tell a doctor.",
  vi: "Thay vào đó mình có thể giải thích nó hoạt động thế nào, rủi ro và dấu hiệu cảnh báo của nó. Mình cũng có thể giúp bạn đạt cùng mục tiêu bằng tập luyện và dinh dưỡng. Nếu bạn đang dùng, mình có thể bàn cách ngừng và nên nói gì với bác sĩ.",
};

/**
 * TARGETED REFUSAL for a hormonal/drug-product turn whose ask is restricted (dose, cycle, stack, use, sourcing, evasion).
 * Safety restricts obligations, it never erases the safe ones: a DEFINE in the same message is answered first from the
 * grounded identity, then only the restricted part is refused, then usable help. null = nothing restricted.
 */
export function restrictedSubstanceReply(message: string, brief: IntelligenceBrief, language: "en" | "vi"): string | null {
  const intent = brief.posture.substanceIntent;
  if (!intent || intent.restricted.length === 0) return null;
  const target = deriveObligations(message).includes("DEFINE") ? primaryTarget(message, brief) : undefined;
  // H0 cluster B: the refusal names what was actually asked (support stack, liver protocol, training, PCT…) and the
  // continuation is the safe help for THAT ask. A plain dose / cycle ask keeps the original copy.
  const facets = (intent.facets ?? []).filter((facet) => facet !== "DOSING");
  const lead = facets[0];
  const refusal = [
    ...(intent.facets?.includes("DOSING") || facets.length === 0 ? [SUBSTANCE_REFUSAL[language].USE_OPTIMIZATION] : []),
    ...facets.map((facet) => FACET_REFUSAL[language][facet]),
  ].filter((line, index, all) => all.indexOf(line) === index);
  const useRefusal = intent.restricted.includes("USE_OPTIMIZATION") ? refusal : [];
  const insulin = /\binsulin\b/.test(fold(message)) || (brief.context?.facts ?? []).some((fact) => fact.status === "ACTIVE" && fact.kind === "PED_USE" && /insulin/.test(fact.label));
  return [
    intent.symptom ? SUBSTANCE_SYMPTOM_LEAD[language] : null,
    /\b(?:dnp|dinitrophenol)\b/i.test(fold(message)) ? DNP_FACT[language] : null,
    // A DEFINE asked in the same message is answered first; the insulin safety line follows the identity.
    target?.identity?.[language] ?? null,
    insulin ? INSULIN_LEAD[language] : null,
    [...useRefusal, ...intent.restricted.filter((use) => use !== "USE_OPTIMIZATION").map((use) => SUBSTANCE_REFUSAL[language][use])].join(" "),
    // Gemma speaks for herself: the nutrition continuation names her only when Dante is speaking.
    (lead === "NUTRITION" && brief.coach === "GEMMA" ? GEMMA_NUTRITION[language] : lead && FACET_CONTINUATION[language][lead]) ?? SUBSTANCE_CONTINUATION[language],
  ].filter(Boolean).join("\n\n");
}

const INSULIN_LEAD = {
  en: "Insulin taken to build muscle can drop blood sugar dangerously, and it has killed people. If you feel shaky, sweaty, confused or faint, take fast sugar now and don't stay alone; if you're confused or can't keep sugar down, call emergency services.",
  vi: "Dùng insulin để tăng cơ có thể làm hạ đường huyết nguy hiểm, và đã có người tử vong vì việc này. Nếu thấy run, vã mồ hôi, lú lẫn hay muốn ngất, uống ngay đồ ngọt hấp thu nhanh và đừng ở một mình; nếu lú lẫn hoặc không nuốt được, gọi cấp cứu.",
};

const DNP_FACT = {
  en: "DNP (2,4-dinitrophenol) is an industrial chemical, not a medicine or supplement. It has killed people who thought they were being careful with the dose: there is no safe dose.",
  vi: "DNP (2,4-dinitrophenol) là hóa chất công nghiệp, không phải thuốc hay thực phẩm bổ sung. Đã có người tử vong dù nghĩ mình dùng liều cẩn thận: không có liều nào an toàn.",
};

// Two separate sentences: the warning signs (usable on their own) and the monitoring (the one doctor line of the reply).
const WARNING_SIGNS = {
  en: "Warning signs that need urgent care: chest pain, a severe headache, shortness of breath, yellow skin or eyes, or dark urine.",
  vi: "Dấu hiệu cần đi cấp cứu: đau ngực, đau đầu dữ dội, khó thở, vàng da hoặc vàng mắt, hay nước tiểu sẫm màu.",
};
const MONITORING = {
  en: "Regular blood tests — blood pressure, lipids, liver, red-cell count and hormones — are what actually show how your body is coping, and a doctor will run them confidentially.",
  vi: "Xét nghiệm máu định kỳ — huyết áp, mỡ máu, gan, hồng cầu và hormone — mới thực sự cho biết cơ thể đang chịu đựng thế nào, và bác sĩ sẽ làm việc này kín đáo.",
};

const FACET_REFUSAL: Record<"en" | "vi", Record<Exclude<OptimizationFacet, "DOSING">, string>> = {
  en: {
    SUPPORT_SUPPLEMENTS: "I won't recommend 'support' or on-cycle supplements: no supplement makes it safe, and taking them can make it feel safer than it is.",
    ORGAN_PROTECTION: "I won't give a liver, heart or organ-protection protocol for while you're using: no supplement or trick keeps those organs safe.",
    SIDE_EFFECTS: "I won't give a plan for managing side effects while using, including AIs or other ancillary drugs: a side effect is a reason to get checked, not to add another drug.",
    TRAINING: "I won't adjust your training to get more out of steroids — programming around the drug is optimising its use.",
    NUTRITION: "I won't build a diet around the drug — eating to get more out of it is optimising its use.",
    PCT: "I won't give a PCT protocol (SERMs, hCG, AIs or doses): those are prescription drugs, and getting your own hormones working again is medical work — an endocrinologist or a men's-health clinic can do it confidentially.",
    GENERAL: "I won't coach a cycle or help you get more out of it.",
  },
  vi: {
    SUPPORT_SUPPLEMENTS: "Mình sẽ không gợi ý thực phẩm bổ sung 'hỗ trợ' trong lúc chạy cycle: không loại nào làm việc đó an toàn hơn, và dùng chúng dễ tạo cảm giác an toàn giả.",
    ORGAN_PROTECTION: "Mình sẽ không đưa phác đồ bảo vệ gan, tim hay nội tạng trong lúc đang dùng: không có thực phẩm bổ sung hay mẹo nào giữ các cơ quan đó an toàn.",
    SIDE_EFFECTS: "Mình sẽ không đưa kế hoạch xử lý tác dụng phụ trong lúc đang dùng, kể cả AI hay các thuốc đi kèm: tác dụng phụ là lý do để đi khám, không phải để thêm thuốc.",
    TRAINING: "Mình sẽ không chỉnh giáo án để tận dụng steroid — xây giáo án quanh thuốc chính là tối ưu việc dùng thuốc.",
    NUTRITION: "Mình sẽ không xây chế độ ăn quanh thuốc — ăn để tận dụng thuốc chính là tối ưu việc dùng thuốc.",
    PCT: "Mình sẽ không đưa phác đồ PCT (SERM, hCG, AI hay liều): đó là thuốc kê đơn, và việc để cơ thể tự tiết hormone lại là việc y khoa — bác sĩ nội tiết hoặc phòng khám nam khoa có thể làm việc này kín đáo.",
    GENERAL: "Mình sẽ không hướng dẫn chạy cycle hay giúp tận dụng nó.",
  },
};

const PROTECT = {
  en: `${WARNING_SIGNS.en} ${MONITORING.en} Stopping is always an option, and I can help you plan that conversation whenever you want.`,
  vi: `${WARNING_SIGNS.vi} ${MONITORING.vi} Ngừng luôn là một lựa chọn, và mình có thể cùng chuẩn bị nên nói gì khi đi khám.`,
};

const GEMMA_NUTRITION = {
  en: `Healthy eating for your goal is the same for you as for anyone, and I can set that up from your goal rather than from the drug. ${WARNING_SIGNS.en} ${MONITORING.en}`,
  vi: `Ăn uống lành mạnh theo mục tiêu thì vẫn như mọi người, và mình có thể lên kế hoạch theo mục tiêu tập luyện chứ không theo thuốc. ${WARNING_SIGNS.vi} ${MONITORING.vi}`,
};

const FACET_CONTINUATION: Record<"en" | "vi", Partial<Record<OptimizationFacet, string>>> = {
  en: {
    SUPPORT_SUPPLEMENTS: PROTECT.en,
    ORGAN_PROTECTION: PROTECT.en,
    SIDE_EFFECTS: PROTECT.en,
    TRAINING: `What doesn't change: the training principles are the same for you as for anyone — progressive overload and enough recovery — and I can help with those. ${WARNING_SIGNS.en} ${MONITORING.en}`,
    NUTRITION: `Healthy eating for your goal is the same for you as for anyone, and Gemma, the nutrition coach, can set targets from your goal rather than from the drug. ${WARNING_SIGNS.en} ${MONITORING.en}`,
    PCT: "What I can help with: what to tell them — what you used, how much and for how long, honestly. Symptoms worth mentioning after stopping are low mood, low libido and fatigue, and meanwhile I can keep your training and food steady.",
    GENERAL: `What I'd actually do in your position: get regular blood tests — blood pressure, lipids, liver, red-cell count and hormones — which a doctor will run confidentially. ${WARNING_SIGNS.en} Stopping is always an option, and for training and food the usual principles apply, so I can help with those.`,
  },
  vi: {
    SUPPORT_SUPPLEMENTS: PROTECT.vi,
    ORGAN_PROTECTION: PROTECT.vi,
    SIDE_EFFECTS: PROTECT.vi,
    TRAINING: `Điều không đổi: nguyên tắc tập vẫn như mọi người — tăng tải dần và phục hồi đủ — và mình giúp được phần đó. ${WARNING_SIGNS.vi} ${MONITORING.vi}`,
    NUTRITION: `Ăn uống lành mạnh theo mục tiêu thì vẫn như mọi người, và Gemma — coach dinh dưỡng — có thể đặt chỉ tiêu theo mục tiêu tập luyện chứ không theo thuốc. ${WARNING_SIGNS.vi} ${MONITORING.vi}`,
    PCT: "Mình giúp được: nên nói gì khi đi khám — đã dùng gì, bao nhiêu, bao lâu, thật lòng. Các triệu chứng nên báo sau khi ngừng là tâm trạng xuống, giảm ham muốn và mệt mỏi, và trong lúc chờ mình có thể giúp giữ tập luyện, ăn uống ổn định.",
    GENERAL: `Nếu là mình, mình sẽ làm thế này: xét nghiệm máu định kỳ — huyết áp, mỡ máu, gan, hồng cầu và hormone — bác sĩ sẽ làm việc này kín đáo. ${WARNING_SIGNS.vi} Ngừng luôn là một lựa chọn, còn tập luyện và ăn uống thì nguyên tắc chung vẫn áp dụng, mình giúp được phần đó.`,
  },
};

/* ---------- DEFINE: identity grounding ---------- */

type DefineTarget = { topic: string; terms: string[]; identity?: Identity };

const termPattern = (term: string, flags = "") => new RegExp(`(?<![a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, flags);

/** The phrase a DEFINE question asks about, folded ("what is a sleep aid" → "sleep aid"). */
function askedPhrase(question: string): string | undefined {
  const folded = fold(question);
  return folded.match(/(?:what(?:'s| is| are)|define)\s+(?:an?\s+|the\s+)?([a-z0-9][a-z0-9 -]{1,40}?)(?:\s+(?:exactly|really|actually))?\s*(?:[?.!,]|$)/)?.[1]
    ?? folded.match(/([a-z0-9][a-z0-9 -]{1,40}?)\s+la gi/)?.[1];
}

/**
 * Entities a DEFINE answer can be about: only those the question names by alias, bound on those aliases. A topic
 * retrieval reached through a related tag is never a target, so its identity can never stand in for the asked term.
 */
function defineTargets(brief: IntelligenceBrief, question?: string): DefineTarget[] {
  const targets: DefineTarget[] = (brief.knowledge.identityMatches ?? []).map((entity) => ({ topic: entity.topic, terms: entity.aliases ?? [], identity: entity.identity }));
  const asked = question && targets.length === 0 ? askedPhrase(question) : undefined;
  // Off-registry concept ("what is periodization"): bind on the asked-about phrase itself.
  if (asked) targets.push({ topic: asked, terms: [...new Set([asked, asked.split(" ").at(-1)!])] });
  return targets;
}

// The subject is the named entity, not the object of "evidence for X" / "whether X".
const OBJECT_OF = /(?:^|[^a-z0-9])(?:for|on|about|of|behind|regarding|whether|that|if|ve|cua|cho)\s+$/;
const COPULA = /^[^.;!?]{0,60}?(?<![a-z0-9])(?:is|are|la|means|refers to|stands for|nghia la)(?![a-z0-9])\s*(.*)$/;
// A predicate that only grades, hedges, locates or recommends the thing does not say what it is.
const NOT_IDENTITY = /^(?:(?:a|an|the|mot|cac|nhung)\s+)?(?:not|no|unclear|uncertain|unknown|limited|mixed|insufficient|weak|strong|solid|robust|clear|consistent|still|currently|generally|usually|often|sometimes|widely|commonly|thought|believed|considered|claimed|likely|unlikely|possibly|probably|safe|unsafe|effective|ineffective|popular|available|used|sold|marketed|studied|researched|found|present|added|taken|included|being|best|worth|helpful|useful|important|needed|necessary|recommended|good|great|fine|okay|ok|one of|also|in|for|at|on|from|with|by|about|gi|chua|khong|han che|co the|duoc)(?![a-z0-9])/;
const EVIDENCE_TALK = /(?<![a-z0-9])(?:evidence|research|stud(?:y|ies|ied)|trials?|doctor|pharmacist|physician|healthcare|registry|bang chung|nghien cuu|bac si|duoc si)(?![a-z0-9])/;
const GENERIC_HEAD = /^(?:(?:a|an|the|mot)\s+)?(?:[a-z-]+\s+)?(?:supplements?|products?|options?|things?|choices?|topics?|concepts?|thuc pham bo sung|san pham)$/;

function identityPredicate(predicate: string): boolean {
  const clause = predicate.split(/[;:]|,\s*(?:but|and|so|while|though)\b|\s(?:but|although|though)\s/)[0].replace(/[.!?\s]+$/, "").trim();
  return tokens(clause).length > 0 && !NOT_IDENTITY.test(clause) && !EVIDENCE_TALK.test(clause) && !GENERIC_HEAD.test(clause);
}

/**
 * One sentence that names the target and says what it is: TARGET + identity relation + descriptive predicate.
 * "The evidence is limited", "It may help", "Ask a doctor" carry a copula but no identity.
 * ponytail: sentence-level pattern, not a parser; a bare "It is …" never binds, so fallback text always names the entity.
 */
function statesIdentity(reply: string, terms: string[]): boolean {
  return sentences(reply).some((sentence) => {
    const folded = fold(sentence);
    return terms.some((term) => [...folded.matchAll(termPattern(term, "g"))].some((hit) => {
      if (OBJECT_OF.test(folded.slice(Math.max(0, hit.index - 14), hit.index))) return false;
      const copula = folded.slice(hit.index + hit[0].length).match(COPULA);
      return Boolean(copula && identityPredicate(copula[1]));
    }));
  });
}

/** DEFINE is answered only by an identity proposition about a target whose identity is not ABSENT. */
function defined(reply: string, brief: IntelligenceBrief, question?: string): boolean {
  if (brief.knowledge.identityGrounding === "ABSENT") return false;
  const targets = defineTargets(brief, question);
  if (targets.length === 0) return LOOSE_IDENTITY.test(reply) && !/doctor|pharmacist|bác sĩ|dược sĩ/i.test(reply);
  return targets.some((target) => statesIdentity(reply, target.terms));
}

/** The entity the question names first; registry order breaks ties. */
function primaryTarget(question: string, brief: IntelligenceBrief): DefineTarget | undefined {
  const folded = fold(question);
  const position = (target: DefineTarget) => Math.min(Infinity, ...target.terms.map((term) => {
    const at = folded.search(termPattern(term));
    return at < 0 ? Infinity : at;
  }));
  return defineTargets(brief, question).sort((a, b) => position(a) - position(b))[0];
}

/** Registry self-check: an authored identity must itself satisfy DEFINE for its own entity. */
export function identitySatisfiesDefine(identity: string, brief: IntelligenceBrief): boolean {
  return defined(identity, brief);
}

/** How many required obligations already have a disposition. */
export function obligationScore(reply: string, message: string, brief: IntelligenceBrief): number {
  return deriveObligations(message).filter((kind) => obligationDisposition(kind, reply, brief, message) !== null).length;
}

export function acceptIntegrityRetry(input: {
  previousViolations: number;
  nextViolations: number;
  nextHasNewCode: boolean;
  previousCompleteness: number;
  nextCompleteness: number;
}): boolean {
  if (input.nextHasNewCode) return false;
  if (input.nextCompleteness < input.previousCompleteness) return false;
  if (input.nextViolations < input.previousViolations) return true;
  return input.nextViolations === input.previousViolations && input.nextCompleteness > input.previousCompleteness;
}

function vietnamese(message: string): boolean {
  return /[ăâđêôơưàáạảãằắ]/iu.test(message) || /(?:là gì|so sánh)/iu.test(message);
}

/**
 * Fills a missing disposition without inventing a benefit. Unknown products lose a model-written identity.
 * A disclaimer alone does not satisfy DEFINE.
 */
export function completeObligations(reply: string, message: string, brief: IntelligenceBrief): { reply: string; missing: AnswerObligation[] } {
  let text = reply;
  const unknown = brief.knowledge.entityStatus === "UNKNOWN_ENTITY";
  if (unknown) {
    text = text
      .split(/(?<=[.!?…])\s+|\n+/)
      .filter((sentence) => !/\b(?:is|are)\s+(?:a|an|the)\b|(?<!\p{L})là một(?!\p{L})/iu.test(sentence) || UNKNOWN_LINE.test(sentence))
      .join(" ")
      .trim();
  } else if ((brief.knowledge.unresolvedEntities?.length ?? 0) > 0) {
    text = text
      .split(/(?<=[.!?…])\s+|\n+/)
      .filter((sentence) => !/\b(?:better|worse|superior)\b/i.test(sentence))
      .join(" ")
      .trim();
  }
  const additions: string[] = [];
  const vi = vietnamese(message);
  const unresolved = brief.knowledge.unresolvedEntities ?? [];
  const namedRecords = brief.knowledge.records.filter((record) => record.id !== "supplement-principles");
  const topic = brief.knowledge.gaps[0]?.topic ?? namedRecords[0]?.topic;
  const gapWithoutRecord = brief.knowledge.gaps.length > 0 && namedRecords.length === 0;
  const target = unknown ? undefined : primaryTarget(message, brief);
  for (const kind of deriveObligations(message)) {
    if (obligationDisposition(kind, text, brief, message)) continue;
    if (kind === "DEFINE" && unknown) {
      additions.push(vi
        ? `Mình không thể xác định "${unresolved[0] ?? topic ?? "sản phẩm này"}". Mình sẽ không đoán nó là gì.`
        : `I can't confidently identify "${unresolved[0] ?? topic ?? "this product"}", so I won't guess what it is.`);
    } else if (kind === "DEFINE" && target?.identity) {
      // A grounded identity leads; whatever evidence caveat the draft carries stays after it.
      text = [vi ? target.identity.vi : target.identity.en, text].filter(Boolean).join("\n\n");
    } else if (kind === "DEFINE" && (target?.topic ?? topic)) {
      // target is the asked phrase when no alias matched, so a neighbouring topic retrieval reached is never named here.
      const asked = target?.topic ?? (brief.knowledge.entityStatus === "RELATED_TOPIC" ? (vi ? "thuật ngữ này" : "that term") : topic);
      additions.push(vi
        ? `Mình không thể xác định ${asked} là gì từ nguồn đang có, nên sẽ không đoán.`
        : `I can't confirm what ${asked} is from the sources I can check, so I won't guess.`);
    } else if (kind === "COMPARE" && (unknown || unresolved.length > 0)) {
      additions.push(vi
        ? `Mình không thể xác định ${unresolved[0] ?? "sản phẩm kia"}, nên không so sánh được.`
        : `I can't confidently identify ${unresolved[0] ?? "that product"}, so I can't compare it.`);
    } else if (kind === "COMPARE" && brief.knowledge.gaps.length > 0) {
      const names = [...brief.knowledge.records.map((record) => record.topic), ...brief.knowledge.gaps.map((gap) => gap.topic)];
      additions.push(`I won't rank ${names.join(" and ") || "these"} on a benefit that isn't established for each of them.`);
    } else if (kind === "ASSESS_EVIDENCE" && (unknown || brief.knowledge.retrievalStatus === "FAILED" || gapWithoutRecord)) {
      additions.push(brief.knowledge.retrievalStatus === "FAILED"
        ? "I could not finish the evidence check, so a benefit is not established from this turn."
        : "A benefit is not established in what I can check.");
    }
  }
  if (additions.length > 0) text = [text, ...additions].filter(Boolean).join("\n\n");
  text = calibrateEvidenceWording(text, brief);
  const missing = deriveObligations(message).filter((kind) => obligationDisposition(kind, text, brief, message) === null);
  return { reply: text, missing };
}

/** NO_MATCH and FAILED must not be worded as "there is no evidence". */
export function calibrateEvidenceWording(reply: string, brief: IntelligenceBrief): string {
  const failed = brief.knowledge.retrievalStatus === "FAILED";
  const noMatch = brief.knowledge.coverage === "NO_MATCH_IN_SEARCHED_CORPUS";
  if (!failed && !noMatch) return reply;
  // The whole sentence is replaced: splicing a phrase into "there is no evidence X helps" leaves broken grammar.
  const replacement = failed
    ? "I could not finish the evidence check, so I can't say either way."
    : "No matching source was found in the sources I searched — that isn't proof that no evidence exists.";
  return reply
    .split("\n")
    .map((line) => line.replace(/[^.!?\n]*\bthere(?: is|'s) no (?:scientific )?evidence\b[^.!?\n]*[.!?]?/gi, (match) => `${match.match(/^\s*/)?.[0] ?? ""}${replacement}`))
    .join("\n");
}

/* ---------- structured candidate delivery: DECISION DATA → ITEM ARRAY → DETERMINISTIC RENDERER ---------- */

type Lang = "en" | "vi";
type Tier = CandidatePriority["tier"];

const TIER_HEADING: Record<Lang, Record<Tier, string>> = {
  en: { HIGH_UTILITY: "High priority (still optional)", CONDITIONAL: "Depends on your situation", NOT_ASSESSED: "Needs more context", LOW_VALUE: "Low priority — usually skip", OUTSIDE_SCOPE: "Outside what I can advise on" },
  vi: { HIGH_UTILITY: "Ưu tiên cao (vẫn không bắt buộc)", CONDITIONAL: "Tùy tình huống của bạn", NOT_ASSESSED: "Cần thêm thông tin", LOW_VALUE: "Ưu tiên thấp — thường có thể bỏ qua", OUTSIDE_SCOPE: "Nằm ngoài phạm vi mình tư vấn" },
};
const RENDER_ORDER: Tier[] = ["HIGH_UTILITY", "CONDITIONAL", "NOT_ASSESSED", "LOW_VALUE", "OUTSIDE_SCOPE"];

// policy.ts MOVES phrases (English) → Vietnamese, so a VI answer never carries English condition text.
const MOVE_VI: Record<string, string> = {
  "protein is below target and hard to reach from food": "protein dưới mục tiêu và khó đủ từ thức ăn",
  "protein target already met from food": "đã đủ protein từ thức ăn",
  "oily fish is rarely eaten": "hiếm khi ăn cá béo",
  "oily fish about twice a week or more": "ăn cá béo khoảng 2 lần/tuần trở lên",
  "the diet is restricted or low in variety": "chế độ ăn bị hạn chế hoặc kém đa dạng",
  "the diet is varied": "chế độ ăn đa dạng",
  "a blood test shows low status": "xét nghiệm máu cho thấy thiếu",
  "a blood test is normal": "xét nghiệm máu bình thường",
  "sessions are long, hot or very sweaty": "buổi tập dài, nóng hoặc ra nhiều mồ hôi",
  "sessions are short and cool": "buổi tập ngắn và mát",
  "sleep is good and caffeine is low": "ngủ tốt và ít caffeine",
  "sleep is poor or caffeine is already high": "ngủ kém hoặc đã dùng nhiều caffeine",
  "total protein can't be met from food or a protein powder": "không thể đủ protein từ thức ăn hoặc bột protein",
  "the goal is not strength, power or muscle gain": "mục tiêu không phải sức mạnh hay tăng cơ",
};

/** One plain reason per candidate, from its reason tokens. Never a claim beyond the token. */
function reasonPhrase(priority: CandidatePriority, decision: CandidateDecision, language: Lang): string | null {
  const vi = language === "vi";
  for (const reason of priority.reasons) {
    const [head, arg] = reason.split(":");
    if (head === "subset_of") {
      const superset = decision.request.candidates.find((candidate) => candidate.entity === arg);
      const name = displayLabel(superset?.label ?? arg, superset?.entity ?? arg);
      return vi ? `phiên bản hẹp hơn của ${name}` : `a narrower version of ${name}`;
    }
    if (head === "redundant_with_adequate_complete_protein") return vi ? "thêm rất ít khi tổng protein đã đủ" : "adds little once total protein is covered";
    if (head === "fix_total_protein_first") return vi ? "ưu tiên đủ tổng protein trước" : "fix total protein first";
    if (head === "not_needed" || head === "intake_likely_adequate") return vi ? "nhu cầu có vẻ đã được đáp ứng" : "the need looks already covered";
    if (head === "lab_dependent_do_not_assume_deficiency") return vi ? "chỉ khi xét nghiệm cho thấy thiếu; không mặc định là thiếu" : "only if a blood test shows low status; don't assume a deficiency";
    if (head === "strong_support_but_optional") return vi ? "bằng chứng mạnh nhất trong danh sách, vẫn không bắt buộc" : "the strongest evidence on the list, still optional";
    if (head === "outcome_specific_moderate_support") return vi ? "bằng chứng vừa phải, chỉ cho mục tiêu cụ thể" : "moderate support, for specific outcomes only";
    if (head === "minor_food_first") return vi ? "ở tuổi của bạn nên ưu tiên thức ăn" : "food first at your age";
    if (head === "possible_intake_gap") return vi ? "lượng ăn vào có thể đang thiếu" : "your intake may be short";
    if (head === "hormonal_or_drug_product_outside_coaching") return vi ? "là sản phẩm thuốc/hormone, ngoài phạm vi huấn luyện" : "a drug or hormonal product, outside coaching";
    if (head === "no_verified_evidence_any_otc_booster_works" || head === "no_verified_benefit_in_registry" || head === "no_canonical_claim_for_this_outcome" || head === "no_established_support_in_registry") {
      return vi ? "chưa có lợi ích nào được xác lập trong nguồn mình kiểm tra được" : "no benefit established in the sources I can check";
    }
    if (head === "criterion" && reason.includes("general_health")) return vi ? "là hỗ trợ hiệu suất, không phải nhu cầu sức khỏe" : "a performance aid, not a health need";
    if (head === "criterion") return vi ? "không phải đòn bẩy trực tiếp trừ khi ăn vào thiếu" : "not a direct lever unless intake is low";
    if (head === "outside_registry" || head === "related_entity_not_its_parent_product") return vi ? "không nằm trong bộ bằng chứng mình đã kiểm chứng" : "not in my verified evidence set";
  }
  return null;
}

/** The user's label, capitalised; an acronym entity (BCAA, EAA) keeps its own casing. Never "WHEY". */
function displayLabel(label: string, entity?: string | null): string {
  return entity && /^[A-Z0-9-]{2,6}$/.test(entity) ? entity : label.charAt(0).toUpperCase() + label.slice(1);
}

export type RenderedCandidate = { candidate: string; display: string; tier: Tier; reason: string | null; movesUp: string | null; movesDown: string | null };

/** The validated item array: exactly the requested candidates, in the decision's order, each with its server-owned tier. */
export function candidateItems(decision: CandidateDecision, language: Lang): RenderedCandidate[] {
  const move = (phrase: string | undefined) => (phrase ? (language === "vi" ? (MOVE_VI[phrase] ?? phrase) : phrase) : null);
  const requested = new Set(decision.request.candidates.map((candidate) => candidate.label));
  return decision.priorities
    .filter((priority) => requested.size === 0 || requested.has(priority.candidate))
    .map((priority) => ({ candidate: priority.candidate, display: displayLabel(priority.candidate, priority.entity), tier: priority.tier, reason: reasonPhrase(priority, decision, language), movesUp: move(priority.movesUp[0]), movesDown: move(priority.movesDown[0]) }));
}

/** Markdown block: stable tier order, headings, numbering 1..N across tiers only when an exact order is justified. */
export function renderCandidateBlock(decision: CandidateDecision, language: Lang): string {
  const vi = language === "vi";
  const items = candidateItems(decision, language);
  const numbered = decision.exactOrderJustified;
  const lines: string[] = [];
  if (decision.dependsOnUnknown) lines.push(vi ? "_Dựa trên những gì bạn đã cho mình biết đến giờ:_" : "_Based on what you've told me so far:_");
  if (decision.request.exactOrderRequested && !numbered) lines.push(vi ? "_Chưa đủ thông tin để xếp chính xác 1–N, nên mình nhóm theo mức ưu tiên._" : "_An exact 1–N order isn't justified with what I know, so these are grouped by priority._");
  let n = 0;
  const tiers = decision.request.criterion === "LEAST_NECESSARY" ? [...RENDER_ORDER].reverse() : RENDER_ORDER;
  for (const tier of tiers) {
    const inTier = items.filter((item) => item.tier === tier);
    if (inTier.length === 0) continue;
    lines.push("", `**${TIER_HEADING[language][tier]}**`);
    for (const item of inTier) {
      const detail = [
        item.reason,
        item.movesUp ? (vi ? `đáng cân nhắc hơn nếu ${item.movesUp}` : `more worth it if ${item.movesUp}`) : null,
        item.movesDown ? (vi ? `ít cần hơn nếu ${item.movesDown}` : `less needed if ${item.movesDown}`) : null,
      ].filter(Boolean).join("; ");
      lines.push(`${numbered ? `${++n}.` : "-"} **${item.display}**${detail ? ` — ${detail}` : ""}`);
    }
  }
  if (decision.request.task === "BUY" || decision.request.antiWaste) {
    const first = items.find((item) => item.tier === "HIGH_UTILITY");
    lines.push("", first
      ? (vi ? `Bạn không cần mua món nào trong danh sách để tiến bộ. Nếu chỉ mua một, hãy bắt đầu với ${first.display}.` : `You don't need to buy any of these to make progress. If you buy only one, start with ${first.display}.`)
      : (vi ? "Không mua món nào lúc này cũng là một lựa chọn hợp lý." : "Buying none of these right now is a reasonable choice."));
  }
  return lines.join("\n").trim();
}

const TIER_WORDS = /(?<![a-z])(?:tiers?|priority|priorities|skip|optional|worth|ranking|ranked|uu tien|bo qua)(?![a-z])/;
const STRUCTURE_LINE = /^\s*(?:\d+[.)]|[-*•]|#{1,6})\s+|^\s*\*\*[^*]{1,60}\*\*:?\s*$/;

/**
 * Candidate turns render from the decision, not from the model's list. The model's own candidate structure (list items,
 * headings naming a candidate or a tier) is dropped, a prose sentence that contradicts a tier is dropped (the block
 * restates it), and the rest of the prose is kept around the block: lead paragraph → decision → explanation.
 * Single-candidate turns keep their prose; a contradicting sentence is replaced by a one-line restatement.
 */
export function renderCandidateAnswer(reply: string, brief: IntelligenceBrief, language: Lang): string {
  const decision = brief.candidates;
  if (!decision || decision.request.candidates.length === 0 || brief.posture.decision === "HARD_STOP") return reply;
  const contradicting = new Set(tierContradictions(reply, brief).map((entry) => entry.sentence));
  if (decision.request.candidates.length === 1) {
    if (contradicting.size === 0) return reply;
    const block = renderCandidateBlock(decision, language).split("\n").filter((line) => /^(?:-|\d+\.) \*\*/.test(line)).join(" ").replace(/^(?:-|\d+\.) /, "");
    let restated = false;
    return reply.split("\n").map((line) => sentences(line).map((sentence) => {
      if (!contradicting.has(sentence)) return sentence;
      if (restated) return "";
      restated = true;
      return block;
    }).filter(Boolean).join(" ")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // Nothing assessed (exercises, foods): the model's order IS the coaching-practice ranking. Keep it; only never drop one.
  if (decision.priorities.every((priority) => priority.tier === "NOT_ASSESSED")) {
    const { missing } = candidateCompleteness(reply, decision);
    if (missing.length === 0) return reply;
    const lines = missing.map((label) => `- ${displayLabel(label)}: ${language === "vi" ? "mình chưa xếp được từ thông tin hiện có" : "I can't place it from what I know"}.`);
    return [reply, "", language === "vi" ? "Còn trong danh sách của bạn:" : "Also on your list:", ...lines].join("\n");
  }
  const terms = decision.request.candidates.flatMap((candidate) => candidate.terms);
  const prose = reply
    .split("\n")
    .filter((line) => {
      if (/^\s*(?:\d+[.)]|[-*•])\s*$/.test(line)) return false; // an empty list item
      if (!STRUCTURE_LINE.test(line)) return true;
      const folded = fold(line);
      return !terms.some((term) => hasTerm(folded, term)) && !TIER_WORDS.test(folded);
    })
    .map((line) => (sentences(line).some((sentence) => contradicting.has(sentence)) ? sentences(line).filter((sentence) => !contradicting.has(sentence)).join(" ") : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const [lead, ...rest] = prose.split(/\n{2,}/);
  return [lead, renderCandidateBlock(decision, language), ...rest].filter((part) => part && part.trim()).join("\n\n");
}

/** Model prose must not become a source section. Real sources stay on the structured message field. */
export function stripModelAuthoredSources(reply: string): string {
  const withoutSvg = reply.replace(/<svg\b[\s\S]*?<\/svg>/gi, "");
  const lines = withoutSvg.split("\n");
  const cut = lines.findIndex((line) => /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:sources?(?:\s+checked)?|references)\s*(?:\(\d+\))?(?:\*\*)?\s*:?\s*(?:\*\*)?\s*$/i.test(line.trim()));
  return (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The canonical integrity tail for ONE answer, judged only against the brief of the question it answers:
 * clinical pass → gap/dose enforcement → obligation completion → source-prose hygiene. Every claim mutation goes
 * through reviseClaimSpans inside those owners. The single-answer path passes the whole turn; a multi-obligation turn
 * calls this once per obligation with that obligation's own words and brief, so a sibling's gap cannot touch it.
 * Retry stays with the caller, which owns generation.
 */
export function applyScopedAnswerIntegrity(input: {
  draft: string;
  question: string;
  brief: IntelligenceBrief;
  language: "en" | "vi";
  /** The clinical treatment-claim pass (nutrition coach's supplementEducationReply), already bound to this question. */
  clinical?: (draft: string) => string;
}): { reply: string; missing: AnswerObligation[]; violationCodes: string[] } {
  const clinical = input.clinical ? input.clinical(input.draft) : input.draft;
  const enforced = enforceIntegrity(clinical, input.brief, input.language);
  const completed = completeObligations(enforced, input.question, input.brief);
  const reply = renderCandidateAnswer(stripModelAuthoredSources(completed.reply), input.brief, input.language);
  return { reply, missing: completed.missing, violationCodes: checkOutputIntegrity({ reply, brief: input.brief }).map((violation) => violation.code) };
}

export type AnswerTrace = {
  turnId: string;
  questionTypes: string[];
  entityStatus: string;
  identityGrounding: string;
  /** Entities the question names by alias, vs topics retrieval reached. Separate sets: related is not the same entity. */
  identityMatch: string[];
  retrievalMatch: string[];
  retrievalStatus: string;
  coverage: string;
  evidenceConclusion: string;
  /** TARGET_CLASS:outcome a pick was asked for, and whether the recommendation decision allowed one. */
  requestedOutcome: string;
  recommendation: string;
  violationCodes: string[];
  missingObligationIds: string[];
  retryCount: number;
  /** MATCHES_OR_NARROWS | NARROWED_ON_REVISION (a broadened draft was revised) | BROADENS | NOT_ASSESSED. */
  claimScopeStatus: string;
  /** Who the relevant retrieved studies were done in (TurnApplicability), NOT_ASSESSED without retrieval. */
  populationApplicability: string;
  /** On a bounded health turn: PRESENT = usable help beyond the boundary; MISSING = boundary only. NOT_APPLICABLE otherwise. */
  safeContinuationStatus: string;
  /** TASK:CRITERION of a rank / buy / skip decision, NOT_APPLICABLE otherwise. */
  candidateTask: string;
  /** INTENT_RISK of a hormonal/drug-product turn (SubstanceIntentClass), NOT_APPLICABLE otherwise. */
  safetyIntentClass: string;
  /** The restricted parts of that turn (USE_OPTIMIZATION / SOURCING / EVASION); ["NONE"] when only safe asks. */
  restrictedObligations: string[];
  /** requested/evaluated/rendered counts of the explicit candidate set, e.g. "8/8/8". */
  candidateCounts: string;
  /** PASS = every requested candidate rendered; FAIL = one is missing; NOT_APPLICABLE = no explicit set. */
  candidateCompleteness: string;
};

export function buildAnswerTrace(input: {
  turnId?: string;
  message: string;
  brief: IntelligenceBrief;
  violationCodes: string[];
  missing: string[];
  retryCount: number;
  /** The final reply, to judge safe continuation. */
  reply?: string;
  /** Codes the first draft had, before the integrity retry. */
  initialViolationCodes?: string[];
}): AnswerTrace {
  const questions = deriveObligations(input.message);
  const { brief } = input;
  const bounded = ["NEEDS_CLARIFICATION", "OUTSIDE_AUTHORITY"].includes(brief.recommendation.eligibility) || ["MEDICAL_ESCALATION", "HARD_STOP"].includes(brief.posture.decision);
  return {
    turnId: input.turnId ?? "NOT_ASSESSED",
    questionTypes: questions.length > 0 ? questions : ["NOT_APPLICABLE"],
    entityStatus: input.brief.knowledge.entityStatus ?? "NOT_ASSESSED",
    identityGrounding: input.brief.knowledge.identityGrounding ?? "NOT_ASSESSED",
    identityMatch: (input.brief.knowledge.identityMatches ?? []).map((entity) => entity.topic),
    retrievalMatch: [...input.brief.knowledge.records, ...input.brief.knowledge.gaps].map((entity) => entity.topic),
    retrievalStatus: input.brief.knowledge.retrievalStatus ?? "NOT_ASSESSED",
    coverage: input.brief.knowledge.coverage ?? "NOT_ASSESSED",
    evidenceConclusion: input.brief.knowledge.evidenceConclusion ?? "UNKNOWN",
    requestedOutcome: ((outcome) => (outcome ? `${outcome.ask === "PICK" ? outcome.targetClass : "EFFECT"}:${outcome.phrase}` : "NOT_APPLICABLE"))(input.brief.knowledge.requestedOutcome),
    recommendation: input.brief.recommendation.eligibility,
    violationCodes: input.violationCodes.length > 0 ? input.violationCodes : ["ASSESSED_NONE"],
    missingObligationIds: input.missing.length > 0 ? input.missing : ["ASSESSED_NONE"],
    retryCount: input.retryCount,
    claimScopeStatus: input.violationCodes.includes("CLAIM_SCOPE_BROADENED")
      ? "BROADENS"
      : input.initialViolationCodes?.includes("CLAIM_SCOPE_BROADENED")
        ? "NARROWED_ON_REVISION"
        : brief.knowledge.records.length > 0 ? "MATCHES_OR_NARROWS" : "NOT_ASSESSED",
    populationApplicability: brief.knowledge.populationApplicability ?? "NOT_ASSESSED",
    safeContinuationStatus: !bounded ? "NOT_APPLICABLE" : input.reply === undefined ? "NOT_ASSESSED" : safeContinuationPresent(input.reply) ? "PRESENT" : "MISSING",
    safetyIntentClass: brief.posture.substanceIntent?.intentClass ?? "NOT_APPLICABLE",
    restrictedObligations: brief.posture.substanceIntent ? (brief.posture.substanceIntent.restricted.length > 0 ? brief.posture.substanceIntent.restricted : ["NONE"]) : ["NOT_APPLICABLE"],
    ...candidateTrace(brief, input.reply),
  };
}

function candidateTrace(brief: IntelligenceBrief, reply: string | undefined): Pick<AnswerTrace, "candidateTask" | "candidateCounts" | "candidateCompleteness"> {
  const decision = brief.candidates;
  if (!decision) return { candidateTask: "NOT_APPLICABLE", candidateCounts: "NOT_APPLICABLE", candidateCompleteness: "NOT_APPLICABLE" };
  const requested = decision.request.candidates.length;
  const evaluated = decision.priorities.filter((priority) => decision.request.candidates.some((candidate) => candidate.label === priority.candidate)).length;
  const completeness = reply === undefined ? null : candidateCompleteness(reply, decision);
  return {
    candidateTask: `${decision.request.task}:${decision.request.criterion}`,
    candidateCounts: `${requested}/${evaluated}/${completeness?.rendered ?? "NOT_ASSESSED"}`,
    candidateCompleteness: requested === 0 ? "NOT_APPLICABLE" : !completeness ? "NOT_ASSESSED" : completeness.missing.length === 0 && evaluated === requested ? "PASS" : "FAIL",
  };
}
