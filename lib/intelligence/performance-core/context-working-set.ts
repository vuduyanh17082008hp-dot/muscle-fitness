import { fold } from "./text";

/**
 * CONTEXT WORKING SET (H0 systemic repair, cluster A). What the user told us earlier in THIS conversation that still
 * matters now, selected from the raw user turns — never the raw transcript itself.
 *
 *   RAW HISTORY → user-authored fact candidates → correction / cessation / negation resolution → bounded working set
 *
 * - Only USER words become facts. An assistant inference never does (the caller passes user turns only).
 * - recent != relevant, old != irrelevant: a safety fact (PED use, pregnancy, injury, allergy, medication, condition,
 *   dangerously low intake, red-flag symptom) stays ACTIVE until the user ends, negates or corrects it; ordinary chat
 *   is dropped.
 * - USER_CORRECTION > PRIOR USER STATE > INFERENCE: a later statement about the same key supersedes the earlier one; the
 *   earlier one stays visible as SUPERSEDED (history kept, authority moved).
 * ponytail: cue lists over folded text, not a parser — same ceiling as policy.ts; upgrade path is a classifier that
 * emits the same ContextFact shape.
 */

export type ContextFactKind =
  | "PED_USE" | "PREGNANCY" | "INJURY" | "ALLERGY" | "MEDICATION" | "CONDITION" | "LOW_ENERGY_INTAKE" | "SYMPTOM"
  | "BODYWEIGHT" | "PROTEIN_INTAKE" | "DIET_PATTERN" | "GOAL" | "SELF_REPORT";

/** CURRENT = true now as stated; HISTORICAL = true in the past (ended, or stated as past). */
export type ContextTemporal = "CURRENT" | "HISTORICAL";
export type ContextOrigin = "USER_STATEMENT" | "USER_CORRECTION";
export type ContextRelevance = "SAFETY" | "DOMAIN";
export type ContextStatus = "ACTIVE" | "SUPERSEDED";

export type ContextFact = {
  /** Identity for supersession: "PED_USE", "INJURY:shoulder", "ALLERGY:fish", "BODYWEIGHT"… */
  key: string;
  kind: ContextFactKind;
  relevance: ContextRelevance;
  temporal: ContextTemporal;
  origin: ContextOrigin;
  status: ContextStatus;
  /** Canonical, user-neutral description. Never the model's words. */
  label: string;
  value?: number;
  unit?: string;
  /** 0 = the current message, 1 = the previous user message… */
  turnsAgo: number;
  /** The user's own words, bounded. */
  quote: string;
  /** Label of the fact that replaced this one, when SUPERSEDED. */
  supersededBy?: string;
  /** Set when the fact was told to the OTHER coach (a cross-coach disclosure), e.g. "told Gemma (nutrition coach)". */
  via?: string;
};

export type ContextWorkingSet = {
  facts: ContextFact[];
  /** The previous user message, kept only when the current one is a short follow-up that may lean on it. */
  followUpOf: string | null;
};

type Op = "ASSERT" | "END" | "NEGATE";
type Candidate = Omit<ContextFact, "status" | "turnsAgo" | "quote" | "origin" | "temporal"> & { op: Op; temporal?: ContextTemporal };

/* ---------- lexicon (folded text) ---------- */

