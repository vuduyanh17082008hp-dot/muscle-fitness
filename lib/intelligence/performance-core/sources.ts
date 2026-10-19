import type { KnowledgeSource, SourceClass } from "./types";

/**
 * Canonical source registry (ICH-1).
 *
 * Whitelist philosophy: position stands, consensus statements, guidelines, meta-analyses and systematic reviews first;
 * a narrative review or primary study only where nothing stronger was verified. Every entry below was looked up on
 * PubMed on VERIFIED_AT and its ABSTRACT was read — nothing here comes from model memory. A claim in knowledge/*.ts may
 * state only what the cited abstract states. Do not add an entry you have not looked up; leave the topic in
 * KNOWLEDGE_GAPS (registry.ts) instead.
 */
const VERIFIED_AT = "2026-10-13";

const src = (id: string, sourceClass: SourceClass, authors: string, year: number, journal: string, title: string, pmid: string, doi: string): KnowledgeSource => ({
  id, title, authors, journal, year, pmid, doi, sourceClass, verifiedVia: "PUBMED_ABSTRACT", verifiedAt: VERIFIED_AT,
});

export const SOURCE_REGISTRY: readonly KnowledgeSource[] = [
  // ---- training ----
  src("schoenfeld-2017-volume", "META_ANALYSIS", "Schoenfeld BJ, Ogborn D, Krieger JW", 2017, "J Sports Sci", "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis", "27433992", "10.1080/02640414.2016.1210197"),
  src("pelland-2025-dose-response", "META_ANALYSIS", "Pelland JC, Remmert JF, Robinson ZP, et al.", 2025, "Sports Med", "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains", "41343037", "10.1007/s40279-025-02344-w"),
  src("schoenfeld-2019-frequency", "META_ANALYSIS", "Schoenfeld BJ, Grgic J, Krieger J", 2019, "J Sports Sci", "How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis of studies examining the effects of resistance training frequency", "30558493", "10.1080/02640414.2018.1555906"),
  src("schoenfeld-2017-load", "META_ANALYSIS", "Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW", 2017, "J Strength Cond Res", "Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis", "28834797", "10.1519/JSC.0000000000002200"),
  src("grgic-2022-failure", "META_ANALYSIS", "Grgic J, Schoenfeld BJ, Orazem J, Sabol F", 2022, "J Sport Health Sci", "Effects of resistance training performed to repetition failure or non-failure on muscular strength and hypertrophy: A systematic review and meta-analysis", "33497853", "10.1016/j.jshs.2021.01.007"),
  src("refalo-2023-proximity-failure", "META_ANALYSIS", "Refalo MC, Helms ER, Trexler ET, et al.", 2023, "Sports Med", "Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis", "36334240", "10.1007/s40279-022-01784-y"),
  src("zourdos-2016-rir-rpe", "PRIMARY_STUDY", "Zourdos MC, Klemp A, Dolan C, et al.", 2016, "J Strength Cond Res", "Novel Resistance Training-Specific Rating of Perceived Exertion Scale Measuring Repetitions in Reserve", "26049792", "10.1519/JSC.0000000000001049"),
  src("acsm-2009-progression", "POSITION_STAND", "ACSM (American College of Sports Medicine)", 2009, "Med Sci Sports Exerc", "American College of Sports Medicine position stand. Progression models in resistance training for healthy adults", "19204579", "10.1249/MSS.0b013e3181915670"),
  src("bell-2023-deload-delphi", "CONSENSUS_STATEMENT", "Bell L, Strafford BW, Coleman M, et al.", 2023, "Sports Med Open", "Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach", "37730925", "10.1186/s40798-023-00633-0"),
  src("hirshkowitz-2015-sleep", "CONSENSUS_STATEMENT", "Hirshkowitz M, Whiton K, Albert SM, et al.", 2015, "Sleep Health", "National Sleep Foundation's sleep time duration recommendations: methodology and results summary", "29073412", "10.1016/j.sleh.2014.12.010"),
  src("craven-2022-sleep-loss", "META_ANALYSIS", "Craven J, McCartney D, Desbrow B, et al.", 2022, "Sports Med", "Effects of Acute Sleep Loss on Physical Performance: A Systematic and Meta-Analytical Review", "35708888", "10.1007/s40279-022-01706-y"),
  src("schumann-2022-concurrent", "META_ANALYSIS", "Schumann M, Feuerbacher JF, Sünkeler M, et al.", 2022, "Sports Med", "Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis", "34757594", "10.1007/s40279-021-01587-7"),
  src("wilson-2012-concurrent", "META_ANALYSIS", "Wilson JM, Marin PJ, Rhea MR, et al.", 2012, "J Strength Cond Res", "Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises", "22002517", "10.1519/JSC.0b013e31823a3e2d"),
  // ---- nutrition ----
  src("aragon-2017-issn-diets", "POSITION_STAND", "Aragon AA, Schoenfeld BJ, Wildman R, et al.", 2017, "J Int Soc Sports Nutr", "International society of sports nutrition position stand: diets and body composition", "28630601", "10.1186/s12970-017-0174-y"),
  src("jager-2017-issn-protein", "POSITION_STAND", "Jäger R, Kerksick CM, Campbell BI, et al.", 2017, "J Int Soc Sports Nutr", "International Society of Sports Nutrition Position Stand: protein and exercise", "28642676", "10.1186/s12970-017-0177-8"),
  src("morton-2018-protein-meta", "META_ANALYSIS", "Morton RW, Murphy KT, McKellar SR, et al.", 2018, "Br J Sports Med", "A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults", "28698222", "10.1136/bjsports-2017-097608"),
  src("schoenfeld-2018-protein-per-meal", "NARRATIVE_REVIEW", "Schoenfeld BJ, Aragon AA", 2018, "J Int Soc Sports Nutr", "How much protein can the body use in a single meal for muscle-building? Implications for daily protein distribution", "29497353", "10.1186/s12970-018-0215-1"),
  src("kerksick-2017-issn-timing", "POSITION_STAND", "Kerksick CM, Arent S, Schoenfeld BJ, et al.", 2017, "J Int Soc Sports Nutr", "International society of sports nutrition position stand: nutrient timing", "28919842", "10.1186/s12970-017-0189-4"),
  src("aragon-2013-anabolic-window", "NARRATIVE_REVIEW", "Aragon AA, Schoenfeld BJ", 2013, "J Int Soc Sports Nutr", "Nutrient timing revisited: is there a post-exercise anabolic window?", "23360586", "10.1186/1550-2783-10-5"),
  src("whittaker-2021-low-fat-testosterone", "META_ANALYSIS", "Whittaker J, Wu K", 2021, "J Steroid Biochem Mol Biol", "Low-fat diets and testosterone in men: Systematic review and meta-analysis of intervention studies", "33741447", "10.1016/j.jsbmb.2021.105878"),
  src("thomas-2016-acsm-nutrition", "POSITION_STAND", "Thomas DT, Erdman KA, Burke LM", 2016, "Med Sci Sports Exerc", "American College of Sports Medicine Joint Position Statement. Nutrition and Athletic Performance", "26891166", "10.1249/MSS.0000000000000852"),
  src("sawka-2007-acsm-fluid", "POSITION_STAND", "Sawka MN, Burke LM, Eichner ER, et al.", 2007, "Med Sci Sports Exerc", "American College of Sports Medicine position stand. Exercise and fluid replacement", "17277604", "10.1249/mss.0b013e31802ca597"),
  src("mcdermott-2017-nata-fluid", "POSITION_STAND", "McDermott BP, Anderson SA, Armstrong LE, et al.", 2017, "J Athl Train", "National Athletic Trainers' Association Position Statement: Fluid Replacement for the Physically Active", "28985128", "10.4085/1062-6050-52.9.02"),
  src("maughan-2018-ioc-supplements", "CONSENSUS_STATEMENT", "Maughan RJ, Burke LM, Dvorak J, et al.", 2018, "Br J Sports Med", "IOC consensus statement: dietary supplements and the high-performance athlete", "29540367", "10.1136/bjsports-2018-099027"),
  src("uspstf-2022-vitamins", "GUIDELINE", "USPSTF (Mangione CM, Barry MJ, Nicholson WK, et al.)", 2022, "JAMA", "Vitamin, Mineral, and Multivitamin Supplementation to Prevent Cardiovascular Disease and Cancer: US Preventive Services Task Force Recommendation Statement", "35727271", "10.1001/jama.2022.8970"),
  // ---- supplements ----
  src("kreider-2017-issn-creatine", "POSITION_STAND", "Kreider RB, Kalman DS, Antonio J, et al.", 2017, "J Int Soc Sports Nutr", "International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine", "28615996", "10.1186/s12970-017-0173-z"),
  src("antonio-2021-creatine-misconceptions", "NARRATIVE_REVIEW", "Antonio J, Candow DG, Forbes SC, et al.", 2021, "J Int Soc Sports Nutr", "Common questions and misconceptions about creatine supplementation: what does the scientific evidence really show?", "33557850", "10.1186/s12970-021-00412-w"),
  src("wolfe-2017-bcaa", "NARRATIVE_REVIEW", "Wolfe RR", 2017, "J Int Soc Sports Nutr", "Branched-chain amino acids and muscle protein synthesis in humans: myth or reality?", "28852372", "10.1186/s12970-017-0184-9"),
  src("ferrando-2023-issn-eaa", "POSITION_STAND", "Ferrando AA, Wolfe RR, Hirsch KR, et al.", 2023, "J Int Soc Sports Nutr", "International Society of Sports Nutrition Position Stand: Effects of essential amino acid supplementation on exercise and performance", "37800468", "10.1080/15502783.2023.2263409"),
  src("guest-2021-issn-caffeine", "POSITION_STAND", "Guest NS, VanDusseldorp TA, Nelson MT, et al.", 2021, "J Int Soc Sports Nutr", "International society of sports nutrition position stand: caffeine and exercise performance", "33388079", "10.1186/s12970-020-00383-4"),
  src("jager-2025-issn-omega3", "POSITION_STAND", "Jäger R, Heileson JL, Abou Sawan S, et al.", 2025, "J Int Soc Sports Nutr", "International Society of Sports Nutrition Position Stand: Long-Chain Omega-3 Polyunsaturated Fatty Acids", "39810703", "10.1080/15502783.2024.2441775"),
  src("owens-2018-vitamin-d", "NARRATIVE_REVIEW", "Owens DJ, Allison R, Close GL", 2018, "Sports Med", "Vitamin D and the Athlete: Current Perspectives and New Challenges", "29368183", "10.1007/s40279-017-0841-9"),
  src("trexler-2015-issn-beta-alanine", "POSITION_STAND", "Trexler ET, Smith-Ryan AE, Stout JR, et al.", 2015, "J Int Soc Sports Nutr", "International society of sports nutrition position stand: Beta-Alanine", "26175657", "10.1186/s12970-015-0090-y"),
  src("varvik-2021-citrulline-malate", "META_ANALYSIS", "Vårvik FT, Bjørnsen T, Gonzalez AM", 2021, "Int J Sport Nutr Exerc Metab", "Acute Effect of Citrulline Malate on Repetition Performance During Strength Training: A Systematic Review and Meta-Analysis", "34010809", "10.1123/ijsnem.2020-0295"),
  src("khatri-2021-collagen", "SYSTEMATIC_REVIEW", "Khatri M, Naughton RJ, Clifford T, et al.", 2021, "Amino Acids", "The effects of collagen peptide supplementation on body composition, collagen synthesis, and recovery from joint injury and exercise: a systematic review", "34491424", "10.1007/s00726-021-03072-x"),
  src("bonilla-2021-ashwagandha", "META_ANALYSIS", "Bonilla DA, Moreno Y, Gho C, et al.", 2021, "J Funct Morphol Kinesiol", "Effects of Ashwagandha (Withania somnifera) on Physical Performance: Systematic Review and Bayesian Meta-Analysis", "33670194", "10.3390/jfmk6010020"),
  src("rhodes-2017-nac", "META_ANALYSIS", "Rhodes K, Braakhuis A", 2017, "Sports Med", "Performance and Side Effects of Supplementation with N-Acetylcysteine: A Systematic Review and Meta-Analysis", "28102488", "10.1007/s40279-017-0677-3"),
  src("rathmacher-2025-issn-hmb", "POSITION_STAND", "Rathmacher JA, Pitchford LM, Stout JR, et al.", 2025, "J Int Soc Sports Nutr", "International society of sports nutrition position stand: β-hydroxy-β-methylbutyrate (HMB)", "39699070", "10.1080/15502783.2024.2434734"),
  src("jakubowski-2020-hmb-meta", "META_ANALYSIS", "Jakubowski JS, Nunes EA, Teixeira FJ, et al.", 2020, "Nutrients", "Supplementation with the Leucine Metabolite β-hydroxy-β-methylbutyrate (HMB) does not Improve Resistance Exercise-Induced Changes in Body Composition or Strength in Young Subjects: A Systematic Review and Meta-Analysis", "32456217", "10.3390/nu12051523"),
];

const BY_ID = new Map(SOURCE_REGISTRY.map((source) => [source.id, source]));

export function getSource(id: string): KnowledgeSource | null {
  return BY_ID.get(id) ?? null;
}

/** Short human citation for prompts and source lists: "Kreider 2017 (ISSN position stand)". */
export function citeSource(id: string): string {
  const source = BY_ID.get(id);
  if (!source) return id;
  const lead = source.authors.split(/[ ,(]/)[0];
  return `${lead} ${source.year}, ${source.journal}`;
}
