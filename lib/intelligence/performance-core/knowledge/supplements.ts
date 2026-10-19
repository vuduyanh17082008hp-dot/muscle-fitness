import type { KnowledgeGap, KnowledgeRecord } from "../types";
import { claim } from "./claim";

const HEALTHY = "healthy adults";
const RT = "healthy adults doing resistance training";

/**
 * Shared supplement evidence (ICH-1). ONE copy, read by both coaches: Dante through the PERFORMANCE lens, Gemma through
 * the DIETARY lens. These are evidence and conditions, never answers — which option suits a person is derived per turn by
 * policy.ts from the claims, the profile's dependencies and what is known about the person.
 *
 * MECHANISM != CLINICAL BENEFIT · POPULARITY != EVIDENCE · OPTIONAL != NECESSARY · SUPPLEMENT != TREATMENT.
 */
export const SUPPLEMENT_RECORDS: KnowledgeRecord[] = [
  {
    id: "supplement-principles",
    topic: "supplement use in general",
    domain: "SUPPLEMENT",
    retrievalTags: ["supplement", "supplements", "stack", "supp", "supps", "thuc pham bo sung", "thuc pham chuc nang", "tpbs"],
    contraindicationTags: ["MEDICATION_CONTEXT", "MEDICAL_CONTEXT", "PREGNANCY"],
    sources: ["maughan-2018-ioc-supplements"],
    version: 1,
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "contribution to performance", population: "athletes", context: "supplements relative to the whole nutrition programme", claim: "Nutrition usually makes a small contribution to performance and supplements a minor contribution to that nutrition programme.", sources: ["maughan-2018-ioc-supplements"] }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "which supplements work", population: "athletes", context: "performance supplements as a group", claim: "Only a few performance supplements have good evidence of benefit (caffeine, creatine, specific buffering agents and nitrate), and responses vary widely between individuals.", sources: ["maughan-2018-ioc-supplements"] }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "decision to use a supplement", population: "athletes", context: "before starting any supplement", claim: "A complete nutritional assessment should come before any decision about supplement use; some supplements may harm health or contain prohibited substances.", sources: ["maughan-2018-ioc-supplements"] }),
    ],
  },
  {
    id: "supplement-creatine",
    topic: "creatine monohydrate",
    identity: { en: "Creatine is a compound the body makes from amino acids and also gets from meat and fish; it is stored mostly in skeletal muscle as phosphocreatine, a fast reserve for regenerating ATP.", vi: "Creatine là một hợp chất cơ thể tự tạo từ axit amin và cũng có trong thịt, cá; nó được dự trữ chủ yếu trong cơ xương dưới dạng phosphocreatine, nguồn dự trữ nhanh để tái tạo ATP." },
    domain: "SUPPLEMENT",
    retrievalTags: ["creatine", "creatine monohydrate", "creatin"],
    aliases: ["creatine", "creatine monohydrate", "creatin"],
    contraindicationTags: ["MEDICAL_CONTEXT", "MEDICATION_CONTEXT", "AGE_CONTEXT"],
    sources: ["kreider-2017-issn-creatine", "antonio-2021-creatine-misconceptions", "maughan-2018-ioc-supplements"],
    version: 1,
    supplement: { category: "ERGOGENIC", dependsOn: [], baseline: true },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "high-intensity exercise performance and training adaptations", population: "athletes and exercising individuals", context: "regular supplementation alongside training", claim: "Creatine supplementation consistently raises muscle creatine, which may explain the observed improvements in high-intensity exercise performance and the greater training adaptations that follow.", sources: ["kreider-2017-issn-creatine", "maughan-2018-ioc-supplements"], lens: "PERFORMANCE" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "tolerability", population: "healthy individuals", context: "recommended doses", claim: "Creatine is relatively well tolerated at recommended dosages (3-5 g per day, or 0.1 g per kg body mass per day).", sources: ["antonio-2021-creatine-misconceptions", "kreider-2017-issn-creatine"], limitations: ["stated for healthy individuals"] }),
      claim({ type: "UNCERTAIN", strength: "LIMITED", outcome: "post-exercise recovery", population: "athletes", context: "recovery between sessions", claim: "A recovery benefit is described only as something creatine 'may' enhance, not as an established effect.", sources: ["kreider-2017-issn-creatine"], uncertainty: "worded as possible in the position stand", lens: "PERFORMANCE" }),
      claim({ type: "REASONABLE_INFERENCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "necessity for training progress", population: RT, context: "whether creatine is required", claim: "Supplements make at most a minor contribution next to training and diet, so creatine is an optional aid, not a requirement for progress.", sources: ["maughan-2018-ioc-supplements"] }),
    ],
  },
  {
    id: "supplement-whey",
    topic: "whey protein",
    identity: { en: "Whey protein is the protein fraction of milk that stays in the liquid when cheese is made, usually sold as a powder.", vi: "Whey protein là phần protein của sữa còn lại trong phần nước khi làm phô mai, thường được bán dạng bột." },
    domain: "SUPPLEMENT",
    retrievalTags: ["whey", "protein powder", "protein shake", "protein shakes", "protein supplement", "casein", "bot dam", "sua tang co"],
    // Protein powder / shake / bột đạm are product classes; casein is a sibling milk protein. Neither is whey.
    aliases: ["whey", "whey protein"],
    related: [
      { topic: "casein", aliases: ["casein", "casein protein", "micellar casein"], identity: { en: "Casein is the main protein in milk, about 80% of cow's milk protein, and the part that forms the curd when cheese is made.", vi: "Casein là protein chính trong sữa, chiếm khoảng 80% protein của sữa bò, và là phần tạo thành khối đông khi làm phô mai." } },
    ],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["jager-2017-issn-protein", "morton-2018-protein-meta"],
    version: 1,
    supplement: { category: "PROTEIN_SOURCE", dependsOn: ["PROTEIN_INTAKE"], baseline: true },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "meeting daily protein needs", population: "physically active individuals", context: "food versus protein supplements", claim: "Daily protein needs can be met through whole foods; a protein supplement is a practical way of ensuring adequate protein quality and quantity.", sources: ["jager-2017-issn-protein"], lens: "DIETARY" }),
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "resistance-training gains in muscle and strength", population: "healthy adults in resistance-training trials", context: "adding protein when total intake is below about 1.6 g per kg per day", claim: "Protein supplementation enhanced gains in muscle size and strength, but adding protein beyond a total intake of about 1.6 g per kg per day gave no further gain in fat-free mass.", sources: ["morton-2018-protein-meta"], conditions: ["benefit depends on total daily protein not already being adequate"], lens: "PERFORMANCE" }),
      claim({ type: "REASONABLE_INFERENCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "an anabolic advantage over adequate protein from food", population: RT, context: "whey when total protein is already adequate", claim: "Because the benefit of added protein stops once total intake is adequate, whey is a convenient protein source rather than something with a unique muscle-building effect.", sources: ["morton-2018-protein-meta"], lens: "DIETARY" }),
    ],
  },
  {
    id: "supplement-bcaa",
    topic: "BCAA",
    identity: { en: "BCAAs (branched-chain amino acids) are three essential amino acids, leucine, isoleucine and valine, sold together as a supplement.", vi: "BCAA (branched-chain amino acids, axit amin chuỗi nhánh) là ba axit amin thiết yếu: leucine, isoleucine và valine, được bán chung dưới dạng thực phẩm bổ sung." },
    domain: "SUPPLEMENT",
    retrievalTags: ["bcaa", "bcaas", "branched chain amino acids", "branched-chain amino acids"],
    aliases: ["bcaa", "bcaas", "branched chain amino acids", "branched-chain amino acids", "axit amin chuoi nhanh"],
    contraindicationTags: [],
    sources: ["wolfe-2017-bcaa", "jager-2017-issn-protein"],
    version: 1,
    supplement: { category: "AMINO_ACID", dependsOn: ["PROTEIN_INTAKE"], redundantWith: "ADEQUATE_COMPLETE_PROTEIN", subsetOf: "supplement-eaa", baseline: true },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "muscle protein synthesis and an anabolic response", population: "humans", context: "BCAAs taken on their own", claim: "The claim that dietary BCAAs alone stimulate muscle protein synthesis or produce an anabolic response in humans is unwarranted.", sources: ["wolfe-2017-bcaa"], limitations: ["single-author narrative review"], lens: "PERFORMANCE" }),
      claim({ type: "MECHANISM", strength: "MODERATE", outcome: "why BCAAs alone fall short", population: "humans", context: "building new muscle protein", claim: "Building new muscle protein needs all the essential amino acids; with only the three BCAAs supplied, the rest can come only from muscle protein breakdown.", sources: ["wolfe-2017-bcaa", "jager-2017-issn-protein"] }),
      claim({ type: "REASONABLE_INFERENCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "added value on top of adequate complete protein", population: RT, context: "someone already eating enough complete protein", claim: "Complete protein from food or a protein supplement already supplies the BCAAs together with the other essential amino acids, so extra BCAAs add little.", sources: ["wolfe-2017-bcaa", "jager-2017-issn-protein"], lens: "DIETARY" }),
    ],
  },
  {
    id: "supplement-eaa",
    topic: "EAA",
    identity: { en: "EAAs (essential amino acids) are the nine amino acids the body cannot make and has to get from food.", vi: "EAA (essential amino acids, axit amin thiết yếu) là chín axit amin cơ thể không tự tạo được và phải lấy từ thức ăn." },
    domain: "SUPPLEMENT",
    retrievalTags: ["eaa", "eaas", "essential amino acid supplement", "essential amino acids supplement"],
    aliases: ["eaa", "eaas", "essential amino acids", "essential amino acid", "axit amin thiet yeu"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["ferrando-2023-issn-eaa", "jager-2017-issn-protein"],
    version: 1,
    supplement: { category: "AMINO_ACID", dependsOn: ["PROTEIN_INTAKE"], redundantWith: "ADEQUATE_COMPLETE_PROTEIN", baseline: false },
    claims: [
      claim({ type: "MECHANISM", strength: "MODERATE", outcome: "acute muscle protein synthesis", population: "healthy and anabolic-resistant (ageing or clinical) people", context: "free-form EAA ingestion", claim: "Free-form EAAs raise blood EAA concentrations quickly and stimulate muscle protein synthesis; unlike BCAAs they include every essential amino acid.", sources: ["ferrando-2023-issn-eaa"], limitations: ["an acute synthesis response, not a long-term muscle-gain outcome"] }),
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "meeting essential amino acid requirements", population: HEALTHY, context: "caloric deficit", claim: "EAA requirements rise in a caloric deficit, where meeting whole-body EAA needs matters for keeping muscle responsive.", sources: ["ferrando-2023-issn-eaa"], conditions: ["in a caloric deficit"], lens: "DIETARY" }),
      claim({ type: "REASONABLE_INFERENCE", strength: "LIMITED", stance: "DOES_NOT_SUPPORT", outcome: "added value on top of adequate complete protein", population: RT, context: "someone already eating enough complete protein", claim: "Whole-food protein that contains all the EAAs is the recommended focus, so an EAA product mainly matters when food protein falls short.", sources: ["jager-2017-issn-protein"], uncertainty: "an inference; no source here compares EAA supplements against an already adequate diet for long-term gains", lens: "DIETARY" }),
    ],
  },
  {
    id: "supplement-caffeine",
    topic: "caffeine",
    identity: { en: "Caffeine is a stimulant compound found naturally in coffee, tea and cocoa and added to energy drinks and pre-workouts.", vi: "Caffeine là một hợp chất kích thích có tự nhiên trong cà phê, trà, ca cao và được thêm vào nước tăng lực, pre-workout." },
    domain: "SUPPLEMENT",
    retrievalTags: ["caffeine", "pre workout", "pre-workout", "preworkout", "energy drink", "energy drinks", "coffee", "stimulant", "stimulants", "ca phe"],
    // Pre-workout, energy drinks and coffee contain caffeine; they are not caffeine.
    aliases: ["caffeine", "cafein"],
    related: [
      { topic: "pre-workout", aliases: ["pre-workout", "pre workout", "preworkout", "pre-workouts", "pre workouts"], identity: { en: "Pre-workout is a label for powder or drink products sold to take before training; most contain caffeine plus other ingredients, and formulas vary widely by brand.", vi: "Pre-workout là tên gọi các sản phẩm dạng bột hoặc nước được bán để dùng trước khi tập; phần lớn chứa caffeine cùng các thành phần khác, và công thức khác nhau nhiều giữa các nhãn hàng." } },
    ],
    contraindicationTags: ["STIMULANT_RISK", "AGE_CONTEXT", "MEDICATION_CONTEXT", "MEDICAL_CONTEXT", "PREGNANCY"],
    sources: ["guest-2021-issn-caffeine", "maughan-2018-ioc-supplements"],
    version: 1,
    supplement: { category: "ERGOGENIC", dependsOn: ["SLEEP_AND_STIMULANT_LOAD"], baseline: true },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "acute exercise performance", population: "trained and untrained individuals", context: "taken before exercise", claim: "Caffeine acutely enhances various aspects of exercise performance in many but not all studies, with small to moderate benefits for muscular endurance, strength, sprinting and aerobic work.", sources: ["guest-2021-issn-caffeine", "maughan-2018-ioc-supplements"], lens: "PERFORMANCE" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "HIGH", outcome: "effective dose", population: "adults in exercise studies", context: "dose", claim: "Performance benefits are consistently seen at 3-6 mg per kg body mass; very high doses (around 9 mg per kg) bring a high incidence of side effects and are not required.", sources: ["guest-2021-issn-caffeine"], lens: "PERFORMANCE" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "sleep and anxiety side effects", population: "adults in exercise studies", context: "individual response", claim: "People differ in both the performance response and in adverse effects on sleep or feelings of anxiety; habitual caffeine intake may also play a role.", sources: ["guest-2021-issn-caffeine"] }),
    ],
  },
  {
    id: "supplement-omega3",
    topic: "omega-3 (fish oil)",
    identity: { en: "Omega-3 fatty acids are a family of polyunsaturated fats; fish oil supplies mainly EPA and DHA.", vi: "Omega-3 là một nhóm axit béo không bão hòa đa; dầu cá cung cấp chủ yếu EPA và DHA." },
    domain: "SUPPLEMENT",
    retrievalTags: ["omega-3", "omega 3", "omega3", "fish oil", "epa", "dha", "dau ca"],
    aliases: ["omega-3", "omega 3", "omega3", "omega-3 fatty acids", "fish oil", "dau ca"],
    contraindicationTags: ["MEDICATION_CONTEXT", "MEDICAL_CONTEXT"],
    sources: ["jager-2025-issn-omega3"],
    version: 1,
    supplement: { category: "ESSENTIAL_NUTRIENT", dependsOn: ["FISH_INTAKE"], baseline: true },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "muscle hypertrophy", population: "young adults", context: "supplementing for muscle growth", claim: "Omega-3 supplementation may not confer a muscle hypertrophic benefit in young adults.", sources: ["jager-2025-issn-omega3"], lens: "PERFORMANCE" }),
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "omega-3 status", population: "healthy and athletic populations", context: "low intake from the diet", claim: "Diets rich in omega-3, including supplements, are effective for raising omega-3 levels, and athletes may be at higher risk of insufficiency.", sources: ["jager-2025-issn-omega3"], conditions: ["depends on how much oily fish and other omega-3 sources the diet already contains"], lens: "DIETARY" }),
      claim({ type: "UNCERTAIN", strength: "LIMITED", outcome: "strength and muscle soreness", population: "healthy and athletic populations", context: "combined with resistance training", claim: "Omega-3 with resistance training may improve strength in a dose- and duration-dependent manner and may reduce subjective soreness after intense exercise.", sources: ["jager-2025-issn-omega3"], uncertainty: "both worded as 'may' in the position stand", lens: "PERFORMANCE" }),
    ],
  },
  {
    id: "supplement-multivitamin",
    topic: "multivitamin",
    identity: { en: "A multivitamin is a single product that combines several vitamins and usually some minerals.", vi: "Multivitamin là một sản phẩm gộp nhiều vitamin và thường có thêm một số khoáng chất." },
    domain: "SUPPLEMENT",
    retrievalTags: ["multivitamin", "multivitamins", "multi vitamin", "multi-vitamin", "vitamin tong hop"],
    aliases: ["multivitamin", "multivitamins", "multi vitamin", "multi-vitamin", "vitamin tong hop"],
    contraindicationTags: ["MEDICATION_CONTEXT", "PREGNANCY"],
    sources: ["uspstf-2022-vitamins", "maughan-2018-ioc-supplements"],
    version: 1,
    supplement: { category: "ESSENTIAL_NUTRIENT", dependsOn: ["DIET_QUALITY"], baseline: true },
    claims: [
      claim({ type: "UNCERTAIN", strength: "INSUFFICIENT", stance: "MIXED", outcome: "prevention of cardiovascular disease and cancer", population: "community-dwelling non-pregnant adults", context: "routine multivitamin use", claim: "The evidence is insufficient to determine the balance of benefits and harms of multivitamins for preventing cardiovascular disease or cancer.", sources: ["uspstf-2022-vitamins"] }),
      claim({ type: "CONDITIONAL", strength: "MODERATE", outcome: "correcting an identified micronutrient shortfall", population: "athletes", context: "a shortfall found by nutritional assessment", claim: "Managing a micronutrient deficiency is a legitimate use of supplements, decided after a nutritional assessment.", sources: ["maughan-2018-ioc-supplements"], conditions: ["an assessed dietary shortfall or deficiency"], lens: "DIETARY" }),
      claim({ type: "UNKNOWN", strength: "INSUFFICIENT", stance: "DOES_NOT_SUPPORT", outcome: "gym performance or muscle gain", population: "people with an adequate diet", context: "taking a multivitamin for training results", claim: "No verified source in this registry shows a multivitamin improves training performance or muscle gain in someone whose diet is adequate.", sources: [], lens: "PERFORMANCE" }),
    ],
  },
  {
    id: "supplement-vitamin-d",
    topic: "vitamin D",
    identity: { en: "Vitamin D is a fat-soluble vitamin that the skin makes in sunlight and that a few foods supply.", vi: "Vitamin D là một vitamin tan trong chất béo, được da tạo ra khi có ánh nắng và có trong một số ít thực phẩm." },
    domain: "SUPPLEMENT",
    retrievalTags: ["vitamin d", "vitamin d3", "vit d", "d3"],
    aliases: ["vitamin d", "vitamin d3", "vit d", "d3"],
    contraindicationTags: ["MEDICAL_CONTEXT", "MEDICATION_CONTEXT"],
    sources: ["owens-2018-vitamin-d"],
    version: 1,
    supplement: { category: "ESSENTIAL_NUTRIENT", dependsOn: ["LAB_STATUS"], baseline: true },
    claims: [
      claim({ type: "CONDITIONAL", strength: "LIMITED", stance: "MIXED", outcome: "decision to supplement vitamin D", population: "athletes", context: "no diagnosed pathology", claim: "In the absence of pathology, screening may be unnecessary and could lead to incorrect supplementation; high-dose supplementation could be problematic.", sources: ["owens-2018-vitamin-d"], conditions: ["status is defined by a blood test interpreted by a clinician"], limitations: ["narrative review"] }),
      claim({ type: "UNCERTAIN", strength: "LIMITED", stance: "MIXED", outcome: "muscle recovery and immune function", population: "athletes", context: "extra-skeletal effects", claim: "Vitamin D may interact with muscle and the immune system; a relationship with bone health has not been consistently shown in athletes.", sources: ["owens-2018-vitamin-d"], uncertainty: "worded as 'may' in the review", lens: "PERFORMANCE" }),
    ],
  },
  {
    id: "supplement-beta-alanine",
    topic: "beta-alanine",
    identity: { en: "Beta-alanine is a non-essential amino acid that the body combines with histidine to make carnosine in muscle.", vi: "Beta-alanine là một axit amin không thiết yếu, được cơ thể kết hợp với histidine để tạo carnosine trong cơ." },
    domain: "SUPPLEMENT",
    retrievalTags: ["beta-alanine", "beta alanine", "betaalanine", "carnosine"],
    aliases: ["beta-alanine", "beta alanine", "betaalanine"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["trexler-2015-issn-beta-alanine"],
    version: 1,
    supplement: { category: "ERGOGENIC", dependsOn: [], baseline: false },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "performance in efforts lasting 1 to 4 minutes", population: "healthy populations", context: "daily use for at least 2 to 4 weeks", claim: "Daily beta-alanine (4-6 g) for at least 2-4 weeks improves exercise performance, most clearly in open end-point tasks and time trials lasting 1 to 4 minutes.", sources: ["trexler-2015-issn-beta-alanine"], lens: "PERFORMANCE" }),
      claim({ type: "MECHANISM", strength: "HIGH", outcome: "muscle carnosine", population: "healthy populations", context: "four weeks of supplementation", claim: "Beta-alanine raises muscle carnosine, which acts as an intracellular pH buffer.", sources: ["trexler-2015-issn-beta-alanine"] }),
      claim({ type: "UNCERTAIN", strength: "INSUFFICIENT", stance: "MIXED", outcome: "strength and long endurance performance", population: "healthy populations", context: "strength work and efforts beyond 25 minutes", claim: "More research is needed on beta-alanine's effect on strength and on endurance efforts longer than 25 minutes.", sources: ["trexler-2015-issn-beta-alanine"], lens: "PERFORMANCE" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", outcome: "side effects", population: "healthy populations", context: "recommended doses", claim: "It appears safe in healthy populations at recommended doses; the only reported side effect is tingling (paraesthesia), reduced by smaller divided doses.", sources: ["trexler-2015-issn-beta-alanine"] }),
    ],
  },
  {
    id: "supplement-citrulline",
    topic: "citrulline",
    identity: { en: "Citrulline is a non-essential amino acid, found in watermelon, that the body converts into arginine.", vi: "Citrulline là một axit amin không thiết yếu, có trong dưa hấu, được cơ thể chuyển thành arginine." },
    domain: "SUPPLEMENT",
    retrievalTags: ["citrulline", "l-citrulline", "citrulline malate", "pump supplement"],
    aliases: ["citrulline", "l-citrulline", "citrulline malate"],
    contraindicationTags: ["MEDICATION_CONTEXT", "MEDICAL_CONTEXT"],
    sources: ["varvik-2021-citrulline-malate"],
    version: 1,
    supplement: { category: "ERGOGENIC", dependsOn: [], baseline: false },
    claims: [
      claim({ type: "CONDITIONAL", strength: "LIMITED", outcome: "repetitions to failure in a strength session", population: "mostly strength-trained men", context: "6-8 g citrulline malate 40-60 minutes before training", claim: "Citrulline malate increased repetitions to failure by about three (6%) versus placebo, a small effect; the upper-body result alone was not significant.", sources: ["varvik-2021-citrulline-malate"], limitations: ["8 studies, 137 participants", "the authors note the evidence is conflicting"], lens: "PERFORMANCE" }),
      claim({ type: "UNKNOWN", strength: "INSUFFICIENT", stance: "MIXED", outcome: "long-term strength or muscle gain", population: "any", context: "regular use", claim: "No verified source in this registry shows citrulline changes long-term strength or muscle gain.", sources: [], lens: "PERFORMANCE" }),
    ],
  },
  {
    id: "supplement-collagen",
    topic: "collagen",
    identity: { en: "Collagen is the main structural protein of skin, tendons, ligaments and bone; supplements are usually hydrolysed collagen peptides or gelatin.", vi: "Collagen là protein cấu trúc chính của da, gân, dây chằng và xương; dạng bổ sung thường là collagen peptides thủy phân hoặc gelatin." },
    domain: "SUPPLEMENT",
    retrievalTags: ["collagen", "collagen peptides", "gelatin"],
    aliases: ["collagen", "collagen peptides"],
    contraindicationTags: ["MEDICAL_CONTEXT"],
    sources: ["khatri-2021-collagen"],
    version: 1,
    supplement: { category: "CONNECTIVE_TISSUE", dependsOn: [], baseline: false },
    claims: [
      claim({ type: "UNCERTAIN", strength: "LIMITED", outcome: "joint pain and joint function", population: "mostly recreational athletes", context: "collagen peptides alongside exercise", claim: "Collagen peptides appeared most beneficial for joint functionality and joint pain, with mechanisms unclear.", sources: ["khatri-2021-collagen"], limitations: ["15 small trials; the authors call for larger and more precise studies"], uncertainty: "a symptom outcome in small trials, not a treatment for a joint condition" }),
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "muscle protein synthesis", population: "adults in exercise studies", context: "collagen versus higher-quality protein", claim: "Collagen did not have a significant impact on muscle protein synthesis compared with the same amount of a higher-quality protein.", sources: ["khatri-2021-collagen"], lens: "PERFORMANCE" }),
    ],
  },
  {
    id: "supplement-ashwagandha",
    topic: "ashwagandha",
    identity: { en: "Ashwagandha (Withania somnifera) is a plant from traditional Ayurvedic medicine; supplements are usually extracts of its root.", vi: "Ashwagandha (Withania somnifera) là một loại cây trong y học cổ truyền Ayurveda; dạng bổ sung thường là chiết xuất từ rễ." },
    domain: "SUPPLEMENT",
    retrievalTags: ["ashwagandha", "withania", "adaptogen", "adaptogens"],
    aliases: ["ashwagandha", "withania", "withania somnifera"],
    contraindicationTags: ["MEDICATION_CONTEXT", "MEDICAL_CONTEXT", "PREGNANCY", "AGE_CONTEXT"],
    sources: ["bonilla-2021-ashwagandha"],
    version: 1,
    supplement: { category: "HERBAL", dependsOn: [], baseline: false },
    claims: [
      claim({ type: "UNCERTAIN", strength: "LIMITED", outcome: "physical performance variables", population: "healthy men and women", context: "supplementation trials up to 2020", claim: "Ashwagandha did better than placebo on physical-performance variables, but more comparable studies in training and athletic populations are needed for a stable estimate of the true effect.", sources: ["bonilla-2021-ashwagandha"], limitations: ["12 trials in the quantitative analysis"], uncertainty: "the authors do not consider the effect size settled", lens: "PERFORMANCE" }),
      claim({ type: "UNKNOWN", strength: "INSUFFICIENT", stance: "MIXED", outcome: "testosterone, stress or sleep", population: "any", context: "claims made in marketing", claim: "No verified source in this registry supports a hormonal, stress or sleep claim for ashwagandha.", sources: [] }),
    ],
  },
  {
    id: "supplement-nac",
    topic: "NAC (N-acetylcysteine)",
    identity: { en: "NAC (N-acetylcysteine) is a modified form of the amino acid cysteine and a precursor the body uses to make glutathione.", vi: "NAC (N-acetylcysteine) là một dạng biến đổi của axit amin cysteine, là tiền chất cơ thể dùng để tạo glutathione." },
    domain: "SUPPLEMENT",
    retrievalTags: ["nac", "n-acetylcysteine", "n acetylcysteine", "acetylcysteine"],
    aliases: ["nac", "n-acetylcysteine", "n acetylcysteine", "acetylcysteine"],
    contraindicationTags: ["MEDICATION_CONTEXT", "MEDICAL_CONTEXT", "TREATMENT_CLAIM"],
    sources: ["rhodes-2017-nac"],
    version: 1,
    supplement: { category: "OTHER", dependsOn: [], baseline: false },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "sport performance", population: "athletes in performance trials", context: "acute NAC supplementation", claim: "The pooled performance effect of NAC was negligible and the authors concluded it cannot be recommended at this stage; the risk of side effects remains unclear.", sources: ["rhodes-2017-nac"], limitations: ["7 performance studies"], lens: "PERFORMANCE" }),
      claim({ type: "UNKNOWN", strength: "INSUFFICIENT", stance: "MIXED", outcome: "liver, lung or other organ protection", population: "any", context: "clinical claims", claim: "No verified source in this registry supports NAC as protection or treatment for any organ; that is a medical question.", sources: [] }),
    ],
  },
  {
    id: "supplement-hmb",
    topic: "HMB",
    identity: { en: "HMB (hydroxymethylbutyrate) is a compound the body makes in small amounts when it breaks down the amino acid leucine.", vi: "HMB (hydroxymethylbutyrate) là một hợp chất cơ thể tạo ra với lượng nhỏ khi phân giải axit amin leucine." },
    domain: "SUPPLEMENT",
    retrievalTags: ["hmb", "beta-hydroxy-beta-methylbutyrate", "hydroxymethylbutyrate"],
    aliases: ["hmb", "beta-hydroxy-beta-methylbutyrate", "hydroxymethylbutyrate"],
    contraindicationTags: [],
    sources: ["jakubowski-2020-hmb-meta", "rathmacher-2025-issn-hmb"],
    version: 1,
    supplement: { category: "AMINO_ACID", dependsOn: [], baseline: false },
    claims: [
      claim({ type: "ESTABLISHED_GUIDANCE", strength: "MODERATE", stance: "DOES_NOT_SUPPORT", outcome: "fat-free mass, fat mass and strength", population: "young adults (18-45) doing resistance training", context: "HMB added to resistance training", claim: "HMB produced no significant effect on fat-free mass, fat mass or strength; the findings do not support its use for body composition or strength.", sources: ["jakubowski-2020-hmb-meta"], limitations: ["11 studies analysed"], lens: "PERFORMANCE" }),
      claim({ type: "UNCERTAIN", strength: "LIMITED", stance: "MIXED", outcome: "strength and power", population: "untrained individuals versus trained athletes", context: "HMB with exercise training", claim: "A position stand reports HMB may improve strength and power in untrained individuals, with mixed results in trained athletes.", sources: ["rathmacher-2025-issn-hmb"], uncertainty: "the position stand and the independent meta-analysis reach different conclusions for young trained people", lens: "PERFORMANCE" }),
    ],
  },
];

