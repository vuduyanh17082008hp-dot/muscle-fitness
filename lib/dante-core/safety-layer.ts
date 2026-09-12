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
 */

export type SafetyCategory =
  | "chest_pain_cardiac"
  | "fainting_dizziness"
  | "neurological_symptoms"
  | "possible_injury"
  | "severe_pain"
  | "eating_disorder_indicator"
  | "dangerous_substance";

export type SafetyCheckResult = {
  triggered: boolean;
  category: SafetyCategory | null;
  matchedPhrase: string | null;
  /** Fixed escalation copy to show INSTEAD of a normal Dante reply. Null when not triggered. */
  responseOverride: string | null;
};

type SafetyRule = {
  category: SafetyCategory;
  patterns: RegExp[];
  response: string;
};

const TRAINING_VS_MEDICAL_FOOTER =
  "Dante can help with training and nutrition questions, but this isn't something to guess about here — please talk to a doctor or other qualified professional.";

const RULES: SafetyRule[] = [
  {
    category: "chest_pain_cardiac",
    patterns: [
      /\bchest pain\b/i,
      /\bpain in my chest\b/i,
      /\btightness in (my |the )?chest\b/i,
      /\bcan'?t breathe\b/i,
      /\bshort(ness)? of breath\b/i,
      /\bheart (is )?racing\b/i,
      /\birregular heartbeat\b/i,
    ],
    response: `That combination of symptoms can be a medical emergency. If this is happening right now, stop exercising and seek emergency medical care immediately (call your local emergency number). ${TRAINING_VS_MEDICAL_FOOTER}`,
  },
  {
    category: "fainting_dizziness",
    patterns: [
      /\bfaint(ed|ing)?\b/i,
      /\bpassed out\b/i,
      /\bblack(ed)? out\b/i,
      /\bsevere(ly)? dizzy\b/i,
      /\broom (is|was) spinning\b/i,
    ],
    response: `Fainting or blacking out during or after training is not something to self-diagnose. Stop training and get checked by a medical professional, especially if it happens more than once. ${TRAINING_VS_MEDICAL_FOOTER}`,
  },
  {
    category: "neurological_symptoms",
    patterns: [
      /\bnumbness\b/i,
      /\btingling down (my )?(arm|leg)\b/i,
      /\bcan'?t feel my (arm|leg|hand|foot)\b/i,
      /\bloss of (feeling|sensation)\b/i,
      /\bsudden weakness\b/i,
      /\bslurred speech\b/i,
    ],
    response: `Numbness, tingling, or sudden weakness — especially spreading down a limb — needs medical evaluation, not training advice. Please see a doctor promptly (or emergency care if it came on suddenly). ${TRAINING_VS_MEDICAL_FOOTER}`,
  },
  {
    category: "severe_pain",
    patterns: [
      /\bsevere pain\b/i,
      /\bexcruciating\b/i,
      /\bheard? a pop\b/i,
      /\bfelt (a |it )?pop\b/i,
      /\bcan'?t (put weight on|walk on|move) (my |the )?(leg|arm|knee|shoulder|back)\b/i,
      /\bsomething (snapped|tore)\b/i,
    ],
    response: `That sounds like it could be an acute injury rather than normal training soreness. Please stop training on it and have it evaluated by a doctor or physiotherapist before continuing. ${TRAINING_VS_MEDICAL_FOOTER}`,
  },
  {
    category: "possible_injury",
    patterns: [
      /\b(sharp|stabbing) pain\b/i,
      /\bjoint (is |feels )?unstable\b/i,
      /\bswelling (that|which)? (won'?t|does'?nt) go down\b/i,
    ],
    response: `That description goes beyond normal training soreness and is worth having looked at by a doctor or physiotherapist rather than worked through with training adjustments alone. ${TRAINING_VS_MEDICAL_FOOTER}`,
  },
  {
    category: "eating_disorder_indicator",
    patterns: [
      /\bpurg(e|ing) after (eating|meals)\b/i,
      /\bmaking myself throw up\b/i,
      /\bhaven'?t eaten in \d+ days?\b/i,
      /\bstarv(e|ing) myself\b/i,
      /\bafraid to eat\b/i,
      /\bbinge and purge\b/i,
    ],
    response: `What you're describing sounds like it could be more than a nutrition-planning question, and it deserves support from a professional who specializes in this — not a calorie/macro adjustment. If you're in the US, the National Eating Disorders Association helpline (1-800-931-2237) is a place to start; wherever you are, please consider reaching out to a doctor or counselor. Dante will keep helping with training and general nutrition whenever you're ready.`,
  },
  {
    category: "dangerous_substance",
    patterns: [
      /\b(clenbuterol|dnp|dinitrophenol)\b.*\b(dose|dosage|how much|cycle)\b/i,
      /\b(how much|what dose|dosage) (of |for )?(clenbuterol|dnp|anabolic steroids?|sarms?)\b/i,
      /\bstack (steroids|sarms|clen)\b/i,
    ],
    response: `Dante doesn't provide dosing guidance for substances like this — several of the ones you're describing carry serious, sometimes life-threatening risks even at "typical" doses discussed online. Please talk to a doctor before using anything like this, and consider that most physique/performance goals are very achievable with training and nutrition alone. ${TRAINING_VS_MEDICAL_FOOTER}`,
  },
];

export function checkSafety(message: string): SafetyCheckResult {
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = message.match(pattern);

      if (match) {
        return {
          triggered: true,
          category: rule.category,
          matchedPhrase: match[0],
          responseOverride: rule.response,
        };
      }
    }
  }

  return {
    triggered: false,
    category: null,
    matchedPhrase: null,
    responseOverride: null,
  };
}
