import type { KnowledgeRecord } from "../types";
import { claim } from "./claim";

const EXERCISING = "healthy exercising adults";

/**
 * Representative nutrition knowledge (ICH-1). Numbers here are population guidance from the cited sources. A person's
 * own calorie and macro targets come ONLY from the canonical nutrition authority (lib/nutrition/targets.ts) — a range in
 * this file never replaces or recomputes them.
 */
export const NUTRITION_RECORDS: KnowledgeRecord[] = [
  {
    id: "nutrition-energy-balance",
    topic: "energy balance",
    domain: "NUTRITION",
    retrievalTags: ["energy balance", "calorie deficit", "caloric deficit", "calorie surplus", "surplus", "deficit", "bulk", "bulking", "cut", "cutting", "maintenance", "lose fat", "fat loss", "make me fat", "get fat", "giam mo", "tang can"],
    aliases: ["energy balance"],
    contraindicationTags: ["EXTREME_DIET", "EATING_DISORDER_RISK"],
    sources: ["aragon-2017-issn-diets"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "fat loss", population: EXERCISING, context: "diets aimed at fat loss", claim: "Fat loss is driven by a sustained caloric deficit; slower rates of loss better preserve lean mass in leaner people.", sources: ["aragon-2017-issn-diets"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "lean mass gain", population: "people doing resistance training", context: "diets aimed at gaining lean mass", claim: "Gaining lean mass is driven by a sustained caloric surplus that supports rising training demands; the size of the surplus and training status shape what is gained.", sources: ["aragon-2017-issn-diets"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "body composition", population: EXERCISING, context: "choice of diet type", claim: "A wide range of approaches, from low-fat to low-carbohydrate, can be similarly effective for body composition, and long-term success depends on compliance.", sources: ["aragon-2017-issn-diets"], limitations: ["little research in women and older people"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-protein-adequacy",
    topic: "protein adequacy",
    domain: "NUTRITION",
    retrievalTags: ["how much protein", "protein intake", "protein need", "protein do i need", "enough protein", "protein target", "grams of protein", "bao nhieu protein", "du protein", "chat dam"],
    aliases: ["protein intake", "protein requirement", "protein needs"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["jager-2017-issn-protein", "morton-2018-protein-meta"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "building and maintaining muscle mass", population: EXERCISING, context: "total daily protein", claim: "A daily protein intake of 1.4-2.0 g per kg body weight is sufficient for most exercising individuals.", sources: ["jager-2017-issn-protein"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "resistance-training gains in fat-free mass", population: "healthy adults in resistance-training trials", context: "protein supplementation on top of the diet", claim: "Adding protein beyond a total intake of about 1.6 g per kg per day produced no further gains in fat-free mass.", sources: ["morton-2018-protein-meta"], limitations: ["49 trials; benefit shrinks with age and grows with training experience"], lens: "DIETARY" }),
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "retaining lean mass", population: "resistance-trained people", context: "hypocaloric periods (a cut)", claim: "Higher intakes (2.3-3.1 g per kg per day) may be needed to maximise lean-mass retention during a caloric deficit.", sources: ["jager-2017-issn-protein"], conditions: ["resistance-trained", "in a caloric deficit"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-protein-quality",
    topic: "protein quality",
    domain: "NUTRITION",
    retrievalTags: ["protein quality", "complete protein", "plant protein", "protein source", "leucine", "essential amino acids", "chat luong protein"],
    aliases: ["protein quality", "chat luong protein"],
    contraindicationTags: [],
    sources: ["jager-2017-issn-protein"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "meeting protein requirements", population: "physically active individuals", context: "food versus supplements", claim: "Daily protein requirements can be met through whole foods; athletes should focus on whole-food protein sources that contain all the essential amino acids.", sources: ["jager-2017-issn-protein"], lens: "DIETARY" }),
      claim({ type: "MECHANISM", strength: "MODERATE", outcome: "acute muscle protein synthesis", population: EXERCISING, context: "type of protein", claim: "Rapidly digested proteins high in essential amino acids with adequate leucine are the most effective at stimulating muscle protein synthesis.", sources: ["jager-2017-issn-protein"], limitations: ["an acute synthesis response, not a long-term muscle-gain outcome"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-carb-role",
    topic: "carbohydrate role",
    domain: "NUTRITION",
    retrievalTags: ["carbs", "carb", "carbohydrate", "carbohydrates", "glycogen", "low carb", "keto", "carbs at night", "tinh bot"],
    aliases: ["carbs", "carb", "carbohydrate", "carbohydrates", "tinh bot"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["kerksick-2017-issn-timing", "jager-2017-issn-protein", "aragon-2017-issn-diets"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "muscle glycogen", population: "healthy exercising adults, especially highly trained", context: "high-volume training", claim: "Glycogen stores are maximised by a high-carbohydrate diet and are depleted most by high-volume exercise.", sources: ["kerksick-2017-issn-timing"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "endurance performance", population: "endurance athletes", context: "fuelling", claim: "Endurance athletes should focus on adequate carbohydrate intake to support performance.", sources: ["jager-2017-issn-protein"], lens: "DIETARY" }),
      claim({ type: "REASONABLE_INFERENCE", strength: "LIMITED", stance: "DOES_NOT_SUPPORT", outcome: "fat gain from the time of day carbohydrate is eaten", population: EXERCISING, context: "eating carbohydrate in the evening", claim: "Fat loss and gain are driven by sustained energy balance, and low-carbohydrate and low-fat diets perform similarly; nothing in these sources makes the time of day carbohydrate is eaten a driver of fat gain.", sources: ["aragon-2017-issn-diets"], uncertainty: "an inference from energy-balance evidence; no source here tested evening carbohydrate directly", lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-dietary-fat",
    topic: "dietary fat",
    domain: "NUTRITION",
    retrievalTags: ["dietary fat", "fats", "fat intake", "low fat", "cut fats", "cut fat really low", "healthy fats", "chat beo"],
    aliases: ["dietary fat", "dietary fats", "chat beo"],
    contraindicationTags: [],
    sources: ["whittaker-2021-low-fat-testosterone", "aragon-2017-issn-diets"],
    version: 1,
    claims: [
      claim({ type: "UNCERTAIN", strength: "LIMITED", outcome: "testosterone in men", population: "men in diet-intervention studies", context: "low-fat versus higher-fat diets", claim: "Low-fat diets appear to decrease testosterone levels in men by a small amount.", sources: ["whittaker-2021-low-fat-testosterone"], limitations: ["6 studies, 206 participants", "the authors call for further randomised trials to confirm it"], uncertainty: "a hormone level change, not a demonstrated change in muscle or performance", lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "body composition", population: EXERCISING, context: "low-fat versus low-carbohydrate approaches", claim: "Low-fat and low-carbohydrate approaches can be similarly effective for body composition.", sources: ["aragon-2017-issn-diets"], lens: "DIETARY" }),
      claim({ type: "UNKNOWN", strength: "INSUFFICIENT", stance: "MIXED", outcome: "a minimum fat intake", population: "any individual", context: "how low fat can go", claim: "No verified source in this registry sets a minimum dietary fat intake.", sources: [], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-meal-distribution",
    topic: "meal distribution",
    domain: "NUTRITION",
    retrievalTags: ["meal frequency", "meals a day", "meals per day", "protein per meal", "per meal", "how many meals", "meal timing", "intermittent fasting", "so bua"],
    aliases: ["meal frequency", "meal distribution", "meal timing"],
    contraindicationTags: ["EATING_DISORDER_RISK"],
    sources: ["jager-2017-issn-protein", "schoenfeld-2018-protein-per-meal", "kerksick-2017-issn-timing", "aragon-2017-issn-diets"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "muscle protein synthesis across the day", population: EXERCISING, context: "spreading protein", claim: "Protein doses of roughly 0.25 g per kg (20-40 g) of a high-quality source, spread evenly every 3-4 hours, are the general recommendation.", sources: ["jager-2017-issn-protein"], limitations: ["per-serving recommendations are described as mixed"], lens: "DIETARY" }),
      claim({ type: "REASONABLE_INFERENCE", strength: "LIMITED", outcome: "use of protein for tissue building", population: "people in regimented resistance training", context: "large protein meals", claim: "Protein above about 20 g in a meal is oxidised more but is not all wasted; a target of about 0.4 g per kg per meal over at least four meals reaches 1.6 g per kg per day.", sources: ["schoenfeld-2018-protein-per-meal"], limitations: ["narrative review"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "priority", population: EXERCISING, context: "timing versus total", claim: "Meeting total daily protein intake is the primary area of emphasis; even spacing is a preference on top of it.", sources: ["kerksick-2017-issn-timing"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "body composition", population: EXERCISING, context: "intermittent versus daily caloric restriction", claim: "Intermittent caloric restriction shows no significant advantage over daily restriction for body composition.", sources: ["aragon-2017-issn-diets"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-peri-workout",
    topic: "pre and post-workout nutrition",
    domain: "NUTRITION",
    retrievalTags: ["post workout", "post-workout", "after training", "after workout", "after the gym", "anabolic window", "pre workout meal", "pre-workout meal", "before training", "before workout", "immediately after", "intra workout", "sau tap", "truoc tap"],
    aliases: ["peri-workout nutrition", "post-workout nutrition", "pre-workout nutrition"],
    contraindicationTags: [],
    sources: ["aragon-2013-anabolic-window", "jager-2017-issn-protein", "kerksick-2017-issn-timing"],
    version: 1,
    claims: [
      claim({ type: "UNCERTAIN", strength: "LIMITED", stance: "MIXED", outcome: "muscular adaptation", population: "people doing resistance training", context: "a narrow post-exercise 'anabolic window'", claim: "The importance, and even the existence, of a post-exercise anabolic window varies with several factors; evidence has directly challenged the classical view that immediate post-exercise intake is critical.", sources: ["aragon-2013-anabolic-window"], limitations: ["narrative review"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "muscle protein synthesis", population: EXERCISING, context: "protein before or after resistance exercise", claim: "Benefits come from protein either before or after training; the anabolic effect of exercise is long-lasting (at least 24 hours) but likely diminishes with time after exercise.", sources: ["jager-2017-issn-protein"], lens: "DIETARY" }),
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "need for post-exercise protein", population: EXERCISING, context: "what was eaten before training", claim: "The size and timing of the pre-exercise meal affects how much post-exercise protein feeding is required.", sources: ["kerksick-2017-issn-timing"], conditions: ["depends on the pre-exercise meal"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-hydration",
    topic: "hydration",
    domain: "NUTRITION",
    retrievalTags: ["hydration", "hydrate", "dehydrated", "dehydration", "water intake", "how much water", "drink water", "uong nuoc"],
    aliases: ["hydration"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["sawka-2007-acsm-fluid", "mcdermott-2017-nata-fluid"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "exercise performance", population: "people doing physical activity", context: "drinking during exercise", claim: "The goal of drinking during exercise is to prevent excessive dehydration (more than 2% body-weight loss from water deficit) and excessive electrolyte change.", sources: ["sawka-2007-acsm-fluid"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "fluid plan", population: "people doing physical activity", context: "individual differences", claim: "Sweat rate and sweat electrolyte content vary considerably between people, so fluid replacement should be customised; sweat rate can be estimated from body weight before and after exercise.", sources: ["sawka-2007-acsm-fluid"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "health and performance", population: "physically active people", context: "drinking too little or too much", claim: "Both too little fluid and excessive intake can compromise performance and increase health risk, including overdrinking and hyponatremia.", sources: ["mcdermott-2017-nata-fluid"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-electrolytes",
    topic: "electrolytes",
    identity: { en: "Electrolytes are minerals such as sodium, potassium and magnesium that carry an electrical charge in the body's fluids.", vi: "Chất điện giải (electrolytes) là các khoáng chất như natri, kali và magie mang điện tích trong dịch cơ thể." },
    domain: "NUTRITION",
    retrievalTags: ["electrolyte", "electrolytes", "sodium", "salt", "potassium", "cramp", "cramps", "dien giai"],
    // sodium / potassium are members, cramp is a symptom: neither inherits this identity.
    aliases: ["electrolyte", "electrolytes", "chat dien giai", "dien giai"],
    related: [
      { topic: "muscle cramp", aliases: ["cramp", "cramps", "muscle cramp", "muscle cramps", "chuot rut"], identity: { en: "A muscle cramp is a sudden, involuntary tightening of a muscle that does not relax right away and is often painful.", vi: "Chuột rút (muscle cramp) là sự co cứng đột ngột, không chủ ý của một cơ, không giãn ra ngay và thường gây đau." } },
    ],
    contraindicationTags: ["MEDICAL_CONTEXT", "MEDICATION_CONTEXT"],
    sources: ["sawka-2007-acsm-fluid", "mcdermott-2017-nata-fluid"],
    version: 1,
    supplement: { category: "ESSENTIAL_NUTRIENT", dependsOn: ["SWEAT_LOSS"], baseline: false },
    claims: [
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "performance and fluid balance during exercise", population: "people doing physical activity", context: "electrolyte drinks versus water", claim: "Drinks containing electrolytes and carbohydrate can provide benefits over water alone under certain circumstances.", sources: ["sawka-2007-acsm-fluid"], conditions: ["depends on sweat rate, session duration and environment"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "electrolyte need", population: "people doing physical activity", context: "individual differences", claim: "Sweat electrolyte losses differ considerably between individuals, so replacement is individual rather than fixed.", sources: ["sawka-2007-acsm-fluid"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "safety", population: "physically active people", context: "drinking large volumes", claim: "Overdrinking carries a risk of hyponatremia.", sources: ["mcdermott-2017-nata-fluid"], lens: "DIETARY" }),
    ],
  },
  {
    id: "nutrition-micronutrient-adequacy",
    topic: "micronutrient adequacy",
    domain: "NUTRITION",
    retrievalTags: ["micronutrient", "micronutrients", "vitamins", "minerals", "deficiency", "deficient", "iron", "vi chat", "thieu chat"],
    aliases: ["micronutrient", "micronutrients", "vi chat"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["maughan-2018-ioc-supplements", "thomas-2016-acsm-nutrition"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "decision to supplement a micronutrient", population: "athletes", context: "suspected shortfall", claim: "Micronutrient supplements are for managing deficiencies, and a complete nutritional assessment should be undertaken before deciding on supplement use.", sources: ["maughan-2018-ioc-supplements"], limitations: ["consensus written for high-performance athletes"], lens: "DIETARY" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "personal nutrition plan", population: "athletes", context: "individual needs", claim: "Athletes should be referred to a registered dietitian or nutritionist for a personalised nutrition plan.", sources: ["thomas-2016-acsm-nutrition"], lens: "DIETARY" }),
      claim({ type: "REASONABLE_INFERENCE", strength: "LIMITED", stance: "MIXED", outcome: "whether one person is deficient", population: "any individual", context: "iron, vitamin D and other lab-defined statuses", claim: "Nothing said in a chat establishes a deficiency; the cited consensus asks for a nutritional assessment before supplementing.", sources: ["maughan-2018-ioc-supplements"], lens: "DIETARY" }),
    ],
  },
];