/**
 * KNOWLEDGE_GAPS — topics the user may ask about for which this registry holds NO verified source. A gap must lower
 * certainty (KNOWLEDGE_INSUFFICIENT) or trigger selective retrieval; it is never answered from model memory as if it
 * were project knowledge. Filling one is ICH-1.1 work: verify a source, then move the topic into a record above.
 */
export const KNOWLEDGE_GAPS: KnowledgeGap[] = [
  { topic: "taurine", domain: "SUPPLEMENT", retrievalTags: ["taurine"], aliases: ["taurine", "taurin"], reason: "no verified source in the registry", identity: { en: "Taurine is a sulfur-containing amino acid the body makes itself; it is not used to build proteins and is found in meat, fish and many energy drinks.", vi: "Taurine là một axit amin chứa lưu huỳnh do cơ thể tự tạo; nó không dùng để xây dựng protein và có trong thịt, cá và nhiều loại nước tăng lực." } },
  { topic: "glucosamine", domain: "SUPPLEMENT", retrievalTags: ["glucosamine", "chondroitin"], aliases: ["glucosamine"], reason: "no verified source in the registry", identity: { en: "Glucosamine is an amino sugar the body makes itself and a natural structural component of cartilage; supplements are usually made from shellfish shells or by fermentation and are often paired with chondroitin.", vi: "Glucosamine là một đường amin cơ thể tự tạo và là thành phần cấu trúc tự nhiên của sụn; dạng bổ sung thường làm từ vỏ giáp xác hoặc bằng lên men và hay đi kèm chondroitin." } },
  { topic: "CoQ10", domain: "SUPPLEMENT", retrievalTags: ["coq10", "coenzyme q10", "ubiquinol"], aliases: ["coq10", "coenzyme q10", "co-q10", "ubiquinone", "ubiquinol"], reason: "no verified source in the registry", identity: { en: "CoQ10 (coenzyme Q10, also called ubiquinone; ubiquinol is its reduced form) is a fat-soluble compound the body makes itself; it carries electrons in the mitochondrial chain that produces ATP, the cell's energy currency.", vi: "CoQ10 (coenzyme Q10, còn gọi là ubiquinone; ubiquinol là dạng khử của nó) là một hợp chất tan trong chất béo do cơ thể tự tạo; nó vận chuyển electron trong chuỗi ty thể tạo ra ATP, đơn vị năng lượng của tế bào." } },
  { topic: "magnesium", domain: "SUPPLEMENT", dependsOn: ["DIET_QUALITY"], retrievalTags: ["magnesium", "zma", "magie"], aliases: ["magnesium", "magie"], related: [{ topic: "ZMA", aliases: ["zma"], identity: { en: "ZMA is a branded supplement formula that combines zinc, magnesium and vitamin B6.", vi: "ZMA là một công thức thực phẩm bổ sung có thương hiệu, kết hợp kẽm, magie và vitamin B6." } }], reason: "no verified source in the registry", identity: { en: "Magnesium is an essential dietary mineral, a cofactor in hundreds of the body's enzyme reactions.", vi: "Magie (magnesium) là một khoáng chất thiết yếu trong khẩu phần, đóng vai trò đồng yếu tố cho hàng trăm phản ứng enzyme của cơ thể." } },
  { topic: "TUDCA", domain: "SUPPLEMENT", retrievalTags: ["tudca"], aliases: ["tudca", "tauroursodeoxycholic acid"], reason: "no verified source; organ-related claims are a medical boundary", identity: { en: "TUDCA (tauroursodeoxycholic acid) is a bile acid: ursodeoxycholic acid bound to taurine, present in small amounts in human bile.", vi: "TUDCA (axit tauroursodeoxycholic) là một axit mật: axit ursodeoxycholic gắn với taurine, có một lượng nhỏ trong mật người." } },
  { topic: "glutamine", domain: "SUPPLEMENT", retrievalTags: ["glutamine"], aliases: ["glutamine", "l-glutamine"], reason: "no verified source in the registry", identity: { en: "Glutamine is an amino acid the body makes itself and the most plentiful free amino acid in blood and muscle.", vi: "Glutamine là một axit amin cơ thể tự tạo và là axit amin tự do dồi dào nhất trong máu và cơ." } },
  { topic: "zinc", domain: "SUPPLEMENT", dependsOn: ["DIET_QUALITY"], retrievalTags: ["zinc"], aliases: ["zinc"], reason: "no verified source in the registry", identity: { en: "Zinc is an essential trace mineral that many of the body's enzymes need and that the body cannot store in large amounts.", vi: "Kẽm (zinc) là một khoáng chất vi lượng thiết yếu, cần cho nhiều enzyme và cơ thể không dự trữ được nhiều." } },
  { topic: "nitrate / beetroot", domain: "SUPPLEMENT", retrievalTags: ["nitrate", "beetroot", "beet juice"], aliases: ["nitrate", "nitrates", "dietary nitrate"], reason: "named by the IOC consensus as evidence-backed, but no dedicated source was verified", identity: { en: "Dietary nitrate is a compound found in beetroot and leafy greens that the body can convert to nitric oxide.", vi: "Nitrate trong thực phẩm là một hợp chất có trong củ dền (beetroot) và rau lá xanh, cơ thể có thể chuyển thành nitric oxide." } },
  { topic: "melatonin and sleep aids", domain: "SUPPLEMENT", retrievalTags: ["melatonin", "sleep aid"], aliases: ["melatonin"], related: [{ topic: "sleep aid", aliases: ["sleep aid", "sleep aids", "sleeping aid", "sleeping aids"], identity: { en: "Sleep aid is a broad label for over-the-counter or prescription products marketed for sleep, such as melatonin, antihistamines or herbal blends; it is not one substance.", vi: "Sleep aid là tên gọi chung cho các sản phẩm bán tự do hoặc kê đơn được quảng cáo cho giấc ngủ, như melatonin, thuốc kháng histamine hoặc hỗn hợp thảo dược; nó không phải một chất duy nhất." } }], reason: "no verified source in the registry", identity: { en: "Melatonin is a hormone the brain's pineal gland releases in darkness to signal night-time; supplements are a synthetic version.", vi: "Melatonin là một hormone do tuyến tùng trong não tiết ra khi trời tối để báo hiệu ban đêm; dạng bổ sung là bản tổng hợp." } },
  { topic: "testosterone boosters", domain: "SUPPLEMENT", retrievalTags: ["test booster", "test boosters", "testosterone booster", "testosterone boosters", "tribulus", "tongkat", "fenugreek", "d-aspartic", "boost testosterone", "tang testosterone"], aliases: ["test booster", "test boosters", "testosterone booster", "testosterone boosters"], reason: "no verified source supports any over-the-counter testosterone booster", boundary: "HORMONAL_BOOSTER", identity: { en: "Testosterone boosters are over-the-counter products, often herbal blends such as tribulus, tongkat ali or fenugreek, marketed as raising testosterone.", vi: "Testosterone booster là các sản phẩm bán tự do, thường là hỗn hợp thảo dược như tribulus, tongkat ali hoặc fenugreek, được quảng cáo là tăng testosterone." } },
  { topic: "prohormones, SARMs and anabolic agents", domain: "SUPPLEMENT", retrievalTags: ["sarm", "sarms", "prohormone", "prohormones", "steroid", "steroids", "anabolic steroid", "anabolic steroids", "trenbolone", "tren cycle", "steroid cycle", "anavar", "oxandrolone", "dianabol", "dbol", "methandrostenolone", "ostarine", "enobosarm", "rad-140", "rad140", "trt", "hgh", "clenbuterol", "clen", "dnp", "post cycle therapy"],
    // Named steroids/SARMs never inherit the group identity: each one asked about by name carries its own (a subtype
    // without one, e.g. RAD-140, stays retrieval-only). TRT, HGH, DNP and clenbuterol are different drugs with different
    // safety profiles. Insulin is alias-only (not a retrieval tag): a plain insulin question is not a PED turn by name.
    aliases: ["sarm", "sarms", "prohormone", "prohormones", "steroid", "steroids", "anabolic steroid", "anabolic steroids", "steroid dong hoa"],
    related: [
      { topic: "TRT", aliases: ["trt", "testosterone replacement therapy"], identity: { en: "TRT (testosterone replacement therapy) is a prescription hormone therapy that supplies testosterone to people diagnosed with low testosterone (hypogonadism).", vi: "TRT (testosterone replacement therapy, liệu pháp thay thế testosterone) là liệu pháp hormone kê đơn, bổ sung testosterone cho người được chẩn đoán thiếu testosterone (suy sinh dục)." } },
      { topic: "HGH", aliases: ["hgh", "human growth hormone", "growth hormone", "somatropin"], identity: { en: "HGH (human growth hormone, somatropin) is a hormone the pituitary gland makes; as a drug it is a prescription medicine.", vi: "HGH (human growth hormone, hormone tăng trưởng, somatropin) là hormone do tuyến yên tạo ra; dạng thuốc là thuốc kê đơn." } },
      { topic: "DNP", aliases: ["dnp", "2,4-dinitrophenol", "dinitrophenol"], identity: { en: "DNP (2,4-dinitrophenol) is an industrial chemical that disrupts how mitochondria make ATP; it is not approved as a medicine or food for people.", vi: "DNP (2,4-dinitrophenol) là một hóa chất công nghiệp làm rối loạn cách ty thể tạo ATP; nó không được phép dùng làm thuốc hay thực phẩm cho người." } },
      { topic: "clenbuterol", aliases: ["clenbuterol", "clen"], identity: { en: "Clenbuterol is a beta-2 agonist drug that relaxes airway muscle; some countries license it for asthma, others only for veterinary use, and it is not a steroid or a hormone.", vi: "Clenbuterol là một thuốc chủ vận beta-2 làm giãn cơ đường thở; một số nước cấp phép dùng cho hen suyễn, nước khác chỉ cho thú y, và nó không phải steroid hay hormone." } },
      { topic: "steroid cycle", aliases: ["steroid cycle", "steroid cycles", "chu ky steroid"], identity: { en: "A steroid cycle is a planned period of taking anabolic steroids, followed by a period off them.", vi: "Steroid cycle (chu kỳ steroid) là một giai đoạn dùng steroid đồng hóa có kế hoạch, sau đó là giai đoạn ngưng." } },
      { topic: "Anavar", aliases: ["anavar", "oxandrolone"], identity: { en: "Anavar is a brand name for oxandrolone, a synthetic anabolic steroid (a modified form of testosterone) taken as a tablet; it is a prescription-only or controlled drug in most countries.", vi: "Anavar là tên thương mại của oxandrolone, một steroid đồng hóa tổng hợp (dạng biến đổi của testosterone) dùng đường uống; ở hầu hết các nước đây là thuốc kê đơn hoặc chất bị kiểm soát." } },
      { topic: "trenbolone", aliases: ["trenbolone"], identity: { en: "Trenbolone is a synthetic anabolic steroid developed for veterinary use in cattle; it is not approved as a medicine for people.", vi: "Trenbolone là một steroid đồng hóa tổng hợp được phát triển cho thú y, dùng trên gia súc; nó không được phép dùng làm thuốc cho người." } },
      { topic: "Dianabol", aliases: ["dianabol", "dbol", "methandrostenolone"], identity: { en: "Dianabol is a former brand name for methandrostenolone (metandienone), a synthetic anabolic steroid taken as a tablet; it is not an approved medicine in most countries.", vi: "Dianabol là tên thương mại cũ của methandrostenolone (metandienone), một steroid đồng hóa tổng hợp dùng đường uống; ở hầu hết các nước nó không phải thuốc được cấp phép." } },
      { topic: "ostarine", aliases: ["ostarine", "enobosarm", "mk-2866"], identity: { en: "Ostarine (enobosarm, MK-2866) is a SARM, a selective androgen receptor modulator: an investigational drug that has not been approved as a medicine and is banned in sport.", vi: "Ostarine (enobosarm, MK-2866) là một SARM (chất điều biến chọn lọc thụ thể androgen): một thuốc đang nghiên cứu, chưa được cấp phép làm thuốc và bị cấm trong thể thao." } },
      { topic: "insulin", aliases: ["insulin"], identity: { en: "Insulin is a hormone the pancreas makes that lets cells take up glucose from the blood; as a drug it is a prescription medicine for diabetes.", vi: "Insulin là hormone do tuyến tụy tiết ra, giúp tế bào hấp thu glucose từ máu; dạng thuốc là thuốc kê đơn điều trị tiểu đường." } },
    ],
reason: "hormonal and drug products are outside supplement coaching", boundary: "PED_DRUG", identity: { en: "Prohormones, SARMs and anabolic steroids are hormone drugs or drug-like compounds that act like, or are converted into, testosterone-type anabolic hormones.", vi: "Prohormone, SARM và steroid đồng hóa là các thuốc hormone hoặc hợp chất giống thuốc, hoạt động như hoặc được chuyển thành hormone đồng hóa kiểu testosterone." } },
];
