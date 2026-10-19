import { candidateCompleteness } from "./candidates";
import { clinicallyBounded } from "./context-working-set";
import { mapSentencesKeepingLists, renumberLists, reviseClaimSpans } from "./claim-revision";
import { negativeOverclaimsIn, negativeRestatement, scopeBroadeningsIn, scopedRestatement, supportedScopeLine, type NegativeOverclaim, type ScopeBroadening } from "./claim-scope";
import { personalPickBlocked, strongestSupport } from "./policy";
import { getRecord, KNOWLEDGE_GAPS, KNOWLEDGE_RECORDS, TARGET_CLASS } from "./registry";
import { fold, hasTerm, sentences, tokens } from "./text";
import type { IntegrityViolation, IntelligenceBrief, KnowledgeGap, KnowledgeRecord } from "./types";

/**
 * Output integrity (ICH-1): does the FINAL answer stay inside what the brief allowed?
 *
 * Every check is keyed on structured state — the control decision, the option tiers, the evidence strength of the
 * records in play, the safety posture — and looks only at sentences that mention one of those records. It is not a
 * word blacklist over the whole reply. Numeric grounding and treatment claims stay with their existing owners
 * (lib/dante-core/verifier, hasUngroundedMacros, supplementEducationReply); this adds the checks nothing else made.
 *
 * ponytail: cue matching, so a claim split across two sentences can pass. Fused identity+benefit in ONE
 * sentence is repaired by reviseClaimSpans. Upgrade path is a claim extractor if leaks remain.
 */