const PED_TERM = String.raw`(?:steroids?|aas|anabolics?|roids|gear|juice|tren(?:bolone)?|test(?:osterone)?(?:\s*(?:e|c|cyp|enanthate|cypionate|prop|\d{2,4}))?|anavar|oxandrolone|var|dbol|dianabol|deca|nandrolone|winstrol|winny|anadrol|masteron|primo(?:bolan)?|sarms?|ostarine|rad\s?-?140|lgd|clen(?:buterol)?|hgh|growth hormone|peds?|cycle|blast)`;
// "cycle" is a PED only outside training / menstrual / sleep usage.
const NON_PED_CYCLE = /\b(?:training|menstrual|period|meso|macro|micro|sleep|wash|spin|deload|bulk(?:ing)?|cut(?:ting)?|strength|program(?:me)?|bike|bicycle)\s*-?cycles?\b|\bcycles? (?:of training|class|ride|tracking)\b|\bcycling\b/;
const FIRST_PERSON = /(?<![a-z])(?:i|i'?m|im|i'?ve|ive|my|me|mine|minh|toi|tao|em)(?![a-z])/;
const CORRECTION_CUE = /(?<![a-z])(?:actually|correction|i meant|i mean|sorry,? i meant|no wait|wait no|scratch that|typo|my bad|not \d+(?:\.\d+)? ?(?:kg|lbs?|g)?,? (?:it'?s|but)|thuc ra|nham|y (?:minh|toi|tao) la|sua lai)(?![a-z])/;
const NEGATION = /(?<![a-z])(?:not|never|no|don'?t|do not|doesn'?t|haven'?t|have never|isn'?t|aren'?t|wasn'?t|khong|chua tung|chua)(?![a-z])/;

const PED_CURRENT = [
  new RegExp(String.raw`\b(?:i'?m|i am|im|currently|been|still|now|right now|if i'?m|if im)\s+(?:on|running|using|taking|blasting|cruising|pinning|juicing|doing)\b[^.?!]{0,30}\b${PED_TERM}\b`),
  new RegExp(String.raw`\b(?:i|we)\s+(?:run|use|take|inject|pin|blast|cruise|cycle|started|start)\b[^.?!]{0,25}\b${PED_TERM}\b`),
  // Subject dropped, the way people actually type it: "running anavar right now", "using tren", "started anavar last week".
  new RegExp(String.raw`(?:^|[.!?]\s+)(?:(?:bro|so|yeah|yep|ok|okay|currently|just)[\s,]+)*(?:running|using|taking|blasting|cruising|pinning|juicing|started|starting)\s+(?:a |my |some |the |first )?${PED_TERM}\b`),
  /\b(?:i'?m|i am|im)\s+(?:enhanced|not natty|not natural|on gear|juicing|blasting)\b/,
  new RegExp(String.raw`\b(?:on|running)\s+(?:a |my |the )?(?:cycle|blast|gear)\b`),
  new RegExp(String.raw`\bon\s+(?:test|tren|anavar|var|dbol|deca|winstrol|sarms?|ostarine|clen|hgh|steroids?|peds?|aas)\b`),
  // A bare compound with a weekly dose or a compound pair ("test 500 and tren", "test + deca") is a stated regimen, not a question.
  /^(?!\s*(?:what|whats|is|are|does|do|how|why|la gi)\b)\s*(?:i'?m |im |on |running )?(?:test(?:osterone)?|tren|deca|anavar|var|dbol|winstrol|winny|primo|masteron|eq|npp)\b[^.?!]{0,12}(?:\d{2,4}\s*(?:mg)?|\s(?:\+|and|&|with)\s*(?:test|tren|deca|anavar|var|dbol|winstrol|primo|masteron|eq|npp)\b)/,
  // Vietnamese (folded): "đang on cycle", "đang dùng/xài/chích tren"
  new RegExp(String.raw`\bdang\s+(?:on|chay|dung|xai|chich|tiem|uong|cycle)\b[^.?!]{0,25}\b${PED_TERM}\b|\bdang on (?:cycle|gear)\b`),
];
const PED_END = [
  new RegExp(String.raw`\b(?:stopped|quit|came off|come off|got off|finished|ended|dropped)\b[^.?!]{0,30}\b${PED_TERM}\b`),
  new RegExp(String.raw`\b(?:not on|no longer on|off)\s+(?:a |my |the )?${PED_TERM}\b[^.?!]{0,15}\b(?:anymore|any more|now|these days)\b|\bno longer (?:using|taking|running|on)\b`),
  new RegExp(String.raw`\b(?:i|i'?ve|ive)\s+(?:stopped|quit|came off|got off)\b[^.?!]{0,25}\b(?:ago|weeks?|months?|years?|already)\b`),
  // "I was on cycle but came off two weeks ago": the drug is named before the verb (final rerun HX09).
  new RegExp(String.raw`\b(?:was|were|been)\s+on\b[^.?!]{0,25}\b${PED_TERM}\b[^.?!]{0,20}\b(?:but|and|then)\s+(?:i\s+)?(?:stopped|quit|came off|got off|finished)\b`),
  /\b(?:da )?(?:ngung|ngung han|bo|dung)\b[^.?!]{0,12}\b(?:roi|duoc|thang|tuan|nam)\b/,
];
const PED_HISTORICAL = new RegExp(String.raw`\b(?:used to|did|ran|had|took|tried|done)\b[^.?!]{0,20}\b${PED_TERM}\b[^.?!]{0,40}\b(?:ago|last year|years?|before|in the past|once)\b|\b(?:one|a|my first|a single)\s+${PED_TERM}\b[^.?!]{0,20}\b(?:ago|last year|years? back)\b`);
const PED_NEGATE = [
  new RegExp(String.raw`\b(?:not|never|don'?t|do not|haven'?t|have never|never have)\b[^.?!]{0,15}\b(?:on|use|used|take|taking|touched|done|run|ran)\b[^.?!]{0,15}\b${PED_TERM}\b`),
  /\b(?:i'?m|i am|im|i stay|staying|100%|fully)\s+(?:natural|natty|drug[- ]free)\b/,
  new RegExp(String.raw`\b(?:khong|chua tung|chua)\s+(?:dung|xai|chich|on)\b[^.?!]{0,15}\b${PED_TERM}\b`),
];

const PREGNANT = /\b(?:i'?m|i am|im|currently|weeks?|months?|trimester)\b[^.?!]{0,20}\bpregnan\w*\b|\bpregnan(?:t|cy)\b[^.?!]{0,10}\b(?:weeks?|trimester)\b|\b(?:dang )?(?:mang thai|co bau|co thai)\b|^\s*pregnant\b/;
const PREGNANT_NEGATE = /\b(?:not|no longer|isn'?t|aren'?t)\s+pregnan\w*|\bkhong (?:mang thai|co bau)\b/;
const PREGNANT_END = /\b(?:gave birth|had (?:my|the) baby|postpartum|post-partum|just delivered|da sinh|moi sinh)\b/;
const CONCEIVING = /\btrying to (?:get pregnant|conceive|have a baby)\b|\bdang (?:co gang )?co con\b/;
const BREASTFEEDING = /\b(?:breast-?feeding|nursing my|cho con bu)\b/;

const SITES: Array<[string, RegExp]> = [
  ["shoulder", /\b(?:shoulders?|rotator[- ]?cuff|cuff|labrum|ac joint|vai|chop xoay)\b/],
  ["knee", /\b(?:knees?|acl|mcl|meniscus|patell\w*|goi|sun chem)\b/],
  ["lower back", /\b(?:lower back|low back|lumbar|disc|discs|sciatica|that lung|lung duoi)\b/],
  ["back", /\b(?:back|lung)\b/],
  ["neck", /\bneck\b/],
  ["wrist", /\b(?:wrists?|co tay)\b/],
  ["elbow", /\b(?:elbows?|tennis elbow|golfer'?s elbow|khuyu tay)\b/],
  ["hip", /\b(?:hips?|hong)\b/],
  ["ankle", /\b(?:ankles?|achilles|co chan)\b/],
  ["hamstring", /\bhamstrings?\b/],
  ["groin", /\bgroin\b/],
  ["foot", /\b(?:foot|feet|plantar)\b/],
];
const INJURY_CUE = /\b(?:diagnosed|torn|tear|tore|ruptured?|sprain\w*|strain(?:ed)?|fractur\w*|broken|broke|herniat\w*|bulging|dislocat\w*|tendin\w*|impinge\w*|injur\w*|surgery|reconstruct\w*|pain|painful|hurts?|hurting|aches?|aching|tweaked|pulled|chan thuong|dau|bi dau|rach|dut)\b/;
const INJURY_END = /\b(?:healed|fully recovered|recovered fully|all good now|better now|no longer hurts?|doesn'?t hurt (?:anymore|any more)|pain is gone|cleared (?:by|to)|het dau|lanh roi|khoi roi)\b/;
const INJURY_NEGATE = /\b(?:no|not|without|doesn'?t|don'?t have|khong)\s+(?:any\s+)?(?:\w+\s+)?(?:pain|injur\w*|hurt|dau)\b/;
const CLINICIAN = String.raw`(?:physio\w*|doctor|dr|surgeon|clinician|physical therapist|pt|ortho\w*|gp|specialist|bac si|chuyen gia)`;
// A clinician's movement restriction is part of the injury fact: "told me to avoid painful overhead loading". H1-LM: the
// shorthand people type counts too — "Physio: rotator cuff tear, avoid overhead loading", "physio says no overhead work".
const CLINICIAN_RESTRICTION = new RegExp(String.raw`\b${CLINICIAN}\b[^.?!]{0,60}?(?:\b(?:told|tells|said|says|advised|advises|wants|asked|instructed|recommended|recommends|bao|dan|noi)\b|:)[^.?!]{0,40}?\b((?:not to|to avoid|to stop|to skip|to stay away from|to keep away from|keep away from|stay away from|no|avoid|tranh|khong)\b[^.?!;]{3,60})`);
// The restriction names the site when the user does not: overhead work is the shoulder.
const RESTRICTION_SITE: Array<[string, RegExp]> = [["shoulder", /\b(?:overhead|qua dau)\b/]];
// "My physio cleared me", "that restriction was temporary, the doctor signed me off": the user reports the clearance.
const CLINICIAN_CLEARED = new RegExp(String.raw`\b${CLINICIAN}\b[^.?!]{0,30}\b(?:cleared|signed (?:me )?off|gave me the (?:all[- ]clear|green light|go-?ahead)|said i'?m (?:fine|good|ok|cleared)|cho phep)\b|\b(?:restriction|limit)\b[^.?!]{0,30}\b(?:temporary|lifted|over|ended)\b`);

const ALLERGENS: Array<[string, RegExp]> = [
  ["shellfish", /\b(?:shellfish|shrimp|prawns?|crab|lobster|seafood|hai san)\b/],
  ["fish", /\b(?:(?:fin)?fish|salmon|tuna|cod|mackerel|sardines?|anchov\w*|trout|tilapia|herring|seafood|hai san)\b/],
  ["peanuts or tree nuts", /\b(?:peanuts?|tree nuts?|nuts|almonds?|cashews?|dau phong)\b/],
  ["dairy or lactose", /\b(?:dairy|milk|lactose|whey|casein)\b/],
  ["eggs", /\beggs?\b/],
  ["soy", /\b(?:soy|soya|dau nanh)\b/],
  ["gluten or wheat", /\b(?:gluten|wheat|celiac|coeliac|lua mi)\b/],
  ["sesame", /\bsesame\b/],
];
// Short Vietnamese words fold onto common ones (cá/cả, tôm/tóm, cua/của, sữa/sửa, trứng/tập trung, mè/mẹ, lạc/lạc quan):
// they name an allergen only right after "dị ứng (với)".
const VI_BARE: Record<string, string> = { shellfish: "tom|cua", fish: "ca", "peanuts or tree nuts": "lac|hat", "dairy or lactose": "sua", eggs: "trung", sesame: "me" };
const namesAllergen = (item: string, re: RegExp, text: string) =>
  re.test(text) || (VI_BARE[item] !== undefined && new RegExp(String.raw`\bdi ung (?:voi )?(?:${VI_BARE[item]})\b`).test(text));
const ALLERGY_CUE = /\b(?:allergic|allergy|allergies|intoleran\w*|celiac|coeliac|anaphyla\w*|di ung)\b/;
const ALLERGY_NEGATE = /\b(?:not allergic|no (?:known )?(?:food )?allergies|no allergy|khong (?:bi )?di ung)\b/;
// H1-LM: a first-person report of a reaction to a NAMED food is a possible adverse reaction even without the word "allergy":
// "fish makes my throat itch", "after salmon my throat started itching", "I react badly to fish", "ăn cá là bị ngứa họng".
// One clause must carry the symptom, the food and a causal / temporal link. It is kept as POSSIBLE (user report), never
// promoted to a confirmed allergy — but the food is not recommended while it stands.
const REACTION_SYMPTOM = /\b(?:hives|rash\w*|swell\w*|itch\w*|anaphyla\w*|epi-?pen|throat (?:tight\w*|clos\w*)|tingl\w*|wheez\w*|react\w*(?! (?:well|fine|great|ok|okay|normally))|reactions?|(?:noi )?me day|ngua|sung|phat ban|kho tho)\b/;
const REACTION_LINK = /\b(?:after|from|when|whenever|every time|each time|any time|if i|makes?|made|gives?|gave|causes?|caused|triggers?|triggered|sets? off|to|sau khi|moi lan|khi|thi|lam|khien|bi|an vao|an xong)\b/;
const REACTION_NEGATED = /\b(?:no|not|never|don'?t|doesn'?t|didn'?t|isn'?t|khong|chua)\b/;
const reactionClauses = (text: string) => text.split(/[.?!;]|\bbut\b|\bnhung\b/).filter((clause) => REACTION_SYMPTOM.test(clause) && REACTION_LINK.test(clause) && !aboutSomeoneElse(clause));
// Bare Vietnamese food words name the food only right after "ăn" or as the subject of "làm / khiến" in a reaction clause.
const namesReactionFood = (item: string, re: RegExp, clause: string) =>
  re.test(clause) || (VI_BARE[item] !== undefined && new RegExp(String.raw`\b(?:an (?:vao |mon )?|di ung (?:voi )?)(?:${VI_BARE[item]})\b|(?:^|\s)(?:${VI_BARE[item]}) (?:lam|khien)\b`).test(clause));
const CLINICIAN_AVOID = /\b(?:doctor|dr|allergist|gp|physician|clinician|dietitian|bac si)\b[^.?!]{0,40}\b(?:told|tells|said|says|advised|wants|asked|bao|dan)\b[^.?!]{0,12}\b(?:avoid|stay away from|steer clear of|keep away from|not (?:to )?eat|cut out|kieng|tranh)\b/;
// Ended in the user's own words: outgrown, re-tested negative. A bare "used to be allergic" stays current (safety-first).
const ALLERGY_END = /\b(?:outgrew|outgrown|grew out of|no longer allergic|not allergic (?:anymore|any more)|allergist (?:cleared|said i'?m not)|passed (?:an?|my|the) (?:oral )?(?:food )?challenge|het di ung)\b/;

const MEDICATIONS: Array<[string, string, RegExp]> = [
  ["ssri", "an SSRI / antidepressant", /\b(?:ssris?|snris?|antidepress\w*|sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|venlafaxine|effexor|duloxetine|thuoc chong tram cam)\b/],
  ["maoi", "an MAOI", /\b(?:maois?|phenelzine|tranylcypromine|selegiline)\b/],
  ["anticoagulant", "a blood thinner (anticoagulant)", /\b(?:warfarin|coumadin|blood thinners?|anticoagulants?|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|clopidogrel|plavix|thuoc chong dong)\b/],
  ["insulin", "insulin", /\binsulin\b/],
  ["metformin", "metformin", /\bmetformin\b/],
  ["statin", "a statin", /\b(?:statins?|atorvastatin|rosuvastatin|simvastatin|lipitor|crestor)\b/],
  ["bp_medication", "blood-pressure medication", /\b(?:blood pressure (?:meds|medication|pills?|tablets?)|bp meds|lisinopril|amlodipine|losartan|ramipril|beta[- ]blockers?|propranolol|metoprolol|thuoc huyet ap)\b/],
  ["thyroid", "thyroid medication", /\b(?:levothyroxine|synthroid|thyroxine|thyroid (?:meds|medication|pills?))\b/],
  ["isotretinoin", "isotretinoin (Accutane)", /\b(?:accutane|isotretinoin|roaccutane)\b/],
  ["stimulant_adhd", "an ADHD stimulant", /\b(?:adderall|vyvanse|ritalin|concerta|methylphenidate|dexamfetamine|lisdexamfetamine)\b/],
  ["lithium", "lithium", /\blithium\b/],
  ["generic", "a prescription medication (unspecified)", /\b(?:medications?|meds|prescription|prescribed|uong thuoc|dang dung thuoc|thuoc ke don)\b/],
];
const MED_PERSONAL = /\b(?:i'?m on|i am on|im on|on (?:a |an )?|i take|i'?m taking|im taking|taking|i use|prescribed|my (?:doctor|gp) (?:put|has) me on|started|dang uong|dang dung|minh uong)\b/;
const MED_END = /\b(?:stopped|quit|came off|off|no longer (?:on|taking)|ngung)\b/;

const CONDITIONS: Array<[string, string, RegExp]> = [
  ["kidney_disease", "kidney disease", /\b(?:kidney (?:disease|failure|problems?|issues?|damage)|ckd|renal (?:disease|failure|impairment)|benh than|suy than)\b/],
  ["type1_diabetes", "type 1 diabetes", /\b(?:type ?1 diabet\w*|t1d|t1 diabet\w*|type one diabet\w*|tieu duong (?:tuyp|type|loai) ?1)\b/],
  ["type2_diabetes", "type 2 diabetes", /\b(?:type ?2 diabet\w*|t2d|type two diabet\w*|tieu duong (?:tuyp|type|loai) ?2)\b/],
  ["diabetes", "diabetes (type not stated)", /\b(?:diabet\w*|tieu duong)\b/],
  ["hypertension", "high blood pressure", /\b(?:high blood pressure|hypertension|hypertensive|high bp|huyet ap cao|cao huyet ap)\b|\b(?:blood pressure|bp|huyet ap)\s+(?:has been|is|was|'s|keeps|been|dang|bi)\s*(?:really |very |pretty |a bit |kinda )?(?:high|elevated|up|through the roof|cao)\b/],
  ["heart_condition", "a heart condition", /\b(?:heart (?:condition|disease|problems?|murmur|failure)|arrhythmia|afib|atrial fibrillation|cardiomyopathy|benh tim)\b/],
  ["concussion", "a recent concussion", /\b(?:concussion|concussed|head injury|chan dong nao)\b/],
  ["epilepsy", "epilepsy / seizures", /\b(?:epilep\w*|seizures?|dong kinh)\b/],
  ["asthma", "asthma", /\b(?:asthma|hen suyen)\b/],
  ["liver_disease", "liver disease", /\b(?:liver (?:disease|problems?|damage|failure)|fatty liver|hepatitis|cirrhosis|benh gan)\b/],
  ["eating_disorder", "an eating disorder (current or past)", /\b(?:eating disorder|anorexi\w*|bulimi\w*|binge eating disorder|roi loan an uong)\b/],
];
const CONDITION_PERSONAL = /\b(?:i have|i'?ve got|ive got|i had|i'?m|im|i am|diagnosed|my|living with|suffer from|minh bi|toi bi|bi)\b/;
const CONDITION_PAST = /\b(?:years? ago|as a (?:kid|child|teen)|in the past|used to have|had .{0,20} (?:years?) ago|recovered from|nam truoc)\b/;

const SYMPTOMS: Array<[string, string, RegExp]> = [
  ["chest_pain", "chest pain or chest tightness", /\bchest (?:pain|tight\w*|pressure|hurts?)\b|\bdau nguc\b|\btuc nguc\b/],
  ["palpitations", "racing heart / palpitations", /\b(?:heart (?:is )?racing|racing heart|palpitation\w*|heart pounding|tim dap nhanh)\b/],
  ["fainting", "fainting or near-fainting", /\b(?:fainted|passed out|blacked out|fainting|ngat|xiu)\b/],
  ["breathless", "unusual shortness of breath", /\b(?:can'?t breathe|short(?:ness)? of breath|kho tho)\b/],
  ["dizziness", "dizziness", /\b(?:dizzy|dizziness|lightheaded|chong mat)\b/],
];

const DIETS: Array<[string, RegExp]> = [
  ["vegan", /\bvegan\b|\ban chay truong\b/],
  ["vegetarian", /\bvegetarian\b|\ban chay\b/],
  ["pescatarian", /\bpescatarian\b/],
  ["keto", /\b(?:keto|ketogenic)\b/],
];
const GOALS: Array<[string, RegExp]> = [
  ["fat loss (cutting)", /\b(?:i'?m cutting|im cutting|on a cut|cutting phase|lose (?:fat|weight)|losing (?:fat|weight)|get(?:ting)? lean|shred\w*|dang giam can|giam mo|giam can)\b/],
  ["muscle gain (bulking)", /\b(?:i'?m bulking|im bulking|on a bulk|bulking phase|gain (?:muscle|mass|weight|size)|build(?:ing)? muscle|tang co|tang can|dang bulk)\b/],
  ["strength", /\b(?:get stronger|gain strength|powerlifting meet|strength goal)\b/],
  ["endurance", /\b(?:marathon|half marathon|triathlon|endurance (?:goal|event))\b/],
];

const LIFT_CONTEXT = /\b(?:squat\w*|bench\w*|deadlift\w*|press\w*|lift\w*|row\w*|curl\w*|1rm|pr|reps?|sets?|dumbbells?|barbell|plates?|x\s?\d)\b/;

/* ---------- per-turn extraction ---------- */

const clip = (text: string, max = 110) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);

// H1 non-pollution: "my friend has a fish allergy", "my mum tore her rotator cuff" are someone else's facts. A clause with a
// third-party subject and no first-person subject of its own (once "my <person>" is taken out) is not the user's.
const PEOPLE = String.raw`(?:friends?|mum|mom|mother|dad|father|brother|sister|wife|husband|partner|girlfriend|boyfriend|son|daughter|kids?|child(?:ren)?|clients?|co-?workers?|colleagues?|teammates?|roommates?|cousin|uncle|aunt|grand(?:ma|pa|mother|father))`;
const OTHER_PERSON = new RegExp(String.raw`\b(?:${PEOPLE}|someone|somebody|he|she|they|his|her|their|ban toi|me toi|bo toi|anh toi|chi toi|em toi|vo toi|chong toi)\b`);
const MY_PERSON = new RegExp(String.raw`\b(?:my|our)\s+(?:best |older |younger |little )?${PEOPLE}\b`, "g");
const aboutSomeoneElse = (clause: string) => OTHER_PERSON.test(clause) && !FIRST_PERSON.test(clause.replace(MY_PERSON, " "));
const allergyIsSomeoneElses = (text: string) => {
  // Judged per clause: "my sister is allergic to shellfish, so I cook without it" is the sister's allergy, not the user's.
  const parts = text.split(/[.?!;,]|\b(?:so|but|because|which is why)\b/).filter((part) => ALLERGY_CUE.test(part) || CLINICIAN_AVOID.test(part));
  return parts.length > 0 && parts.every(aboutSomeoneElse);
};
// "What is a fish allergy like?" asks; it does not disclose.
const generalQuestion = (raw: string, text: string) => /\?\s*$/.test(raw.trim()) && !FIRST_PERSON.test(text);

function extractTurn(raw: string, active: ReadonlyMap<string, ContextFact>, lastPedMention = false): Candidate[] {
  const text = fold(raw);
  const out: Candidate[] = [];
  const correction = CORRECTION_CUE.test(text);

  // PED use. Prescribed testosterone (TRT) is a medication, not PED use, unless a cycle or non-prescribed compound is named.
  const prescribedOnly = /\b(?:trt|testosterone replacement|prescribed (?:test|testosterone)|my (?:doctor|endo\w*|gp|urologist) (?:put|has) me on)\b/.test(text) && !/\b(?:cycle|blast|tren|deca|anavar|dbol|sarms?|stack|gear)\b/.test(text);
  if (prescribedOnly && FIRST_PERSON.test(text)) out.push({ key: "MEDICATION:trt", kind: "MEDICATION", relevance: "SAFETY", op: "ASSERT", label: "takes prescribed testosterone (TRT)" });
  const pedText = prescribedOnly ? "" : NON_PED_CYCLE.test(text) ? text.replace(NON_PED_CYCLE, " ") : text;
  const pedLabel = { key: "PED_USE", kind: "PED_USE" as const, relevance: "SAFETY" as const };
  if (PED_NEGATE.some((re) => re.test(pedText))) out.push({ ...pedLabel, op: "NEGATE", label: "states they do not use anabolic steroids / PEDs" });
  else if (PED_END.some((re) => re.test(pedText)) && (active.has("PED_USE") || new RegExp(`\\b${PED_TERM}\\b`).test(pedText))) {
    out.push({ ...pedLabel, op: "END", label: "used anabolic steroids / PEDs before and has STOPPED — historical, not current use" });
  } else if (PED_HISTORICAL.test(pedText)) {
    out.push({ ...pedLabel, op: "ASSERT", temporal: "HISTORICAL", label: "used anabolic steroids / PEDs in the past — historical, not current use" });
  } else if (PED_CURRENT.some((re) => re.test(pedText))) {
    out.push({ ...pedLabel, op: "ASSERT", label: "is CURRENTLY using anabolic steroids or other PEDs (performance-enhancing drugs)" });
  } else if (/\binsulin\b/.test(pedText) && /\b(?:bulk\w*|gains?|bodybuild\w*|mass|size|cycle|tang co)\b/.test(pedText) && /\b(?:i|i'?m|im|use|using|take|taking|run|running|pin\w*|inject\w*|dang)\b/.test(pedText) && !/\b(?:what|why|how does|is it)\b/.test(pedText)) {
    out.push({ ...pedLabel, op: "ASSERT", label: "is CURRENTLY using insulin for bodybuilding (non-medical) — dangerous low blood sugar is the main risk" });
  } else if (lastPedMention && /\b(?:i'?m|im|i am|i'?ve been|already|currently|been)\s+(?:already\s+)?(?:using|on|taking|running|pinning)\s+(?:it|that|this|them|those)\b|\bdang (?:dung|xai) (?:no|cai do|roi)\b/.test(pedText)) {
    // "What is Anavar?" … "I'm already using it." — the pronoun points at the drug the user just named.
    out.push({ ...pedLabel, op: "ASSERT", label: "is CURRENTLY using anabolic steroids or other PEDs (performance-enhancing drugs)" });
  }

  // Pregnancy / conception / breastfeeding
  if (PREGNANT_NEGATE.test(text)) out.push({ key: "PREGNANCY", kind: "PREGNANCY", relevance: "SAFETY", op: "NEGATE", label: "not pregnant" });
  else if (PREGNANT_END.test(text)) out.push({ key: "PREGNANCY", kind: "PREGNANCY", relevance: "SAFETY", op: "END", label: "recently gave birth (postpartum)" });
  else if (PREGNANT.test(text)) out.push({ key: "PREGNANCY", kind: "PREGNANCY", relevance: "SAFETY", op: "ASSERT", label: "is pregnant" });
  else if (CONCEIVING.test(text)) out.push({ key: "PREGNANCY", kind: "PREGNANCY", relevance: "SAFETY", op: "ASSERT", label: "is trying to conceive" });
  if (BREASTFEEDING.test(text) && !NEGATION.test(text.match(/[^.?!]*(?:breast-?feeding|nursing|cho con bu)/)?.[0] ?? "")) {
    out.push({ key: "BREASTFEEDING", kind: "PREGNANCY", relevance: "SAFETY", op: "ASSERT", label: "is breastfeeding" });
  }

  // Injury / pain, per body site. Muscle soreness after training is not an injury.
  const activeSites = [...active.keys()].filter((key) => key.startsWith("INJURY:")).map((key) => key.slice(7));
  // "Can a rotator cuff tear heal without surgery?" asks; it does not disclose.
  for (const clause of generalQuestion(raw, text) ? [] : text.split(/[.?!;]|\bbut\b/)) {
    const cleared = CLINICIAN_CLEARED.test(clause);
    const restricted = CLINICIAN_RESTRICTION.test(clause);
    if (!INJURY_CUE.test(clause) && !INJURY_END.test(clause) && !cleared && !restricted) continue;
    const site = SITES.find(([, re]) => re.test(clause))?.[0] ?? (restricted ? RESTRICTION_SITE.find(([, re]) => re.test(clause))?.[0] : undefined);
    // An end or a clearance with no site named points at the injury already on record (only when there is exactly one).
    const anySite = site ?? ((INJURY_END.test(clause) || cleared) && activeSites.length === 1 ? activeSites[0] : undefined);
    if (!anySite || aboutSomeoneElse(clause)) continue;
    if (site === "back" && /\b(?:back (?:day|workout|session|exercises?)|lat|lats)\b/.test(clause)) continue;
    if (/\b(?:sore|doms|soreness|pump)\b/.test(clause) && !/\b(?:pain|injur\w*|torn|tear|diagnos\w*|sprain\w*|strain\w*)\b/.test(clause)) continue;
    const key = `INJURY:${anySite}`;
    const restriction = clause.match(CLINICIAN_RESTRICTION)?.[1]?.trim();
    if (cleared && !restriction) out.push({ key, kind: "INJURY", relevance: "SAFETY", op: "END", label: `${anySite} injury — the user reports their clinician cleared them (user report, not verified)` });
    else if (INJURY_END.test(clause)) out.push({ key, kind: "INJURY", relevance: "SAFETY", op: "END", label: `${anySite} injury or pain — the user says it has resolved` });
    else if (INJURY_NEGATE.test(clause) && !restriction) out.push({ key, kind: "INJURY", relevance: "SAFETY", op: "NEGATE", label: `no ${anySite} pain` });
    // Verbless disclosures are the user's too: "Rotator cuff tear, …", "Torn cuff, no painful overhead work".
    else if (FIRST_PERSON.test(clause) || /\b(?:diagnosed|torn|tear|tore|ruptured?|herniat\w*|fractur\w*|rach|dut)\b/.test(clause) || /^\s*\w+ (?:pain|hurts)/.test(clause) || restriction) {
      const diagnosed = /\b(?:diagnosed|torn|tear|tore|ruptured?|fractur\w*|broken|herniat\w*|dislocat\w*|surgery|reconstruct\w*|rach|dut)\b/.test(clause);
      const base = diagnosed ? `${anySite}: diagnosed / structural injury` : `${anySite} pain or injury`;
      out.push({ key, kind: "INJURY", relevance: "SAFETY", op: "ASSERT", label: restriction ? `${base}; clinician restriction: ${clip(restriction, 70)}` : base });
    }
  }

  // "Sorry, not my knee, it's my hip": the correction moves the injury — the old site ends, the new one inherits its label.
  const moved = text.match(/\bnot (?:my |the )?([a-z ]{3,14}?),? (?:it'?s|its|it is|i meant|i mean) (?:my |the )?([a-z ]{3,14}?)\b(?:[.!?,]|$)/);
  if (moved) {
    const from = SITES.find(([, re]) => re.test(moved[1]))?.[0];
    const to = SITES.find(([, re]) => re.test(moved[2]))?.[0];
    const previous = from ? active.get(`INJURY:${from}`) : undefined;
    if (from && to && from !== to && previous) {
      out.push({ key: `INJURY:${from}`, kind: "INJURY", relevance: "SAFETY", op: "NEGATE", label: `not the ${from} (user correction)` });
      out.push({ key: `INJURY:${to}`, kind: "INJURY", relevance: "SAFETY", op: "ASSERT", label: previous.label.replace(from, to) });
    }
  }

  // Allergies. A negation or an end names its allergen ("not allergic to dairy" leaves a fish allergy alone); unnamed, it
  // covers every allergy on record.
  const allergyEnd = ALLERGY_END.test(text);
  const reactions = generalQuestion(raw, text) ? [] : reactionClauses(text.replace(/\b(?:not sure|khong chac)\b/g, " "));
  const reactionTo = (item: string, re: RegExp, negated: boolean) => reactions.some((clause) => REACTION_NEGATED.test(clause) === negated && namesReactionFood(item, re, clause));
  if (ALLERGY_NEGATE.test(text) || allergyEnd) {
    const named = ALLERGENS.filter(([item, re]) => namesAllergen(item, re, text)).map(([item]) => `ALLERGY:${item}`);
    for (const key of active.keys()) {
      if (key.startsWith("ALLERGY:") && (named.length === 0 || named.includes(key))) out.push({ key, kind: "ALLERGY", relevance: "SAFETY", op: allergyEnd ? "END" : "NEGATE", label: allergyEnd ? `${key.slice(8)} allergy — the user says they outgrew it / were re-tested (user report, not verified)` : "no allergy" });
    }
  } else if ((ALLERGY_CUE.test(text) || reactions.length > 0 || CLINICIAN_AVOID.test(text)) && !generalQuestion(raw, text) && !allergyIsSomeoneElses(text)) {
    for (const [item, re] of ALLERGENS) {
      const reacted = reactionTo(item, re, false);
      // "Fish doesn't make me itch any more" retracts that food's reaction; it asserts nothing.
      if (!reacted && reactionTo(item, re, true)) {
        if (active.has(`ALLERGY:${item}`)) out.push({ key: `ALLERGY:${item}`, kind: "ALLERGY", relevance: "SAFETY", op: "NEGATE", label: `no reaction to ${item} (user correction)` });
        continue;
      }
      // A reaction-only turn names the food inside the reaction clause, not merely somewhere in the message.
      if (!(ALLERGY_CUE.test(text) || CLINICIAN_AVOID.test(text) ? namesAllergen(item, re, text) : reacted)) continue;
      const clinician = CLINICIAN_AVOID.test(text) ? "; clinician advised avoiding it" : "";
      const label = /intoleran/.test(text) && item === "dairy or lactose" ? "lactose / dairy intolerance"
        : ALLERGY_CUE.test(text) ? `allergic to ${item}`
          : reacted ? `possible reaction to ${item} (user-reported${clinician}${/\b(?:used to|as a (?:kid|child)|years ago|hoi nho|truoc day)\b/.test(text) ? "; said as past, current status unclear" : ""} — not a confirmed allergy)`
            : `must avoid ${item} (clinician-advised)`;
      out.push({ key: `ALLERGY:${item}`, kind: "ALLERGY", relevance: "SAFETY", op: "ASSERT", label });
      // "Shellfish" alone is not fish; "seafood like salmon and cod" names both groups.
      if (item === "shellfish" && !ALLERGENS.find(([name]) => name === "fish")![1].test(text.replace(/shellfish/g, "")) && !/\b(?:seafood|hai san)\b/.test(text)) break;
    }
  }

  // Medications (personal use only — "what is sertraline?" is not a disclosure)
  for (const [id, label, re] of MEDICATIONS) {
    const clause = text.split(/[.?!;]/).find((part) => re.test(part));
    if (!clause) continue;
    if (id === "insulin" && /\b(?:bulk\w*|gains?|bodybuild\w*|cycle|pin\w*|peds?|steroids?)\b/.test(text)) continue; // a PED turn
    if (id === "generic" && out.some((candidate) => candidate.kind === "MEDICATION")) continue;
    if (!MED_PERSONAL.test(clause) && !/^\s*(?:on )?\w+\s*$/.test(clause)) continue;
    const key = `MEDICATION:${id}`;
    if (MED_END.test(clause) && /\b(?:stopped|quit|came off|no longer|ngung)\b/.test(clause)) out.push({ key, kind: "MEDICATION", relevance: "SAFETY", op: "END", label: `took ${label} before — stopped` });
    else if (NEGATION.test(clause.split(re)[0]?.slice(-20) ?? "")) out.push({ key, kind: "MEDICATION", relevance: "SAFETY", op: "NEGATE", label: `does not take ${label}` });
    else out.push({ key, kind: "MEDICATION", relevance: "SAFETY", op: "ASSERT", label: `takes ${label}` });
  }

  // Medical conditions
  let diabetesTyped = false;
  for (const [id, label, re] of CONDITIONS) {
    const clause = text.split(/[.?!;]/).find((part) => re.test(part));
    if (!clause) continue;
    if (id === "diabetes" && diabetesTyped) continue;
    if (id === "type1_diabetes" || id === "type2_diabetes") diabetesTyped = true;
    if (!CONDITION_PERSONAL.test(clause) && clause.trim().split(/\s+/).length > 4) continue;
    if (/\b(?:what is|what'?s|what are|la gi|explain)\b/.test(clause) && !CONDITION_PERSONAL.test(clause.replace(/\bwhat'?s\b/, ""))) continue;
    const key = `CONDITION:${id}`;
    const before = clause.split(re)[0] ?? "";
    if (/\b(?:don'?t|do not|never|no longer|khong)\b[^.?!]{0,15}$/.test(before)) out.push({ key, kind: "CONDITION", relevance: "SAFETY", op: "NEGATE", label: `does not have ${label}` });
    else if (CONDITION_PAST.test(clause)) out.push({ key, kind: "CONDITION", relevance: "SAFETY", op: "ASSERT", temporal: "HISTORICAL", label: `${label} — in the past` });
    else out.push({ key, kind: "CONDITION", relevance: "SAFETY", op: "ASSERT", label: `has ${label}` });
  }

  // Energy intake: a stated kcal/day. Below 1200 is dangerously low for a training adult.
  // Past tense counts: "yesterday I ate around 650 calories" is the same disclosure as "I eat 650 a day".
  const EAT = String.raw`(?:eat(?:ing|en)?|ate|had|having|consumed|managed|got in|(?:minh|toi|em|tao) (?:chi )?an(?: duoc)?)`;
  const QUALIFIERS = String.raw`(?:(?:only|just|about|around|like|maybe|roughly|barely|approximately|approx|khoang|tam|chung|co|chi) |~){0,3}`;
  const kcal = text.match(new RegExp(String.raw`(\d{3,4})\s*(?:k?cals?|kcal|calories|calo|cal)\b[^.?!]{0,30}\b(?:a day|per day|daily|\/ ?day|each day|moi ngay|mot ngay)\b|\b(?:${EAT}|on|at)\s+${QUALIFIERS}(\d{3,4})\s*(?:k?cals?|kcal|calories|calo)\b`))
    // H1-LM: the unit is often dropped after an eating verb when the day is named: "I've only had about 650 today".
    ?? text.match(new RegExp(String.raw`\b${EAT}\s+${QUALIFIERS}(\d{3,4})\s+(?:so far )?(?:today|yesterday|hom nay|hom qua)\b`));
  const kcalValue = kcal ? Number(kcal[1] ?? kcal[2]) : null;
  if (kcalValue !== null && kcalValue >= 200 && kcalValue < 6000 && !/\b(?:burn\w*|target|goal|should i|deficit of|surplus of)\b/.test(text)) {
    const low = kcalValue < 1200;
    // One day said as one day (today / yesterday) is not called a habit; a daily figure is.
    const day = /\b(?:a day|per day|daily|each day|every day|moi ngay|mot ngay|for (?:a|the past|\d+) (?:week|days|weeks))\b/.test(text) ? null
      : /\b(?:yesterday|hom qua)\b/.test(text) ? "yesterday" : /\b(?:today|hom nay|so far)\b/.test(text) ? "today" : null;
    out.push({ key: "ENERGY_INTAKE", kind: "LOW_ENERGY_INTAKE", relevance: low ? "SAFETY" : "DOMAIN", op: "ASSERT", value: kcalValue, unit: "kcal/day",
      label: !low ? `reports eating about ${kcalValue} kcal/day`
        : day ? `ate only about ${kcalValue} kcal ${day} (a single-day report) — dangerously low energy intake for training on`
          : `eats only about ${kcalValue} kcal/day — dangerously low energy intake` });
  } else if (active.has("ENERGY_INTAKE") && /\b(?:eating (?:normally|properly|enough|more) (?:again|now)|back to (?:eating )?(?:normal(?:ly)?|maintenance|my usual)|an (?:uong )?binh thuong lai)\b/.test(text)) {
    out.push({ key: "ENERGY_INTAKE", kind: "LOW_ENERGY_INTAKE", relevance: "SAFETY", op: "NEGATE", label: "says they are eating normally again" });
  } else if (/\b(?:barely|hardly)(?: been)? eat(?:ing)? (?:anything|at all|any food|food)\b|\b(?:ate|eaten|had) (?:barely|hardly) (?:anything|any food)\b|\b(?:barely|hardly) ate\b|\b(?:i'?m|im|i am|been) (?:barely|hardly|not) eating\s*(?:[.!?,]|$|anything|at all)|\bstopped eating\b|\bstarving myself\b|\bskip(?:ping)? (?:all )?meals all day\b|\bnhin an\b|\bbo bua ca ngay\b/.test(text) && FIRST_PERSON.test(text)) {
    out.push({ key: "ENERGY_INTAKE", kind: "LOW_ENERGY_INTAKE", relevance: "SAFETY", op: "ASSERT", label: "reports barely eating — dangerously low energy intake" });
  }

  // Red-flag symptoms the user reports about themselves (the hard safety layer owns the reply; this keeps them in view).
  for (const [id, label, re] of SYMPTOMS) {
    const clause = text.split(/[.?!;]|\bbut\b/).find((part) => re.test(part));
    if (!clause) {
      // "I meant my chest muscles are sore, no chest pain" — a correction that removes a symptom.
      continue;
    }
    const key = `SYMPTOM:${id}`;
    const before = (clause.split(re)[0] ?? "").slice(-24);
    if (/\b(?:no|not|without|never|don'?t have|khong)\b/.test(before) || (correction && /\b(?:i meant|i mean|actually|y minh la)\b/.test(text) && /\b(?:sore|doms|muscles?|moi)\b/.test(text))) {
      out.push({ key, kind: "SYMPTOM", relevance: "SAFETY", op: "NEGATE", label: `no ${label}` });
    } else if (FIRST_PERSON.test(clause) || clause.trim().split(/\s+/).length <= 6) {
      out.push({ key, kind: "SYMPTOM", relevance: "SAFETY", op: "ASSERT", label: `reported ${label}` });
    }
  }
  // The correction "I meant my chest MUSCLES are sore" names no symptom phrase at all: it still clears an active chest-pain report.
  if (correction && active.has("SYMPTOM:chest_pain") && /\bchest\b/.test(text) && /\b(?:sore|doms|muscles?|no (?:chest )?pain)\b/.test(text) && !out.some((c) => c.key === "SYMPTOM:chest_pain")) {
    out.push({ key: "SYMPTOM:chest_pain", kind: "SYMPTOM", relevance: "SAFETY", op: "NEGATE", label: "no chest pain (muscle soreness after training)" });
  }

  // Bodyweight
  const weight = text.match(/\b(?:i weigh|weigh(?:ing|ed)?(?: in at)?|my weight is|my weight'?s|weight(?: is)?:?|bodyweight(?: is)?|bw(?: is)?|i'?m|im|i am|nang|can nang(?: la)?)\s*(?:about|around|~|only|now|currently)?\s*(\d{2,3}(?:\.\d)?)\s*(kg|kgs|kilos?|lbs?|pounds|can)\b/)
    // An instruction is a statement too: "use 60 kg as my current weight", "set my weight to 60 kg" (H1 W10).
    ?? text.match(/\b(?:use|set (?:my )?(?:body ?)?weight to|update (?:my )?(?:body ?)?weight to|change (?:my )?(?:body ?)?weight to)\s+(\d{2,3}(?:\.\d)?)\s*(kg|kgs|kilos?|lbs?|pounds)\b(?=[^.?!]*\b(?:current|weight|bodyweight|from now on|instead)\b|\s*(?:[.?!]|$))/)
    ?? (correction || active.has("BODYWEIGHT") ? text.match(/(?:^|\b(?:actually|it'?s|no|not|i meant|i mean|sorry|typo|correction|thuc ra|nham)\b[^.?!\d]{0,12})(\d{2,3}(?:\.\d)?)\s*(kg|kgs|kilos?|lbs?|pounds)\b/) : null);
  // "set my weight to 60 kg" is not a set of an exercise.
  if (weight && !LIFT_CONTEXT.test(text.replace(/\bset (?=(?:my )?(?:body ?)?weight to\b)/, ""))) {
    const value = Number(weight[1]);
    const unit = /lb|pound/.test(weight[2]) ? "lb" : "kg";
    out.push({ key: "BODYWEIGHT", kind: "BODYWEIGHT", relevance: "DOMAIN", op: "ASSERT", value, unit, label: `bodyweight ${value} ${unit}` });
  }

  // Protein intake (habitual)
  const protein = text.match(/(\d{2,3})\s*g(?:rams?)?\s*(?:of\s+)?protein\b|\bprotein\b[^.?!\d]{0,20}(\d{2,3})\s*g(?:rams?)?\b/)
    ?? (correction && active.has("PROTEIN_INTAKE") ? text.match(/\b(\d{2,3})\s*g(?:rams?)?\b/) : null);
  if (protein && !/\b(?:should|how much|target|need)\b/.test(text)) {
    const value = Number(protein[1] ?? protein[2]);
    out.push({ key: "PROTEIN_INTAKE", kind: "PROTEIN_INTAKE", relevance: "DOMAIN", op: "ASSERT", value, unit: "g/day", label: `usually eats about ${value} g protein per day` });
  }

  // How the user says they are TODAY (H0 cluster E): a current self-report outranks a stale score; disagreeing with a
  // fresh score is a correction the coach must acknowledge (the score itself is explained, never adjusted).
  if (/\b(?:score|that number|the number|readiness)\b[^.?!]{0,25}\b(?:wrong|off|not right|inaccurate|incorrect|doesn'?t match|is bs)\b|\bdiem (?:sai|khong dung)\b/.test(text)) {
    out.push({ key: "SELF_REPORT", kind: "SELF_REPORT", relevance: "DOMAIN", op: "ASSERT", label: "says today's recovery score does not match how they feel" });
  } else if (/\b(?:i )?(?:feel|feeling|felt)\s+(?:fully |really |pretty |totally |completely |super )?(?:recovered|great|fine|good|fresh|amazing|100%|strong|rested|ready)\b|\bslept (?:great|well|really well|amazing)\b|\bwell[- ]rested\b|\b(?:thay|cam thay) (?:khoe|hoi phuc|on)\b/.test(text) && !NEGATION.test(text.match(/[^.?!]*\b(?:feel|feeling|felt|slept|rested|thay)\b/)?.[0]?.split(/\b(?:feel|feeling|felt|slept|rested|thay)\b/)[0] ?? "")) {
    out.push({ key: "SELF_REPORT", kind: "SELF_REPORT", relevance: "DOMAIN", op: "ASSERT", label: "says they feel recovered / well today" });
  } else if (/\b(?:feel|feeling|felt)\s+(?:really |so |pretty |very )?(?:terrible|awful|exhausted|wrecked|drained|like crap|like shit|sick|unwell|run down|horrible|bad)\b|\bslept (?:badly|terribly|poorly|like crap)\b|\b(?:met|kiet suc|qua met|thay te)\b/.test(text)) {
    out.push({ key: "SELF_REPORT", kind: "SELF_REPORT", relevance: "DOMAIN", op: "ASSERT", label: "says they feel unwell / exhausted today" });
  }

  for (const [diet, re] of DIETS) {
    if (!re.test(text)) continue;
    const clause = text.split(/[.?!;]/).find((part) => re.test(part)) ?? "";
    if (/\b(?:not|no longer|stopped being|quit being)\b/.test(clause)) out.push({ key: "DIET_PATTERN", kind: "DIET_PATTERN", relevance: "DOMAIN", op: "NEGATE", label: `no longer ${diet}` });
    else if (FIRST_PERSON.test(clause) || clause.trim().split(/\s+/).length <= 4) out.push({ key: "DIET_PATTERN", kind: "DIET_PATTERN", relevance: "DOMAIN", op: "ASSERT", label: `eats ${diet}` });
    break;
  }
  for (const [goal, re] of GOALS) {
    if (re.test(text) && FIRST_PERSON.test(text) && !/\b(?:should i|how (?:do|to)|can i)\b[^.?!]{0,20}$/.test(text.split(re)[0] ?? "")) {
      out.push({ key: "GOAL", kind: "GOAL", relevance: "DOMAIN", op: "ASSERT", label: `current goal: ${goal}` });
      break;
    }
  }
  return out;
}

/* ---------- resolution ---------- */

const FOLLOW_UP = /^(?:and|but|so|ok(?:ay)?|what about|how about|how much|how many|how often|when|which|why|is it|is that|are they|should i|can i|do i|then|also|con|the con|bao nhieu|vay|the|sao)\b|\b(?:it|that|this|those|them|these|then|instead|cai do|cai nay)\??$/;

/**
 * Prior USER messages (oldest → newest) plus the current one → the bounded working set. Pure and deterministic.
 * The caller decides how much raw history to pass; the working set is what may reach a prompt.
 */
export function buildContextWorkingSet(input: { priorUserMessages?: readonly string[]; message: string }): ContextWorkingSet {
  const turns = [...(input.priorUserMessages ?? []), input.message].map((text) => text.trim()).filter(Boolean);
  const active = new Map<string, ContextFact>();
  const facts: ContextFact[] = [];
  turns.forEach((turn, index) => {
    const turnsAgo = turns.length - 1 - index;
    const correction = CORRECTION_CUE.test(fold(turn));
    const previous = index > 0 ? fold(turns[index - 1]) : "";
    const lastPedMention = new RegExp(`\\b${PED_TERM}\\b`).test(previous.replace(NON_PED_CYCLE, " "));
    for (const candidate of extractTurn(turn, active, lastPedMention)) {
      const previous = active.get(candidate.key);
      const { op, temporal, ...rest } = candidate;
      const supersede = (by: string) => {
        if (!previous) return;
        previous.status = "SUPERSEDED";
        previous.supersededBy = by;
        active.delete(candidate.key);
      };
      // A negation ends the fact. So does an ended episode of anything but PED use / pregnancy, whose history still matters.
      if (op === "NEGATE" || (op === "END" && candidate.kind !== "PED_USE" && candidate.kind !== "PREGNANCY")) {
        supersede(candidate.label);
        continue;
      }
      // Same key, same value, still current: one fact, refreshed — never a duplicate.
      if (previous && previous.temporal === (temporal ?? (op === "END" ? "HISTORICAL" : "CURRENT")) && previous.label === rest.label && previous.value === rest.value) {
        previous.turnsAgo = turnsAgo;
        continue;
      }
      const changedValue = previous !== undefined && (previous.value !== rest.value || previous.label !== rest.label);
      const fact: ContextFact = {
        ...rest,
        temporal: temporal ?? (op === "END" ? "HISTORICAL" : "CURRENT"),
        origin: changedValue && (correction || op !== "ASSERT" || previous!.value !== undefined) ? "USER_CORRECTION" : "USER_STATEMENT",
        status: "ACTIVE",
        turnsAgo,
        quote: clip(turn),
      };
      supersede(fact.label);
      active.set(candidate.key, fact);
      facts.push(fact);
    }
  });
  const current = fold(input.message).trim();
  const prior = input.priorUserMessages?.at(-1)?.trim() ?? null;
  const followUpOf = prior && current.split(/\s+/).length <= 8 && FOLLOW_UP.test(current) ? clip(prior, 220) : null;
  return { facts, followUpOf };
}

export const activeFacts = (set: ContextWorkingSet | null | undefined): ContextFact[] => (set?.facts ?? []).filter((fact) => fact.status === "ACTIVE");

/**
 * Allergy / low-intake keys the user retracts or ends in THIS message, judged as if every such fact were on record — so a
 * retraction reaches a disclosure made to the other coach, which this conversation never saw. Withdrawing a safety fact is
 * the unsafe direction: someone else's allergy and a bare question never retract anything.
 */
export function retractedSafetyKeys(message: string): string[] {
  const text = fold(message);
  if (allergyIsSomeoneElses(text) || /\?\s*$/.test(message.trim())) return [];
  const assumed = new Map<string, ContextFact>([...ALLERGENS.map(([item]) => `ALLERGY:${item}`), "ENERGY_INTAKE"].map((key) => [key, {} as ContextFact]));
  return [...new Set(extractTurn(message, assumed).filter((c) => c.op === "NEGATE" || c.op === "END").map((c) => c.key))];
}

export function hasActive(set: ContextWorkingSet | null | undefined, kind: ContextFactKind, temporal: ContextTemporal = "CURRENT"): boolean {
  return activeFacts(set).some((fact) => fact.kind === kind && fact.temporal === temporal);
}

/** A diagnosed structural injury or one under a clinician's movement restriction: its loading waits for clearance. */
export const clinicallyBounded = (fact: ContextFact): boolean => fact.kind === "INJURY" && /diagnosed|clinician restriction/.test(fact.label);

export function activeKeys(set: ContextWorkingSet | null | undefined, prefix: string): string[] {
  return activeFacts(set).filter((fact) => fact.key.startsWith(prefix) && fact.temporal === "CURRENT").map((fact) => fact.key.slice(prefix.length));
}

const when = (turnsAgo: number) => (turnsAgo === 0 ? "this message" : turnsAgo === 1 ? "previous message" : `${turnsAgo} messages ago`);

/**
 * The prompt rendering. Bounded: at most 10 active facts and 4 superseded ones, each with a clipped quote. Facts said
 * in THIS message are listed too, so a correction in this message is visibly the authority.
 */
export function renderContextWorkingSet(set: ContextWorkingSet | null | undefined): string[] {
  if (!set) return [];
  const active = activeFacts(set);
  const superseded = set.facts.filter((fact) => fact.status === "SUPERSEDED").slice(-4);
  if (active.length === 0 && superseded.length === 0 && !set.followUpOf) return [];
  // A fact from THIS message is never quoted: a per-request prompt must not receive a sibling request's words.
  const line = (fact: ContextFact) => `- ${fact.label}${fact.origin === "USER_CORRECTION" ? " (user CORRECTION — this replaces what they said before)" : ""} — user, ${fact.via ? `${fact.via} (another chat; applies here too)` : `${when(fact.turnsAgo)}${fact.turnsAgo === 0 ? "" : `: "${fact.quote}"`}`}`;
  const safety = active.filter((fact) => fact.relevance === "SAFETY").slice(0, 8);
  const domain = active.filter((fact) => fact.relevance === "DOMAIN").slice(0, 4);
  return [
    "CONVERSATION CONTEXT — what THIS user told you earlier in this chat (their own words, not verified records). It applies to the current answer even when the current message does not repeat it: do not ask for it again, do not contradict it, and do not quote this block. A user correction outranks what it corrects and outranks stored profile values for the same fact.",
    ...(safety.length ? ["ACTIVE — SAFETY-RELEVANT (shape the whole answer around these):", ...safety.map(line)] : []),
    ...(domain.length ? ["ACTIVE — CONTEXT:", ...domain.map(line)] : []),
    ...(superseded.length ? ["NO LONGER CURRENT (do not treat as true now):", ...superseded.map((fact) => `- ${fact.label} → replaced by: ${fact.supersededBy ?? "a later statement"}`)] : []),
    ...(set.followUpOf ? [`PREVIOUS USER MESSAGE (the current message may be a short follow-up to it): "${set.followUpOf}"`] : []),
  ];
}