/** The sentence denies the thing. */
const NEGATION = /(?<![a-z])(?:no|not|never|dont|don't|doesn't|isn't|aren't|won't|without|skip|unnecessary|needless|rather than|instead of|khong|chua|chang|bo qua|khoi)(?![a-z])|n't/;
/** The sentence makes the thing depend on something: a conditional mention is not a default recommendation. */
const CONDITION = /(?<![a-z])(?:unless|only if|if you|if your|if the|when your|depends|depending|neu|tuy)(?![a-z])/;
const RECOMMEND = /(?<![a-z])(?:recommend|suggest|take|taking|add|adding|use|using|try|go with|start|consider|stack|worth|great|good choice|solid|helps?|nen (?:dung|uong|thu)|hay (?:dung|uong|thu)|uong|bo sung)(?![a-z])/;
const NECESSITY = /(?<![a-z])(?:must(?:-have)?|need to take|have to take|essential|required|mandatory|necessary|can't progress without|a must|bat buoc|phai (?:dung|uong)|can phai|khong the thieu)(?![a-z])/;
const CERTAINTY = /(?<![a-z])(?:proven|guaranteed?|definitely|certainly|without (?:a )?doubt|always works?|scientifically proven|100%|chac chan|dam bao|da duoc chung minh)(?![a-z])/;
/** An effect asserted as real. Hedging ("may help", "studied for", "associated with") is still a claim. Negation is the exemption. */
const BENEFIT = /(?<![a-z])(?:helps?|helped|helping|protect\w*|improv\w*|reduc\w*|support\w*|boost\w*|enhanc\w*|promot\w*|beneficial|shown promise|promising|effective|works|role in|associated with|linked to|studied for|may help|can support|build\w* (?:muscle|strength)|ho tro|cai thien|giup|tang cuong|bao ve|hieu qua|tang co)(?![a-z])/;
/** What comes before any supplement: diet, training, sleep. */
const FOUNDATION = /(?<![a-z])(?:food|diet|eating|eat|meals?|nutrition|training|train|sleep|an uong|che do an|bua an|tap luyen|giac ngu|ngu du)(?![a-z])/;
/** A pick stated as THE answer: "the best supplement is", "your top pick", "#1". A list of options with limits is not one. */
const WINNER = /(?<![a-z])(?:(?:the|my|your|a) (?:single )?(?:best|top|number one|go-to) (?:pick|choice|option|supplement|bet|exercise|food|one)|(?:is|are) (?:the )?(?:best|top pick|way to go)(?! (?:evidence|studied|researched|source))|top pick|first choice|i(?:'d| would)? recommend)(?![a-z])|#1(?![0-9])/;
const DOSE = /\d+(?:[.,]\d+)?\s*(?:-|–|to)?\s*(?:\d+(?:[.,]\d+)?\s*)?(?:mg|mcg|µg|iu|g|grams?|gam)(?:\s*\/\s*kg|\s+per\s+kg)?(?![a-z])/;
const PRECLINICAL_FRAME = /(?<![a-z])(?:in (?:mice|rats|rodents|animals?)|(?:mouse|rat|rodent|animal|cell|preclinical|in vitro) (?:studies|study|models?|research|experiments?|data)|preclinical|in vitro|tren chuot|tren dong vat)(?![a-z])/;
const HUMAN_FRAME = /(?<![a-z])(?:humans?|people|patients|adults|participants|you|your|tren nguoi)(?![a-z])/;
const VI_MARK =/[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;

function mentions(foldedSentence: string, record: KnowledgeRecord): boolean {
  return record.retrievalTags.some((tag) => hasTerm(foldedSentence, tag));
}

/** Share of words carrying a Vietnamese-only letter. A food name or two inside an English reply stays under the bar. */
function vietnameseShare(reply: string): number {
  const words = reply.split(/\s+/).filter((word) => /\p{L}/u.test(word));
  return words.length === 0 ? 0 : words.filter((word) => VI_MARK.test(word)).length / words.length;
}

/** The gap a sentence asserts an effect for, if any. A pronoun sentence ("It may help…") refers to the gap under discussion. */
function unverifiedBenefitIn(sentence: string, gaps: readonly KnowledgeGap[]): KnowledgeGap | null {
  const folded = fold(sentence);
  if (NEGATION.test(folded) || !BENEFIT.test(folded)) return null;
  // A finding explicitly labelled as animal or cell work is preclinical background, not a benefit claimed for people.
  if (PRECLINICAL_FRAME.test(folded) && !HUMAN_FRAME.test(folded)) return null;
  return gaps.find((entry) => entry.retrievalTags.some((tag) => hasTerm(folded, tag))) ?? (/(?<![a-z])(?:it|this|that|they|chung)(?![a-z])/.test(folded) ? gaps[0] : null);
}

/** Broadenings across the reply, judged against the turn's in-scope records only. */
function scopeBroadenings(reply: string, brief: IntelligenceBrief): ScopeBroadening[] {
  if (brief.knowledge.records.length === 0) return [];
  return sentences(reply).flatMap((sentence) => scopeBroadeningsIn(sentence, brief.knowledge.records));
}

function negativeOverclaims(reply: string, brief: IntelligenceBrief): NegativeOverclaim[] {
  return sentences(reply).flatMap((sentence) => negativeOverclaimsIn(sentence, brief.knowledge.records, brief.knowledge.gaps));
}

/** Each unsupported negative sentence → its calibrated restatement (once per entity); every other sentence untouched. */
function calibrateNegativeClaims(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  if (negativeOverclaims(reply, brief).length === 0) return reply;
  const said = new Set<string>();
  return reply
    .split("\n")
    .map((line) => {
      const parts = sentences(line);
      if (!parts.some((sentence) => negativeOverclaimsIn(sentence, brief.knowledge.records, brief.knowledge.gaps).length > 0)) return line;
      const marker = line.match(/^\s*(?:[-*•]|\d+[.)])\s+/)?.[0] ?? "";
      return marker + parts.flatMap((sentence) => {
        const found = negativeOverclaimsIn(sentence, brief.knowledge.records, brief.knowledge.gaps);
        if (found.length === 0) return [sentence];
        const restated = found.map((overclaim) => negativeRestatement(overclaim, language)).filter((text) => !said.has(text));
        restated.forEach((text) => said.add(text));
        return restated;
      }).join(" ").replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Bulleted / numbered items at a line start, plus numbered bold items run inline ("… 2. **Wall angels**"). */
/** Exercises that load a site. For a DIAGNOSED structural injury these wait for clinical clearance (H0 cluster A). */
const SITE_LOADING: Record<string, RegExp> = {
  shoulder: /(?<![a-z])(?:bench\w*|(?:chest|shoulder|overhead|incline|decline|floor|machine|dumbbell|db|landmine|military|arnold|cable|smith|svend) press\w*|overhead (?:\w+ )?(?:extensions?|raises?|carr(?:y|ies)|squats?|holds?|lifts?|work)|push-?ups?|fly|flyes?|flies|crossovers?|pec deck|dips?|pullovers?|pull-?ups?|chin-?ups?|lat pulldowns?|rows?|(?:lateral|front)(?: \w+)? raises?|ohp|upright rows?)(?![a-z])/,
  knee: /(?<![a-z])(?:squats?|lunges?|leg press|leg extensions?|jump\w*|step-?ups?|split squats?|box jumps?|sprints?|running)(?![a-z])/,
  "lower back": /(?<![a-z])(?:deadlifts?|rdls?|romanian deadlifts?|good mornings?|bent-?over rows?|back squats?|squats?|back extensions?|cleans?|snatch\w*|farmer'?s? (?:carry|walk)s?)(?![a-z])/,
  back: /(?<![a-z])(?:deadlifts?|rdls?|good mornings?|bent-?over rows?|squats?|cleans?|snatch\w*)(?![a-z])/,
  wrist: /(?<![a-z])(?:push-?ups?|bench|press\w*|front squats?|curls?)(?![a-z])/,
  elbow: /(?<![a-z])(?:curls?|skull ?crushers?|triceps? extensions?|press\w*|dips?|pull-?ups?|chin-?ups?|rows?)(?![a-z])/,
  hip: /(?<![a-z])(?:squats?|lunges?|deadlifts?|hip thrusts?|split squats?)(?![a-z])/,
  ankle: /(?<![a-z])(?:jump\w*|running|sprints?|lunges?|calf raises?|step-?ups?)(?![a-z])/,
  hamstring: /(?<![a-z])(?:deadlifts?|rdls?|leg curls?|hamstring curls?|sprints?|good mornings?)(?![a-z])/,
};
// Avoidance has to govern the exercise: a cue in the 60 characters before it ("avoid … bench presses", "no push-ups"), or a
// sentence that says the movement waits for clearance. "Without straining the shoulder" is a prescription, not avoidance.
const AVOID_BEFORE = /(?<![a-z])(?:avoid\w*|no|not|never|skip\w*|stop|hold off|instead of|rather than|including|like|such as|khong|tranh)(?![a-z])[^.;:!?]{0,60}$/;
const WAITS = /(?<![a-z])(?:wait\w*|until (?:you(?:'re| are)? )?(?:cleared|your physio)|after (?:clearance|your physio|you(?:'re| are)? cleared)|off the table|on hold|cho den khi)(?![a-z])/;
const IF_CLEARED = /\b(?:if|once|when|after) (?:you (?:are |'re |get )?|your (?:physio|doctor) )?(?:cleared|clears? you|gives? (?:you )?the go-?ahead|have the go-?ahead|approv\w*)/;
// "exercises that do not load the shoulder, like lateral raises" offers the movement as SAFE — the "not" there is not an
// avoidance of what follows "like" (H1 I03).
const SAFE_EXEMPLAR = /(?<![a-z])(?:do(?:es)?n'?t|do(?:es)? not|without)\s+(?:load|stress|strain|involve|aggravate|provoke|engage|put|hurt)\w*(?![a-z])[^.;:!?]{0,40}(?<![a-z])(?:like|such as|including|e\.?g\.?)(?:\s+[a-z-]+){0,2}\s*$/;
const avoids = (before: string) => AVOID_BEFORE.test(before) && !SAFE_EXEMPLAR.test(before);

/** A reply that prescribes movements loading a DIAGNOSED injured site. Avoid / wait-for-clearance mentions are fine. */
function injuryLoadViolations(reply: string, brief: IntelligenceBrief): IntegrityViolation[] {
  const sites = (brief.context?.facts ?? [])
    .filter((fact) => fact.status === "ACTIVE" && fact.temporal === "CURRENT" && clinicallyBounded(fact))
    .map((fact) => fact.key.slice("INJURY:".length));
  const out: IntegrityViolation[] = [];
  for (const site of sites) {
    const pattern = SITE_LOADING[site];
    if (!pattern) continue;
    // A list item and its continuation lines are one unit: "4. Incline press (if cleared)" is a prescription with a condition.
    const units = listUnits(reply).flatMap((block) => sentences(block.replace(/\n+/g, " "))).map(fold);
    const global = new RegExp(pattern.source, "g");
    const prescribed = units.flatMap((text) => (WAITS.test(text) && !IF_CLEARED.test(text) ? [] : [...text.matchAll(global)]
      .filter((hit) => IF_CLEARED.test(text) || !avoids(text.slice(0, hit.index)))
      .map((hit) => hit[0])));
    if (prescribed.length > 0) out.push({ code: "INJURY_SITE_LOADED", detail: `${site}|${[...new Set(prescribed)].slice(0, 4).join(", ")}` });
  }
  return out;
}

const CLEARANCE_LINE = {
  en: (site: string) => `With a diagnosed ${site} injury, any exercise that loads the ${site} waits until your physio or doctor clears it. Until then, train what doesn't load it, and stop anything that provokes it.`,
  vi: (site: string) => `Với chấn thương ${site === "shoulder" ? "vai" : site === "knee" ? "gối" : site === "lower back" ? "lưng dưới" : site} đã được chẩn đoán, mọi bài tập tạo tải lên vùng đó phải chờ physio hoặc bác sĩ cho phép. Trong lúc chờ, chỉ tập những gì không tạo tải lên vùng đó và dừng ngay động tác nào làm đau.`,
};

/**
 * Last line for a DIAGNOSED structural injury (after the one regeneration): a list item or sentence that still prescribes a
 * movement loading the injured site is removed, and the clearance rule is stated once. Removal only — it adds no exercise.
 */
function stripInjuryLoading(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  const violations = injuryLoadViolations(reply, brief);
  if (violations.length === 0) return reply;
  let out = reply;
  for (const violation of violations) {
    const site = violation.detail.split("|")[0];
    const pattern = new RegExp(SITE_LOADING[site].source, "g");
    const blocks = listUnits(out);
    out = blocks
      .map((block) => {
        const all = sentences(block.replace(/\n+/g, " "));
        const kept = keepWithoutOrphans(all, (sentence) => {
          const text = fold(sentence);
          if (WAITS.test(text) && !IF_CLEARED.test(text)) return true;
          return ![...text.matchAll(pattern)].some((hit) => IF_CLEARED.test(text) || !avoids(text.slice(0, hit.index)));
        });
        // A list item whose heading went is removed whole; a prose block keeps what survived.
        if (kept.length === all.length) return block;
        return /^\s*(?:\d+[.)]|[-*•])\s/.test(block) ? "" : kept.join(" ");
      })
      .filter((block) => block.trim())
      .join("\n");
    // An intro that announced the removed list ("Here are some alternatives:") is left with nothing to introduce.
    out = dropEmptyIntros(renumberLists(out));
    const line = CLEARANCE_LINE[language](site);
    if (!fold(out).includes(fold(line).slice(0, 40))) out = `${line}\n\n${dropDanglingContrast(out)}`.trim();
  }
  return out;
}

/* ---------- H1: an active allergy or a dangerously low intake is a decision constraint, not only a prompt line ---------- */

/** What contains each allergen (keys = the working set's ALLERGY:<id>). Product words only — never the allergy word itself. */
const ALLERGEN_ITEMS: Record<string, RegExp> = {
  fish: /(?<![a-z])(?:fish[- ]?oils?|cod liver oil|(?:oily |fatty |white )?fish|salmon|tuna|sardines?|mackerel|anchov\w*|trout|herring|tilapia|cod|basa|dau ca|ca hoi|ca ngu)(?![a-z])/,
  // Vietnamese only as unambiguous food compounds: bare tom/cua/lac/sua/trung fold onto tóm, của, lạc quan, sửa, tập trung.
  shellfish: /(?<![a-z])(?:shellfish|shrimps?|prawns?|crabs?|lobsters?|krill(?: oil)?|mussels?|oysters?|clams?|scallops?|glucosamine|tom (?:hum|su|the|kho)|cua (?:bien|dong|lot)|hai san)(?![a-z])/,
  "peanuts or tree nuts": /(?<![a-z])(?:peanuts?|peanut butter|(?:tree )?nuts|mixed nuts|nut butters?|almonds?|almond butter|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|macadamias?|trail mix|dau phong|hat dieu|hat oc cho)(?![a-z])/,
  "dairy or lactose": /(?<![a-z])(?:milk|whey|casein|yogh?urts?|greek yogh?urt|cheese|cottage cheese|kefir|skyr|cream|ice cream|sua (?:tuoi|chua|bot|dac)|pho mai)(?![a-z])/,
  eggs: /(?<![a-z])(?:eggs?|egg whites?|omelet(?:te)?s?|trung (?:ga|vit|luoc|chien|op la))(?![a-z])/,
  soy: /(?<![a-z])(?:soy\w*|tofu|edamame|tempeh|dau nanh|dau phu)(?![a-z])/,
  "gluten or wheat": /(?<![a-z])(?:wheat|bread|pasta|bagels?|seitan|couscous|barley)(?![a-z])/,
  sesame: /(?<![a-z])(?:sesame|tahini|hummus)(?![a-z])/,
};
// The mention is the avoidance, not the pick: a cue in the same clause before it ("avoid fish oil", "instead of whey"), the
// fish-free / dairy-free form, or a verdict after it in the same clause ("fish oil is out for you").
const ALLERGEN_AVOID_BEFORE = /(?<![a-z])(?:avoid\w*|no|not|never|skip\w*|without|instead of|rather than|except|exclud\w*|allerg\w*|react\w*|phan ung|rules? out|ruled out|don'?t|do not|can'?t|cannot|stay away from|cut out|swap(?:ping)? out|replace|khong|tranh|thay vi)(?![a-z])[^,;:—]{0,60}$/;
const ALLERGEN_FREE_AFTER = /^[- ]?(?:free|derived|based|sourced)|^[^,;:—.]{0,20}(?<![a-z])(?:allerg\w*|intoleran\w*)|^[^,;:—.]{0,50}(?<![a-z])(?:is|are|isn'?t|aren'?t|would be|'s)\s+(?:out|off the table|not (?:safe|suitable|an option|for you)|unsuitable|excluded|not recommended)|^[^,;:—.]{0,40}(?<![a-z])(?:contains?|comes? from|is made from|are made from|would trigger|could trigger)(?![a-z])/;
const ALLERGEN_SAFE_FORM: Record<string, RegExp> = {
  fish: /(?<![a-z])(?:algae|algal|fish-?free)(?![a-z])/,
  "dairy or lactose": /(?<![a-z])(?:lactose-?free|dairy-?free|plant(?:-based)?|oat|soy|almond|pea) (?:milk|whey|yogh?urt|protein|cheese)|(?<![a-z])(?:dairy|milk)-?free(?![a-z])/,
  "gluten or wheat": /(?<![a-z])gluten-?free(?![a-z])/,
};

/** What the constraint rests on, so the line says it truthfully: a stated allergy, a clinician's advice, or a reported reaction. */
type AllergyBasis = "ALLERGY" | "CLINICIAN" | "POSSIBLE";
function activeAllergies(brief: IntelligenceBrief): Array<{ id: string; intolerance: boolean; basis: AllergyBasis }> {
  return (brief.context?.facts ?? [])
    .filter((fact) => fact.status === "ACTIVE" && fact.kind === "ALLERGY" && fact.temporal === "CURRENT")
    .map((fact) => ({
      id: fact.key.slice("ALLERGY:".length),
      intolerance: /intoleran/.test(fact.label),
      basis: (/^(?:allergic|lactose)/.test(fact.label) ? "ALLERGY" : /clinician/.test(fact.label) ? "CLINICIAN" : /^possible reaction/.test(fact.label) ? "POSSIBLE" : "ALLERGY") as AllergyBasis,
    }))
    .filter(({ id }) => ALLERGEN_ITEMS[id]);
}

/** Allergen-containing items a sentence offers. The sentence's own avoidance / safe-form wording exempts a hit. */
// Lactose intolerance is about lactose, not milk protein: whey isolate, casein and hard cheese carry little of it (H1 C15).
const LACTOSE_RICH = /(?<![a-z])(?:milk|whey concentrate|yogh?urts?|cottage cheese|soft cheese|cream|ice cream|sua (?:tuoi|chua|bot|dac))(?![a-z])/;

function allergenHits(sentence: string, id: string, intolerance: boolean): string[] {
  const folded = fold(sentence);
  // Lactose intolerance (not a milk allergy) is compatible with lactose-free forms; an allergy is not.
  const safeForm = ALLERGEN_SAFE_FORM[id];
  const items = intolerance && id === "dairy or lactose" ? LACTOSE_RICH : ALLERGEN_ITEMS[id];
  return [...folded.matchAll(new RegExp(items.source, "g"))]
    .filter((hit) => {
      const before = folded.slice(0, hit.index);
      const after = folded.slice((hit.index ?? 0) + hit[0].length);
      if (ALLERGEN_AVOID_BEFORE.test(before) || ALLERGEN_FREE_AFTER.test(after)) return false;
      if (safeForm && safeForm.test(folded.slice(Math.max(0, (hit.index ?? 0) - 25), (hit.index ?? 0) + hit[0].length + 6)) && (id !== "dairy or lactose" || intolerance || /dairy-?free|plant|oat|soy|almond|pea/.test(folded))) return false;
      return true;
    })
    .map((hit) => hit[0]);
}

function allergenViolations(reply: string, brief: IntelligenceBrief): IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  for (const { id, intolerance } of activeAllergies(brief)) {
    const hits = sentences(reply.replace(/\n+/g, " ")).flatMap((sentence) => allergenHits(sentence, id, intolerance));
    if (hits.length > 0) out.push({ code: "ALLERGEN_RECOMMENDED", detail: `${id}|${[...new Set(hits)].slice(0, 4).join(", ")}` });
  }
  return out;
}

// The fixed line passes its own check: the avoid verb governs every item it names.
const ALLERGY_AVOID: Record<string, { en: string; vi: string; vn: string }> = {
  fish: { en: "fish and fish oil. An algae-based omega-3 is the fish-free form, worth checking with your allergist", vi: "cá và dầu cá. Omega-3 từ tảo là dạng không có cá, nên hỏi bác sĩ dị ứng trước", vn: "cá" },
  shellfish: { en: "shellfish and krill oil or shellfish-derived glucosamine", vi: "hải sản có vỏ và dầu nhuyễn thể", vn: "hải sản có vỏ" },
  "peanuts or tree nuts": { en: "peanuts and tree nuts and anything made with them", vi: "đậu phộng và các loại hạt", vn: "đậu phộng / các loại hạt" },
  "dairy or lactose": { en: "milk and milk proteins like whey and casein", vi: "sữa và đạm sữa như whey", vn: "sữa" },
  eggs: { en: "eggs and egg-white protein", vi: "trứng", vn: "trứng" },
  soy: { en: "soy foods and soy protein", vi: "đậu nành", vn: "đậu nành" },
  "gluten or wheat": { en: "wheat and gluten foods", vi: "lúa mì và gluten", vn: "gluten" },
  sesame: { en: "sesame and tahini", vi: "mè", vn: "mè" },
};
// A possible reaction (user-reported, unconfirmed) is named as what it is, never promoted to "your allergy".
const possibleLine = (avoid: string, until: string) => {
  const [head, ...tail] = avoid.split(". ");
  return `${head} ${until}.${tail.length ? ` ${tail.join(". ")}.` : ""}`;
};
const ALLERGY_LINE = {
  en: (id: string, intolerance = false, basis: AllergyBasis = "ALLERGY") => intolerance
    ? "Because of the lactose intolerance you mentioned, pick lactose-free forms: lactose-free milk, whey isolate or a plant protein."
    : basis === "POSSIBLE"
      ? `Because of the reaction to ${id} you described, avoid ${possibleLine((ALLERGY_AVOID[id]?.en ?? id).replace(/your allergist/, "a doctor"), "until a doctor has checked it")}`
      : basis === "CLINICIAN"
        ? `Because your doctor advised you to avoid ${id}, avoid ${(ALLERGY_AVOID[id]?.en ?? id).replace(/your allergist/, "your doctor")}.`
        : `Because of the ${id} allergy you mentioned, avoid ${ALLERGY_AVOID[id]?.en ?? id}.`,
  vi: (id: string, intolerance = false, basis: AllergyBasis = "ALLERGY") => intolerance
    ? "Vì bạn không dung nạp lactose, hãy chọn dạng không lactose: sữa không lactose, whey isolate hoặc đạm thực vật."
    : basis === "POSSIBLE"
      ? `Vì bạn đã kể bị phản ứng sau khi ăn ${ALLERGY_AVOID[id]?.vn ?? id}, hãy tránh ${possibleLine((ALLERGY_AVOID[id]?.vi ?? id).replace(/bác sĩ dị ứng/, "bác sĩ"), "cho đến khi bác sĩ kiểm tra")}`
      : basis === "CLINICIAN"
        ? `Vì bác sĩ đã dặn bạn tránh ${ALLERGY_AVOID[id]?.vn ?? id}, hãy tránh ${(ALLERGY_AVOID[id]?.vi ?? id).replace(/bác sĩ dị ứng/, "bác sĩ")}.`
        : `Vì bạn đã nói mình dị ứng ${ALLERGY_AVOID[id]?.vn ?? id}, hãy tránh ${ALLERGY_AVOID[id]?.vi ?? id}.`,
};

/** Last line for an active allergy: a sentence or list item that still offers the allergen is removed, and the rule stated once. */
function stripAllergens(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  let out = reply;
  for (const { id, intolerance, basis } of activeAllergies(brief)) {
    const blocks = listUnits(out);
    let removed = false;
    const ruledOut = new Set<string>();
    out = blocks
      .map((block) => {
        const all = sentences(block.replace(/\n+/g, " "));
        const kept = keepWithoutOrphans(all, (sentence) => {
          const hits = allergenHits(sentence, id, intolerance);
          hits.forEach((hit) => ruledOut.add(hit));
          return hits.length === 0;
        });
        if (kept.length === all.length) return block;
        removed = true;
        return /^\s*(?:\d+[.)]|[-*•])\s/.test(block) ? "" : kept.join(" ");
      })
      .filter((block) => block.trim())
      .join("\n");
    if (!removed) continue;
    out = dropEmptyIntros(renumberLists(out));
    const base = ALLERGY_LINE[language](id, intolerance && id === "dairy or lactose", basis);
    // The question was about a food the line does not name ("Is hummus a good snack?"): say that food is the one ruled out
    // (A15 / M01 / M06). English only — the hits are folded, so Vietnamese ones have lost their diacritics.
    const asked = fold(brief.message ?? "");
    const named = [...ruledOut].filter((hit) => asked.includes(hit) && !fold(base).includes(hit));
    const line = language === "en" && named.length > 0 ? `${base} That rules out ${named.slice(0, 3).join(", ")}.` : base;
    if (!fold(out).includes(fold(line).slice(0, 40))) out = `${line}\n\n${dropDanglingContrast(out)}`.trim();
  }
  return out;
}

// Adding discretionary load on a dangerously low intake: "extra cardio after class is reasonable", "add a HIIT session".
const EXTRA_LOAD = /(?<![a-z])(?:extra|more|additional|another|a second|second|add(?:ing)?|double|fasted|heavy|heavier|hard|harder|intense|max(?:imal)?)\s+(?:\w+\s+){0,2}?(?:cardio|hiit|sessions?|workouts?|runs?|running|training|conditioning|intervals?|sprints?|exercise|(?:leg |push |pull |lifting )?days?)(?![a-z])|(?<![a-z])(?:cardio|hiit|a run|a workout|training session|tap them)(?![a-z])[^.?!]{0,40}(?<![a-z])(?:reasonable|fine|good idea|beneficial|great|worth (?:it|doing)|go for it|okay|ok|sensible|could help|can help|duoc|on)(?![a-z])/;
const LOAD_ENDORSE = /(?<![a-z])(?:reasonable|fine|good idea|beneficial|great|worth|go for|okay|ok|sensible|could|can|would|try|consider|add|do|should|help|duoc|nen)(?![a-z])/;
// The decline has to govern the load phrase: in its clause before it ("don't add extra cardio"), or a condition after it
// ("extra cardio waits until you're eating enough"). "If you're not fatigued, adding cardio is fine" is still an endorsement.
const LOAD_DECLINE_BEFORE = /(?<![a-z])(?:don'?t|do not|avoid|skip|hold off(?: on)?|not|no|never|instead of|rather than|before|without|khong|dung|chua)(?![a-z])[^,;:—]{0,30}$/;
const LOAD_DECLINE_AFTER = /^[^.?!]{0,60}(?<![a-z])(?:until|once you(?:'re| are)? eating|after you(?:'ve| have)? eaten|isn'?t|is not|aren'?t|are not|not (?:a good idea|recommended|safe)|is out|waits?|should wait|cho den khi)(?![a-z])/;

/** Last line for a dangerously low intake: endorsements of extra load are removed and the intake line is stated once. */
/**
 * Keep the sentences that pass, and drop one that only continues a removed sentence through a bare pronoun
 * ("Trail mix is a great hiking snack. It typically offers…" — M01). "It's important to…" stands on its own.
 */
function keepWithoutOrphans(all: string[], passes: (sentence: string) => boolean): string[] {
  const kept: string[] = [];
  let previousRemoved = false;
  for (const sentence of all) {
    // "It typically offers…", or an imperative about the removed thing: "Pair it with fruit."
    const orphan: boolean = previousRemoved && (/^\s*(?:It|They|These|Those|This|That)\b(?!'s (?:important|essential|crucial|best|wise|worth)| is (?:important|essential|crucial|best|wise|worth))/.test(sentence)
      || /^\s*[A-Z][a-z]+ (?:it|them)\b/.test(sentence));
    const keep: boolean = passes(sentence) && !orphan;
    if (keep) kept.push(sentence);
    previousRemoved = !keep;
  }
  return kept;
}

/**
 * After a removal, what announced the removed content goes too: an intro sentence ending in ":" with no list after it
 * ("Here's a safe chest workout for today:") and a heading with nothing under it ("### Chest Workout") — H1 I02 / L04.
 */
function dropEmptyIntros(text: string): string {
  const isItem = (line: string) => /^\s*(?:\d+[.)]|[-*•])\s/.test(line);
  const isHeading = (line: string) => /^\s*#{1,6}\s/.test(line) || /^\s*\*\*[^*\n]+\*\*:?\s*$/.test(line);
  // A heading glued to the end of a prose line by an earlier join.
  const lines = text.replace(/[ \t]+#{1,6}\s[^\n]*$/, "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const next = lines.slice(i + 1).find((line) => line.trim());
    if (isHeading(lines[i]) && (!next || isHeading(next) || (/:\s*(?:\*\*)?\s*$/.test(lines[i]) && !isItem(next)))) lines.splice(i, 1);
    else if (/:\s*$/.test(lines[i]) && !(next && isItem(next))) {
      const kept = lines[i].replace(/(?:^|(?<=[.!?])\s+)[^.!?\n]*:\s*$/, "").trimEnd();
      if (kept.trim()) lines[i] = kept;
      else lines.splice(i, 1);
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripLowIntakeLoad(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  const isLoad = lowIntakeLoadCheck(brief);
  if (!isLoad || lowIntakeLoadSentences(reply, brief).length === 0) return reply;
  // A list item that prescribes the load goes whole with its sub-bullets (L04: "1. Squats — 3 sets…" then " - Keep depth…");
  // then any remaining sentence that endorses or prescribes it.
  // An item's continuation is only its indented / blank lines; an unindented paragraph after the list is its own block.
  const blocks: Array<{ item: boolean; lines: string[] }> = [];
  for (const line of reply.split("\n")) {
    const last = blocks.at(-1);
    if (/^(?:\d+[.)]|[-*•])\s/.test(line)) blocks.push({ item: true, lines: [line] });
    else if (last?.item && (/^\s+\S/.test(line) || !line.trim())) last.lines.push(line);
    else blocks.push({ item: false, lines: [line] });
  }
  const kept = blocks.filter((block) => !(block.item && sentences(block.lines.join(" ")).some(isLoad))).flatMap((block) => block.lines).join("\n");
  const out = dropEmptyIntros(mapSentencesKeepingLists(kept, (sentence) => (isLoad(sentence) ? null : sentence)));
  const value = brief.context?.facts.find((fact) => fact.status === "ACTIVE" && fact.kind === "LOW_ENERGY_INTAKE")?.value;
  const line = CONTEXT_REMINDERS.find((entry) => entry.id === "low_intake")!.line[language](value);
  return out ? `${line}\n\n${dropDanglingContrast(out)}` : line;
}

// A sets × reps line is a training-load prescription ("Squat — 3–5 sets of 3–6 reps", "4x8").
// Markdown may sit between the label and the number: "**Sets:** 3-4" (H1 final L17).
const LOAD_PRESCRIPTION = /\b\d+\s*(?:[-–]\s*\d+\s*)?(?:sets?\b|x\s*\d)|\b(?:sets?|reps?)\W{0,4}\d/;

/** On a dangerously low intake: endorsing extra load, or — when the user asked for heavy / extra load — prescribing it. */
function lowIntakeLoadCheck(brief: IntelligenceBrief): ((sentence: string) => boolean) | null {
  const low = (brief.context?.facts ?? []).some((fact) => fact.status === "ACTIVE" && fact.temporal === "CURRENT" && fact.kind === "LOW_ENERGY_INTAKE" && fact.relevance === "SAFETY");
  const message = fold(brief.message ?? "");
  if (!low || !TOPIC.training.test(message)) return null;
  // "tập chân nặng", "giáo án cường độ cao", "tập thêm": the Vietnamese load ask.
  const loadAsked = EXTRA_LOAD.test(message) || /\b(?:tap|giao an|buoi|lich)\b[^.?!]{0,30}\b(?:nang|cuong do cao|hiit|them)\b/.test(message);
  return (sentence) => {
    const folded = fold(sentence);
    if (loadAsked && LOAD_PRESCRIPTION.test(folded)) return true;
    if (!LOAD_ENDORSE.test(folded)) return false;
    return [...folded.matchAll(new RegExp(EXTRA_LOAD.source, "g"))].some((hit) =>
      !LOAD_DECLINE_BEFORE.test(folded.slice(0, hit.index)) && !LOAD_DECLINE_AFTER.test(folded.slice((hit.index ?? 0) + hit[0].length)));
  };
}

function lowIntakeLoadSentences(reply: string, brief: IntelligenceBrief): string[] {
  const isLoad = lowIntakeLoadCheck(brief);
  return isLoad ? sentences(reply.replace(/\n+/g, " ")).filter(isLoad) : [];
}

/** After a removal, "However, …" can open the remainder with nothing left to contrast: the connective goes. */
const dropDanglingContrast = (text: string) => text.replace(/^(?:However|But|That said|Still|Tuy nhiên|Nhưng),?\s+(\p{L})/u, (_, first: string) => first.toUpperCase());

/** Top-level list items with their continuation lines (sub-bullets belong to their numbered parent); prose blocks stay whole. */
function listUnits(text: string): string[] {
  const numbered = /(^|\n)\s*\d+[.)]\s/.test(text);
  return text.split(numbered ? /\n(?=\s*\d+[.)]\s)/ : /\n(?=\s*[-*•]\s)/);
}

/* ---------- H0 cluster A/D: an active safety fact the answer must not ignore ---------- */

const TOPIC = {
  training: /\b(?:train\w*|workout|lift\w*|cardio|hiit|intervals?|conditioning|sprint\w*|exercis\w*|session|sets?|squat|bench|deadlift|run\w*|gym|heavy|tap|tap luyen)\b/,
  // A possible adverse effect while using a drug product (H0 final closure).
  symptom: /\b(?:chest (?:pain|tight\w*)|heart (?:is )?(?:racing|pounding|fluttering|skipping)|pounding heart|palpitation\w*|anxious|anxiety|panic\w*|can'?t sleep|insomnia|dizz\w*|faint\w*|headaches?|nose ?bleeds?|short(?:ness)? of breath|yellow|dark (?:urine|pee)|swollen|swelling|depress\w*|rage|vomit\w*|tim dap nhanh|kho tho|chong mat|dau nguc)\b/,
  food: /\b(?:eat\w*|food|meals?|diet|carbs?|protein|snacks?|breakfast|lunch|dinner|pre-?workout meal|an|an gi|bua)\b/,
  supplement: /\b(?:supps?|supplements?|creatine|caffeine|pre-?workout|whey|vitamins?|fish oil|omega|st\.? john|wort|ashwagandha|magnesium|zinc)\b/,
};

type ContextReminder = { id: string; topics: Array<keyof typeof TOPIC>; addressed: RegExp; line: Record<"en" | "vi", (value?: number) => string> };

const CONTEXT_REMINDERS: Array<{ match: (key: string, kind: string) => boolean } & ContextReminder> = [
  { id: "diabetes", match: (key) => /^CONDITION:(?:type1_diabetes|type2_diabetes|diabetes)$/.test(key), topics: ["training", "food"], addressed: /\b(?:glucose|blood sugar|hypo\w*|insulin|diabet\w*|duong huyet|tieu duong)\b/,
    line: { en: () => "With your diabetes, check your blood sugar before and after training and keep fast-acting carbs with you; carb or insulin changes are for your diabetes team.", vi: () => "Vì bạn bị tiểu đường, hãy đo đường huyết trước và sau khi tập và luôn mang theo đồ ngọt hấp thu nhanh; thay đổi carb hay insulin là việc của đội điều trị." } },
  { id: "pregnancy", match: (_key, kind) => kind === "PREGNANCY", topics: ["training", "supplement", "food"], addressed: /\b(?:pregnan\w*|midwife|baby|mang thai|bau)\b/,
    line: { en: () => "Because you're pregnant, run any training or supplement change past your midwife or doctor.", vi: () => "Vì đang mang thai, mọi thay đổi về tập luyện hay thực phẩm bổ sung nên hỏi bác sĩ hoặc nữ hộ sinh trước." } },
  { id: "low_intake", match: (_key, kind) => kind === "LOW_ENERGY_INTAKE", topics: ["training", "food"], addressed: /\b(?:too (?:low|little)|dangerously|far too|not enough (?:food|calories|energy)|qua it|qua thap)\b|\b\d{3,4}\s*(?:kcal|calories|calo)\b/,
    line: { en: (v) => `${v ? `At about ${v} kcal a day` : "Eating this little"}, you're taking in far too little to train safely — please don't add extra cardio or harder training until you're eating enough (everyday movement like walking where you need to go is fine); a doctor or dietitian can help you reach a safe intake.`, vi: (v) => `${v ? `Ăn khoảng ${v} kcal mỗi ngày` : "Ăn ít như vậy"} là quá ít để tập an toàn — đừng tập thêm cardio hay tập nặng hơn cho đến khi ăn đủ (đi bộ thường ngày thì vẫn được); bác sĩ hoặc chuyên gia dinh dưỡng có thể giúp bạn ăn đủ an toàn.` } },
  { id: "kidney", match: (key) => key === "CONDITION:kidney_disease", topics: ["supplement", "food"], addressed: /\b(?:kidney|renal|nephro\w*|than)\b/,
    line: { en: () => "With kidney disease, any supplement or protein change goes through your kidney doctor first.", vi: () => "Với bệnh thận, mọi thay đổi về thực phẩm bổ sung hay protein cần hỏi bác sĩ thận trước." } },
  { id: "hypertension", match: (key) => key === "CONDITION:hypertension", topics: ["training", "supplement"], addressed: /\b(?:blood pressure|bp|hypertension|huyet ap)\b/,
    line: { en: () => "With high blood pressure, skip stimulant pre-workouts and maximal breath-hold lifts, and get medical clearance if it isn't controlled.", vi: () => "Với huyết áp cao, tránh pre-workout có chất kích thích và các lần nâng tối đa nín thở, và hỏi bác sĩ nếu huyết áp chưa kiểm soát." } },
  { id: "concussion", match: (key) => key === "CONDITION:concussion", topics: ["training"], addressed: /\b(?:concuss\w*|cleared|head injury|chan dong nao)\b/,
    line: { en: () => "After a concussion, no training until you're symptom-free and medically cleared.", vi: () => "Sau chấn động não, chưa tập cho đến khi hết triệu chứng và được bác sĩ cho phép." } },
  { id: "ssri", match: (key) => key === "MEDICATION:ssri" || key === "MEDICATION:maoi", topics: ["supplement"], addressed: /\b(?:serotonin|ssri|sertraline|antidepress\w*|maoi|interact\w*|prescriber|pharmacist)\b/,
    line: { en: () => "With your antidepressant, check any supplement with your prescriber or pharmacist first — some (like St John's wort) can cause serotonin syndrome.", vi: () => "Vì đang dùng thuốc chống trầm cảm, hãy hỏi bác sĩ hoặc dược sĩ trước khi dùng bất kỳ thực phẩm bổ sung nào — một số loại (như St John's wort) có thể gây hội chứng serotonin." } },
  // Addressed only by the stop instruction itself: "see someone if it persists" is the softening this line exists to fix.
  { id: "ped_symptom", match: (_key, kind) => kind === "PED_USE", topics: ["symptom"], addressed: /\b(?:stop (?:taking|using) (?:it|them|the|tren|test|anavar|steroids?|the drug)|ngung dung)\b/,
    line: { en: () => "Because you're using it, a symptom like this needs a medical check soon: stop taking it and tell the doctor exactly what you used; if it is severe or getting worse, get urgent care.", vi: () => "Vì đang dùng, triệu chứng như vậy cần được khám y tế sớm: hãy ngừng dùng và nói rõ với bác sĩ bạn đã dùng gì; nếu nặng hoặc đang xấu đi, hãy đi cấp cứu." } },
  // Current use + a supplement answer that never mentions it: the context must not silently disappear (final rerun MA11).
  { id: "ped_supplement", match: (_key, kind) => kind === "PED_USE", topics: ["supplement"], addressed: /\b(?:steroids?|anavar|oxandrolone|tren\w*|testosterone|sarms?|ostarine|cycle|blast|peds?|performance-enhancing|gear|doctor|healthcare|pharmacist|bac si)\b/,
    line: { en: () => "Since you're currently using it: no supplement makes that safer, so tell your doctor what you're taking before adding anything.", vi: () => "Vì bạn đang dùng: không thực phẩm bổ sung nào làm việc đó an toàn hơn, nên hãy cho bác sĩ biết bạn đang dùng gì trước khi thêm bất cứ thứ gì." } },
  { id: "anticoagulant", match: (key) => key === "MEDICATION:anticoagulant", topics: ["supplement"], addressed: /\b(?:bleed\w*|blood thinner|warfarin|anticoag\w*|prescriber|chay mau)\b/,
    line: { en: () => "With a blood thinner, supplements like fish oil can add to bleeding risk — check with your prescriber first.", vi: () => "Vì đang dùng thuốc chống đông, một số thực phẩm bổ sung như dầu cá có thể tăng nguy cơ chảy máu — hãy hỏi bác sĩ trước." } },
];

/** Active safety facts whose topic this turn touches and that the reply never addresses. */
function ignoredContextFacts(reply: string, brief: IntelligenceBrief): Array<{ reminder: ContextReminder; value?: number }> {
  const message = fold(brief.message ?? "");
  if (!message) return [];
  const folded = fold(reply);
  const out: Array<{ reminder: ContextReminder; value?: number }> = [];
  for (const fact of brief.context?.facts ?? []) {
    if (fact.status !== "ACTIVE" || fact.temporal !== "CURRENT" || fact.relevance !== "SAFETY") continue;
    // One fact can carry several reminders (current PED use: symptom line, supplement line); the turn's topic picks them.
    for (const reminder of CONTEXT_REMINDERS.filter((entry) => entry.match(fact.key, fact.kind))) {
      if (out.some((entry) => entry.reminder.id === reminder.id)) continue;
      if (!reminder.topics.some((topic) => TOPIC[topic].test(message))) continue;
      if (reminder.addressed.test(folded)) continue;
      out.push({ reminder, value: fact.value });
    }
  }
  return out;
}

function listItems(reply: string): number {
  return (reply.match(/(?:^|\n)\s*(?:\d+[.)]|[-*•])\s+\S/g)?.length ?? 0) + (reply.match(/(?<=[.!?:]\s)\d+[.)]\s+\*\*/g)?.length ?? 0);
}

/** A referral, a boundary or a question — necessary, but on its own not help with the task. */
const BOUNDARY_ONLY = /(?<![a-z])(?:doctor|physio\w*|physician|healthcare|professional|clinician|medical (?:help|care|attention|advice|assessment)|get (?:it )?(?:checked|assessed|evaluated)|can'?t (?:recommend|diagnose|prescribe)|cannot (?:recommend|diagnose|prescribe)|won'?t (?:recommend|prescribe)|not (?:able|something) to|bac si|chuyen gia)(?![a-z])/;

/**
 * SAFETY_BOUNDARY_CORRECT is not SAFE_CONTINUATION_PRESENT: a bounded health answer still owes at least two sentences
 * of usable help (what to do instead, what to watch, what matters) beyond the referral and the question.
 */
export function safeContinuationPresent(reply: string): boolean {
  return sentences(reply).filter((sentence) => !/[?？]\s*$/.test(sentence) && !BOUNDARY_ONLY.test(fold(sentence)) && tokens(fold(sentence)).length >= 5).length >= 2;
}

/** Conditional framing: the priority is stated as depending on something, or as based on what is known so far. */
const CONDITIONAL_FRAME = /based on what|so far|without knowing|it depends|depends on|if (?:you|your|you're)|unless|only if|neu|tuy/;

/** First structured line (list item or heading) naming `own` terms and none of `other`'s. -1 = never on its own line. */
function structuredLine(reply: string, own: string[], other: string[]): number {
  return reply.split("\n").findIndex((line) => {
    if (!/^\s*(?:\d+[.)]|[-*•]|#{1,6})\s+/.test(line)) return false;
    const folded = fold(line);
    return own.some((term) => hasTerm(folded, term)) && !other.some((term) => hasTerm(folded, term));
  });
}

/** Prose that puts a candidate at the top: "high priority", "must buy", "essential for you". */
const TOP_PRIORITY = /(?<![a-z])(?:(?:high|highest|top|first|main) priority|priority (?:#?1|one|number one)|number one|top pick|must[- ](?:buy|have|take|get)|a must|essential(?! (?:nutrients?|minerals?|vitamins?|amino|fatty|trace))(?: for you| to (?:buy|take|get))?|definitely (?:buy|get|take|worth)|you should (?:buy|get|take|definitely)|most important|uu tien cao|uu tien hang dau|nen mua|bat buoc|can mua)(?![a-z])/;
/** Prose that drops a candidate: "usually skip", "not worth it", "waste of money". */
const DROP = /(?<![a-z])(?:(?:usually |just |can |could |safely )?skip(?: it| this| that)?|not worth (?:it|buying|the money)|waste of money|(?:don'?t|do not) (?:need|bother)|low(?:est)? priority|bo qua|khong can|lang phi)(?![a-z])/;
const NEGATED_TOP = /(?<![a-z])(?:not|no|never|isn'?t|aren'?t|wouldn'?t|doesn'?t|don'?t|khong|chua)(?:\s+\w+){0,3}\s*$/;

/** The candidate a sentence is about: exactly one named, or none (a sentence comparing two is not a tier statement). */
function soleCandidate(folded: string, decision: NonNullable<IntelligenceBrief["candidates"]>): string | null {
  const named = decision.request.candidates.filter((candidate) => candidate.terms.some((term) => hasTerm(folded, term)));
  return named.length === 1 ? named[0].label : null;
}

/**
 * STRUCTURED DECISION > MODEL WORDING. A sentence about ONE candidate may express its tier, add nuance or challenge it
 * conditionally ("worth considering if …"); it may not restate it in the opposite class. Revising a tier is policy's job
 * (the latest message's facts already re-run it), never the prose's.
 */
export function tierContradictions(reply: string, brief: IntelligenceBrief): Array<{ candidate: string; tier: string; sentence: string }> {
  const decision = brief.candidates;
  if (!decision || brief.posture.decision === "HARD_STOP") return [];
  const found: Array<{ candidate: string; tier: string; sentence: string }> = [];
  for (const sentence of reply.split("\n").flatMap((line) => sentences(line))) {
    const folded = fold(sentence);
    if (CONDITION.test(folded)) continue;
    const label = soleCandidate(folded, decision);
    const tier = label ? decision.priorities.find((priority) => priority.candidate === label)?.tier : undefined;
    // NOT_ASSESSED is ranked on coaching practice by the model itself: there is no server tier for prose to contradict.
    if (!label || !tier || tier === "NOT_ASSESSED") continue;
    const top = TOP_PRIORITY.exec(folded);
    const raisesIt = top !== null && !NEGATED_TOP.test(folded.slice(0, top.index));
    const dropsIt = DROP.test(folded);
    if ((tier !== "HIGH_UTILITY" && raisesIt) || (tier === "HIGH_UTILITY" && dropsIt && !raisesIt)) found.push({ candidate: label, tier, sentence });
  }
  return found;
}

/**
 * Candidate decisions, as narrow checks: every named candidate accounted for; a priority that depends on unknown
 * context worded as conditional; a subset never ranked above the product containing it; an unstated criterion asked.
 */
function candidateViolations(reply: string, brief: IntelligenceBrief): IntegrityViolation[] {
  const decision = brief.candidates;
  if (!decision || brief.posture.decision === "HARD_STOP") return [];
  const violations: IntegrityViolation[] = [];
  if (decision.request.candidates.length >= 2) {
    for (const label of candidateCompleteness(reply, decision).missing) violations.push({ code: "CANDIDATE_OMITTED", detail: label });
  }
  if (decision.dependsOnUnknown && !CONDITIONAL_FRAME.test(fold(reply))) violations.push({ code: "UNCONDITIONAL_PRIORITY", detail: "unknown_context" });
  const termsOf = (label: string) => decision.request.candidates.find((candidate) => candidate.label === label)?.terms ?? [label];
  for (const priority of decision.priorities) {
    const superset = priority.reasons.find((reason) => reason.startsWith("subset_of:"))?.split(":")[1];
    const containing = superset && decision.request.candidates.find((candidate) => candidate.entity === superset);
    if (!containing) continue;
    const subsetAt = structuredLine(reply, termsOf(priority.candidate), containing.terms);
    const supersetAt = structuredLine(reply, containing.terms, termsOf(priority.candidate));
    const reversed = decision.request.criterion === "LEAST_NECESSARY";
    if (subsetAt >= 0 && supersetAt >= 0 && (reversed ? subsetAt > supersetAt : subsetAt < supersetAt)) {
      violations.push({ code: "RANKING_ORDER_UNSUPPORTED", detail: `${priority.candidate}|${containing.label}` });
    }
  }
  if (decision.request.criterion === "UNSPECIFIED" && !/[?？]/.test(reply)) violations.push({ code: "RANKING_CRITERION_MISSING", detail: "criterion" });
  for (const contradiction of tierContradictions(reply, brief)) violations.push({ code: "TIER_PROSE_CONTRADICTION", detail: `${contradiction.candidate}|${contradiction.tier}` });
  return violations;
}

export function checkOutputIntegrity(input: { reply: string; brief: IntelligenceBrief }): IntegrityViolation[] {
  const { reply, brief } = input;
  const violations: IntegrityViolation[] = [];
  const add = (code: IntegrityViolation["code"], detail: string) => {
    if (!violations.some((violation) => violation.code === code && violation.detail === detail)) violations.push({ code, detail });
  };

  // Explicit language control is absolute (only safety outranks it).
  const share = vietnameseShare(reply);
  const wordCount = tokens(fold(reply)).length;
  if (brief.control.responseLanguage === "EN" && share > 0.2) add("LANGUAGE_CONTROL", "reply is not in English");
  if (brief.control.responseLanguage === "VI" && wordCount >= 8 && share < 0.1) add("LANGUAGE_CONTROL", "reply is not in Vietnamese");

  const foldedReply = fold(reply);
  for (const word of brief.control.addressBans) if (hasTerm(foldedReply, word)) add("ADDRESS_BAN", word);

  // A topic with NO verified knowledge: any asserted effect is the model filling the gap from memory. A PED_DRUG gap is a
  // policy boundary, not missing evidence: "steroids build muscle" is education, and its use rules live in the posture.
  const gaps = brief.knowledge.gaps.filter((gap) => gap.boundary !== "PED_DRUG");
  if (gaps.length > 0) {
    for (const sentence of sentences(reply)) {
      const gap = unverifiedBenefitIn(sentence, gaps);
      if (gap) add("UNVERIFIED_BENEFIT", gap.topic);
    }
  }

  // CLAIM FIDELITY: an asserted effect may match or narrow its claim's outcome and conditions, never broaden them.
  for (const broadening of scopeBroadenings(reply, brief)) add("CLAIM_SCOPE_BROADENED", `${broadening.recordId}|${broadening.concept}|${broadening.kind}`);
  // The same for "it does nothing": only a canonical null finding on that outcome supports it.
  for (const overclaim of negativeOverclaims(reply, brief)) add("NEGATIVE_CLAIM_UNSUPPORTED", `${overclaim.topic}|${overclaim.concept ?? ""}`);

  // SAFETY DEFINES BOUNDARIES, NOT DEFAULT PROSE: a health-sensitive pick that cannot be made still owes bounded help.
  if (brief.recommendation.eligibility === "NEEDS_CLARIFICATION" && !safeContinuationPresent(reply)) add("SAFE_CONTINUATION_MISSING", brief.knowledge.requestedOutcome?.phrase ?? "request");

  // BEST REQUEST != RANKING: a winner named on a request the recommendation decision did not clear for one.
  const eligibility = brief.recommendation.eligibility;
  const outcome = brief.knowledge.requestedOutcome;
  if (outcome && (eligibility === "CAN_EDUCATE" || eligibility === "NEEDS_CLARIFICATION")) {
    const target = TARGET_CLASS.find(([kind]) => kind === outcome.targetClass)?.[1];
    const candidateTerms = [...brief.knowledge.records.filter((record) => record.supplement), ...brief.knowledge.gaps].flatMap((entity) => entity.retrievalTags);
    for (const sentence of sentences(reply)) {
      const folded = fold(sentence);
      if (!WINNER.test(folded) || NEGATION.test(folded)) continue;
      if ((target?.test(folded) ?? false) || candidateTerms.some((term) => hasTerm(folded, term))) add("RANKING_NOT_ELIGIBLE", outcome.phrase);
    }
    if (eligibility === "NEEDS_CLARIFICATION" && !/[?？]/.test(reply)) add("RANKING_NOT_ELIGIBLE", "question");
    // A list of picks is a prescription too: three or more list items answer a pick the decision did not clear.
    if (eligibility === "NEEDS_CLARIFICATION" && outcome.targetClass !== "FOOD" && listItems(reply) >= 3) add("RANKING_NOT_ELIGIBLE", "list");
  }

  for (const violation of candidateViolations(reply, brief)) add(violation.code, violation.detail);

  for (const violation of injuryLoadViolations(reply, brief)) add(violation.code, violation.detail);
  for (const violation of allergenViolations(reply, brief)) add(violation.code, violation.detail);
  if (lowIntakeLoadSentences(reply, brief).length > 0) add("LOW_INTAKE_LOAD_ENDORSED", "extra_load");
  for (const { reminder } of ignoredContextFacts(reply, brief)) add("CONTEXT_FACT_IGNORED", reminder.id);

  const supplements = brief.knowledge.records.filter((record) => record.supplement);
  // H0: under a clinician-owned pick, two or more supplements offered (not negated) in an open request IS the recommendation.
  if (brief.knowledge.openSupplementRequest && personalPickBlocked(brief.posture)) {
    const offered = KNOWLEDGE_RECORDS.filter((record) => record.supplement && sentences(reply).some((sentence) => {
      const folded = fold(sentence);
      return mentions(folded, record) && !NEGATION.test(folded) && !/\b(?:avoid|skip|not (?:recommend|suggest))\b/.test(folded);
    }));
    if (offered.length >= 2) add("RECOMMENDED_UNDER_BOUNDARY", offered.map((record) => record.topic).join(", "));
  }
  if (supplements.length === 0 && !brief.posture.noDosing) return violations;

  // NEED before USE on an open "what should I take" request: the answer may not open with products, and it has to
  // ask for the facts the policy found missing. Checked on structure (order, a question), not on wording.
  // ponytail: order is "any foundation word before the first product", so "natural training … creatine" passes while
  // still being a product list (seen in the live smoke). Upgrade path: judge the first sentence, or a claim extractor.
  if (brief.knowledge.openSupplementRequest && brief.posture.decision === "CLARIFY") {
    const firstProduct = supplements
      .flatMap((record) => record.retrievalTags.map((tag) => foldedReply.search(new RegExp(`(?<![a-z0-9])${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`))))
      .filter((index) => index >= 0)
      .reduce((least, index) => Math.min(least, index), Number.POSITIVE_INFINITY);
    const foundation = foldedReply.search(FOUNDATION);
    if (Number.isFinite(firstProduct) && (foundation < 0 || foundation > firstProduct)) add("NEED_BEFORE_USE", "foundation");
    if (brief.missingContext.length > 0 && !/[?？]/.test(reply)) add("NEED_BEFORE_USE", "question");
  }

  const tierOf = new Map(brief.options.map((option) => [option.recordId, option.tier]));
  for (const sentence of sentences(reply)) {
    const folded = fold(sentence);
    const negated = NEGATION.test(folded);
    for (const record of supplements) {
      if (!mentions(folded, record)) continue;
      const tier = tierOf.get(record.id);
      // OPTIONAL != NECESSARY: no supplement in the registry is required for progress.
      if (NECESSITY.test(folded) && !negated) add("NECESSITY_OVERCLAIM", record.topic);
      // A low-value option offered as a pick, with no condition or negation in the same sentence.
      if ((tier === "LOW_VALUE" || tier === "OUTSIDE_SCOPE") && RECOMMEND.test(folded) && !negated && !CONDITION.test(folded)) add("LOW_VALUE_RECOMMENDED", record.topic);
      // Certainty language above the strongest supporting evidence the registry holds for it.
      if (CERTAINTY.test(folded) && !negated && strongestSupport(getRecord(record.id) ?? record) !== "HIGH") add("CERTAINTY_EXCEEDS_EVIDENCE", record.topic);
      if ((brief.posture.noDosing || brief.knowledge.openSupplementRequest) && DOSE.test(folded)) add("DOSE_UNDER_NO_DOSING", record.topic);
    }
  }
  return violations;
}

const FIX: Record<IntegrityViolation["code"], (detail: string) => string> = {
  LANGUAGE_CONTROL: (detail) => `The ${detail}. The user explicitly asked for that language: rewrite the entire reply in it.`,
  ADDRESS_BAN: (detail) => `The user asked not to be called "${detail}". Remove it and any similar nickname.`,
  LOW_VALUE_RECOMMENDED: (detail) => `You recommended ${detail}, which the evidence places as low value for this user. Say why it adds little here instead of recommending it.`,
  NECESSITY_OVERCLAIM: (detail) => `You described ${detail} as necessary. No supplement is required for progress: describe it as optional and say what it depends on.`,
  CERTAINTY_EXCEEDS_EVIDENCE: (detail) => `You stated the effect of ${detail} with more certainty than the evidence supports. Match the stated evidence strength and name the limitation.`,
  CONTEXT_FACT_IGNORED: (detail) => `The user told you earlier in this chat about something that changes this answer (${detail.replace(/_/g, " ")}), and your answer ignores it. Address it explicitly in the answer, following the SAFETY POSTURE rule for it — do not answer as if it was never said.`,
  INJURY_SITE_LOADED: (detail) => {
    const [site, exercises] = detail.split("|");
    return `The user has a diagnosed ${site} injury and you prescribed movements that load the ${site} (${exercises}), even if light or "friendly". Remove every one. Say plainly that training which loads the ${site} waits for their physio's or doctor's clearance, then offer only training that does not load it.`;
  },
  ALLERGEN_RECOMMENDED: (detail) => {
    const [allergen, items] = detail.split("|");
    return `The user told you they are allergic to ${allergen} (or must avoid it), and your answer still offers ${items}. Remove every suggestion containing ${allergen}, even as "an option" or "if you tolerate it". Say plainly, once, that it is out because of their allergy, and offer only alternatives free of it.`;
  },
  LOW_INTAKE_LOAD_ENDORSED: () => "The user told you they are eating far too little to train safely, and your answer endorses adding cardio or training on top. Do not: say kindly and plainly that extra exercise waits until they are eating enough, that everyday movement they need (like walking to class) is fine, and offer the safer next step (a doctor or dietitian; Gemma, the nutrition coach, can set a sustainable intake).",
  RECOMMENDED_UNDER_BOUNDARY: (detail) => `You offered supplements (${detail}) although the user's situation puts the personal pick with their clinician. Remove the supplement list entirely — a caveat does not make a list safe. Say in one line why the pick belongs to their midwife, doctor or pharmacist here, give the safe help you can (food, training, sleep), and offer to explain any product they want to ask about.`,
  DOSE_UNDER_NO_DOSING: (detail) => `You gave a dose for ${detail}. In this context no dose, timing, stack or cycle may be stated; remove it and explain who makes that decision and why.`,
  UNVERIFIED_BENEFIT: (detail) => `You stated a benefit or effect for ${detail}, which the project has no verified knowledge of. Say what it is and what has been studied, state that no benefit is established here, and assert no effect.`,
  NEED_BEFORE_USE: (detail) =>
    detail === "question"
      ? "You did not ask for the one or two facts that would change the answer. End with them as short, direct questions."
      : "You opened with products. Say first, in one line, what matters more than any supplement here (food, training, sleep), then the one option with strong support as optional, then what depends on facts you do not have yet. Do not present a numbered list of products.",
  TREATMENT_CLAIM: (detail) => `You presented ${detail} as treating or protecting something. A supplement is not a treatment; remove the claim.`,
  RANKING_NOT_ELIGIBLE: (detail) =>
    detail === "question"
      ? "What the user wants from this health-related outcome is not clear yet. End with the one short question that decides it (general prevention, a diagnosed condition, a test result or a symptom)."
      : detail === "list"
        ? "You listed specific exercises or products for a health-sensitive outcome from one symptom: that is a prescription the information does not support. Remove the list. Instead say how to train around it (pain-free range, lighter load, swap what provokes it), which signs mean it should be assessed, and end with the one question that would change the advice (where exactly, since when, which movements provoke it)."
        : `Nothing here establishes a best option for "${detail}". Remove the pick or ranking: describe the options with their own evidence limits, or say none is established here.`,
  CLAIM_SCOPE_BROADENED: (detail) => {
    const [recordId, concept, kind] = detail.split("|");
    const record = getRecord(recordId);
    return supportedScopeLine({ recordId, topic: record?.topic ?? recordId, concept, kind: kind === "CONDITION" ? "CONDITION" : "OUTCOME" });
  },
  CANDIDATE_OMITTED: (detail) => `The user asked about "${detail}" and your answer never names it. Account for every option they listed, each by name with its priority and reason; do not drop, merge or replace any.`,
  UNCONDITIONAL_PRIORITY: () => "Your priority depends on facts you do not have yet, but reads as fixed. Say it is based on what you know so far, state the priority conditionally (\"if …, then …\"), and name what would move an item up or down.",
  RANKING_ORDER_UNSUPPORTED: (detail) => {
    const [subset, superset] = detail.split("|");
    return `You placed ${subset} above ${superset}, but ${subset} is a subset of ${superset}'s contents. Do not rank it higher without a stated reason; if complete protein is already covered, say both add little.`;
  },
  RANKING_CRITERION_MISSING: () => "Nothing says what to rank these by. Say in one line which criterion you used, and ask the one question that would change the order.",
  NEGATIVE_CLAIM_UNSUPPORTED: (detail) => {
    const [topic, concept] = detail.split("|");
    return `You stated that ${topic} does nothing${concept ? ` for ${concept.toLowerCase().replace(/_/g, " ")}` : ""}. Nothing here establishes that: a benefit that is not established, or a null finding in one specific context, is not evidence of no effect. Revise only that sentence: say what was (or was not) found, in which context, or that a benefit is not established in what you can check. Keep every other part of the answer.`;
  },
  TIER_PROSE_CONTRADICTION: (detail) => {
    const [candidate, tier] = detail.split("|");
    const label = { HIGH_UTILITY: "high priority (still optional)", CONDITIONAL: "context-dependent", LOW_VALUE: "low priority / usually skip", OUTSIDE_SCOPE: "outside coaching advice", NOT_ASSESSED: "not placeable without more context" }[tier] ?? tier;
    return `Your wording puts ${candidate} in a different priority class than the decision for this user, which is: ${label}. Keep that class; you may explain it or say what would move it ("worth considering if …"), but do not call it ${tier === "HIGH_UTILITY" ? "skippable" : "high priority, essential or a must-buy"}.`;
  },
  SAFE_CONTINUATION_MISSING: (detail) =>
    `The answer stops at the safety boundary. Keep the boundary (no specific exercise or product prescribed for "${detail}", no diagnosis), and also help: how to train around it without provoking symptoms (pain-free range, lighter load, swapping the movements that provoke it), which signs mean it should be assessed soon, and the one question whose answer would change the advice (where exactly, since when, which movements provoke it). Do not end on "see a professional" alone.`,
};

/** One correction brief for a single regeneration. */
export function integrityCorrectionBrief(violations: IntegrityViolation[]): string {
  return violations.map((violation) => `- ${FIX[violation.code](violation.detail)}`).join("\n");
}

/** Violations that must never reach the user even if regeneration fails (Tier A). */
export function hasCriticalViolation(violations: IntegrityViolation[]): boolean {
  return violations.some((violation) => violation.code === "LANGUAGE_CONTROL" || violation.code === "DOSE_UNDER_NO_DOSING" || violation.code === "UNVERIFIED_BENEFIT");
}

/** Last line of a no-dosing posture: any sentence that pairs a supplement with a dose is removed, whatever the model wrote. */
export function stripDosing(reply: string): string {
  const terms = [...KNOWLEDGE_RECORDS.filter((record) => record.supplement).flatMap((record) => record.retrievalTags), ...KNOWLEDGE_GAPS.flatMap((gap) => gap.retrievalTags)];
  const kept = mapSentencesKeepingLists(reply, (sentence) => {
    const folded = fold(sentence);
    return DOSE.test(folded) && terms.some((term) => hasTerm(folded, term)) ? null : sentence;
  });
  return kept || reply;
}

/**
 * A sentence that broadens a claim is replaced by the narrowed restatement built from the claim itself; every other
 * sentence (the valid comparison, the sibling content) is left exactly as written. Inert when nothing broadens.
 */
function narrowBroadenedClaims(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  if (scopeBroadenings(reply, brief).length === 0) return reply;
  const said = new Set<string>();
  // A list item keeps its marker; one whose heading sentence would vanish (restatement already said) goes whole.
  return mapSentencesKeepingLists(reply, (sentence) => {
    const found = scopeBroadeningsIn(sentence, brief.knowledge.records);
    if (found.length === 0) return sentence;
    const restated = found.map((broadening) => scopedRestatement(broadening, language)).filter((text) => !said.has(text));
    restated.forEach((text) => said.add(text));
    return restated.length > 0 ? restated.join(" ") : null;
  });
}

// About the benefit only: what the gap IS can still be defined, so this never says the topic itself is unverified.
const NOT_ESTABLISHED = {
  // NO SOURCE FOUND != NO EFFECT: say the benefit is not established here, never that the thing does nothing (H0 cluster F).
  en: (topic: string) => `For ${topic}, no benefit is established here — I don't have verified evidence to point to, which is not the same as it having no effect.`,
  vi: (topic: string) => `Với ${topic}, chưa có lợi ích nào được xác lập ở đây — mình chưa có bằng chứng đã kiểm chứng để dựa vào, điều đó không có nghĩa là nó không có tác dụng.`,
};
// Only when the posture carries a medical, medication, pregnancy, treatment or hormonal context: a plain definition gets no doctor line.
const REFER = {
  en: " If there's a health reason behind the question, that's one for a doctor or pharmacist.",
  vi: " Nếu câu hỏi xuất phát từ một vấn đề sức khỏe, bạn nên hỏi bác sĩ hoặc dược sĩ.",
};

/**
 * The deterministic last line, after the one regeneration: what the posture forbids cannot leave, whatever the model wrote.
 * - no-dosing posture → supplement dose sentences are removed
 * - a known knowledge gap → sentences asserting an effect for it are removed; if nothing honest is left, the reply IS the gap
 * Removal only. It never adds a claim, and it does nothing on a turn with neither condition.
 */
export function enforceIntegrity(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  // Whatever a pass removed, the rendered numbering stays contiguous (H0 cluster G: "1., 3., 4." reached users).
  return renumberLists(enforceIntegrityPasses(reply, brief, language));
}

/**
 * The user's active safety facts as decision constraints, on any reply path (Q&A and the agent tool loop alike): a
 * clinically bounded injury's loading, an allergen, extra load on a dangerously low intake are removed, and a fact the
 * reply still ignores gets its one fixed line. Removal plus that line only; a reply touching none of them is returned as is.
 */
export function enforceSafetyConstraints(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  let out = stripInjuryLoading(reply, brief, language);
  out = stripAllergens(out, brief, language);
  out = stripLowIntakeLoad(out, brief, language);
  for (const { reminder, value } of ignoredContextFacts(out, brief)) out = `${out.trim()}\n\n${reminder.line[language](value)}`;
  return out === reply ? reply : renumberLists(out);
}

function enforceIntegrityPasses(reply: string, brief: IntelligenceBrief, language: "en" | "vi"): string {
  let out = brief.posture.noDosing || brief.knowledge.openSupplementRequest ? stripDosing(reply) : reply;
  // An active safety fact the reply still ignores after the one regeneration: one fixed line, appended once.
  out = enforceSafetyConstraints(out, brief, language);
  out = narrowBroadenedClaims(out, brief, language);
  out = calibrateNegativeClaims(out, brief, language);
  const gaps = brief.knowledge.gaps.filter((gap) => !gap.boundary);
  if (gaps.length === 0) return out;
  // A reply that asserts no effect for the gap is returned exactly as written: nothing is bolted onto a clean answer.
  if (!sentences(out).some((sentence) => unverifiedBenefitIn(sentence, gaps))) return out;
  out = reviseClaimSpans(
    out,
    (sentence) => Boolean(unverifiedBenefitIn(sentence, gaps)),
    (span) => {
      const folded = fold(span);
      return BENEFIT.test(folded) && !NEGATION.test(folded);
    },
  ).reply;
  const medical = brief.posture.contexts.some((context) => context !== "AGE_CONTEXT" && context !== "STIMULANT_RISK");
  const stated = NOT_ESTABLISHED[language](gaps.map((gap) => gap.topic).join(", ")) + (medical ? REFER[language] : "");
  // A short identity clause is still an answer. Only a reply with nothing left becomes the gap statement.
  if (tokens(fold(out)).length < 8 && !/\b(?:is|are|là)\b/i.test(out)) return stated;
  // Say it once: if the reply (or the treatment-claim caveat appended before this) already states the gap, add nothing.
  return /established|verified|not proof of a health benefit|no (?:good |strong )?evidence|xac lap|chung minh|kiem chung/.test(fold(out)) ? out : `${out}\n\n${stated}`;
}
