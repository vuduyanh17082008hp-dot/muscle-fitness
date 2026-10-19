import { DOC, neg, pos, s, type V3Case } from "./cases-v3-types"

/**
 * nutrition-retrieval-eval-v3 — DEV split (tuning is allowed against this file only).
 *
 * Written by an independent evaluator from the corpus text (knowledge/nutrition/**) BEFORE any v3 retrieval output
 * was looked at. FROZEN: queries, labels and split membership must not change once tuning starts; the test pins a
 * SHA-256 of this array. A wrong label is fixed only by publishing a new benchmark version with a documented
 * correction, never by editing rows in place.
 *
 * The held-out split is NOT in this repository (evaluator-only, see docs/nutrition-knowledge-eval.md "v3").
 */
const { TX, FH, VN, HK, CC, IC, MC, FF, FC, FL, MG, CB, UP, CS, CV } = DOC

/** v3.0 rows (frozen; pinned separately so v3.1 provably did not touch them). */
export const CASES_V30_DEV: V3Case[] = [
  // ===================== TEXTURE =====================
  pos("d3-tx01", "this bowl has zero bite, everything's soft", "texture", { style: "indirect", docs: [TX], acc: [FH], sec: [s(TX, "crunch"), s(TX, "contrast")], contrast: "CRUNCH_VS_CREAMINESS", trap: "section-metadata" }),
  pos("d3-tx02", "bro this texture kinda dead", "texture", { style: "slang", docs: [TX], acc: [FH] }),
  pos("d3-tx03", "what can i throw on top so its not all mush", "texture", { style: "messy", docs: [TX], acc: [FH], sec: [s(TX, "crunch"), s(TX, "contrast")] }),
  pos("d3-tx04", "How do I get the coating to actually crisp up instead of going soggy?", "texture", { docs: [TX], acc: [FC, FF], sec: [s(TX, "crispness"), s(FC, "high-leverage-strategies")], contrast: "CRUNCH_VS_CRISPNESS", trap: "section-metadata" }),
  pos("d3-tx05", "I want it smoother, less dry.", "texture", { style: "indirect", docs: [TX], sec: [s(TX, "creaminess")], contrast: "CRUNCH_VS_CREAMINESS", trap: "section-metadata" }),
  pos("d3-tx06", "how do i make my smoothie thicker and more luscious", "texture", { style: "conversational", docs: [TX], acc: [IC], sec: [s(TX, "creaminess")] }),
  pos("d3-tx07", "something I can actually chew on, not just slurp", "texture", { style: "indirect", docs: [TX], sec: [s(TX, "chew")], trap: "section-metadata" }),
  pos("d3-tx08", "how do I make a small portion look and feel like a big plate", "texture", { style: "paraphrase", any: [TX, FL, CB], sec: [s(TX, "volume"), s(FL, "satiety-and-volume"), s(CB, "satiety-and-volume")] }),
  pos("d3-tx09", "it's hot af, want something icy and smooth to eat", "texture", { style: "slang", any: [TX, IC], acc: [MC, FH], sec: [s(TX, "cold-and-frozen-texture"), s(IC, "higher-protein-or-lighter-alternatives")] }),
  pos("d3-tx10", "can you make the yoghurt bowl crunchy instead of all creamy", "texture", { docs: [TX], acc: [MC, CC], sec: [s(TX, "crunch"), s(TX, "contrast")], contrast: "CRUNCH_VS_CREAMINESS", trap: "section-metadata" }),
  pos("d3-tx11", "đồ ăn mềm hết trơn, muốn có chút giòn giòn", "texture", { lang: "vi", style: "indirect", docs: [TX], acc: [FH], unacc: [VN], sec: [s(TX, "crunch"), s(TX, "crispness"), s(TX, "contrast")], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-tx12", "muốn bowl này more crispy nhưng đừng tăng kcal nhiều", "texture", { lang: "mixed", style: "messy", docs: [TX], acc: [FL, FC], unacc: [VN], sec: [s(TX, "crunch"), s(TX, "crispness")], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-tx13", "more crunch?", "texture", { style: "fragment", docs: [TX], acc: [FH], sec: [s(TX, "crunch")] }),
  pos("d3-tx14", "soft base crunchy topping combos?", "texture", { style: "fragment", docs: [TX], sec: [s(TX, "contrast"), s(TX, "crunch")], trap: "section-metadata" }),
  pos("d3-tx15", "everything on this plate is the same mushy texture, so boring to eat", "texture", { style: "indirect", docs: [TX], acc: [FH], sec: [s(TX, "contrast"), s(TX, "crunch")] }),
  pos("d3-tx16", "sauce is thin and watery, want it richer in the mouth without loads of cream", "texture", { style: "paraphrase", docs: [TX], acc: [FH], sec: [s(TX, "creaminess")], trap: "section-metadata" }),
  pos("d3-tx17", "something chilled and spoonable for after dinner", "texture", { style: "indirect", any: [IC, TX], acc: [MC], sec: [s(TX, "cold-and-frozen-texture"), s(IC, "higher-protein-or-lighter-alternatives"), s(IC, "real-ice-cream-planned")] }),
  pos("d3-tx18", "and if I want it colder?", "texture", { style: "followup", any: [TX, IC], sec: [s(TX, "cold-and-frozen-texture")], topic: { type: "CRAVING", food: "protein ice cream" } }),

  // ===================== FLAVOR =====================
  pos("d3-fl01", "this chicken tastes like cardboard", "flavor", { style: "indirect", docs: [FH], acc: [TX, FC] }),
  pos("d3-fl02", "needs a squeeze of something to wake it up", "flavor", { style: "indirect", docs: [FH], sec: [s(FH, "acidity")], trap: "section-metadata" }),
  pos("d3-fl03", "how do I get that savoury, meaty depth without adding more oil", "flavor", { docs: [FH], acc: [VN], sec: [s(FH, "umami")], contrast: "SWEET_VS_SAVORY", trap: "section-metadata" }),
  pos("d3-fl04", "I want it to have a kick", "flavor", { style: "indirect", docs: [FH], sec: [s(FH, "spice-and-heat")] }),
  pos("d3-fl05", "sweet tooth hitting but don't wanna dump sugar in my oats", "flavor", { style: "conversational", docs: [FH], acc: [MC, CC, IC, FL, TX], sec: [s(FH, "sweetness")], contrast: "SWEET_VS_SAVORY" }),
  pos("d3-fl06", "coffee in my protein shake makes it way too bitter", "flavor", { docs: [FH], sec: [s(FH, "bitterness"), s(FH, "sweetness")] }),
  pos("d3-fl07", "it tastes under-seasoned, when should I add the salt", "flavor", { docs: [FH], sec: [s(FH, "salt")] }),
  pos("d3-fl08", "herb ideas to make a plain chicken breast less sad", "flavor", { style: "conversational", docs: [FH], acc: [FC, VN], sec: [s(FH, "aromatics-and-herbs")] }),
  pos("d3-fl09", "big pour of a mild sauce or a little of a strong one?", "flavor", { docs: [FH], sec: [s(FH, "seasoning-and-sauces")] }),
  pos("d3-fl10", "món này nhạt nhẽo quá, muốn vị đậm đà hơn", "flavor", { lang: "vi", style: "indirect", docs: [FH], acc: [TX], unacc: [VN], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-fl11", "gà luộc này bland quá, thêm sauce gì cho có flavor", "flavor", { lang: "mixed", style: "messy", docs: [FH], acc: [VN], sec: [s(FH, "seasoning-and-sauces"), s(FH, "umami"), s(FH, "aromatics-and-herbs")] }),
  pos("d3-fl12", "zero flavour lol", "flavor", { style: "fragment", docs: [FH], acc: [TX] }),
  pos("d3-fl13", "chicken and rice every day, how do I make it less boring", "flavor", { style: "conversational", docs: [FH], acc: [TX, FL], unacc: [HK], contrast: "CUISINE_VS_FOOD_ENTITY" }),
  pos("d3-fl14", "dark chocolate in my bowl is kinda harsh, how do I balance it", "flavor", { style: "conversational", docs: [FH], sec: [s(FH, "bitterness"), s(FH, "sweetness")] }),
  pos("d3-fl15", "dry rub or drowning it in sauce, which keeps it lighter", "flavor", { docs: [FH], acc: [FC, FL], sec: [s(FH, "seasoning-and-sauces"), s(FC, "useful-substitutions")] }),
  pos("d3-fl16", "garlic, ginger, lemongrass: how do I use them so it smells amazing", "flavor", { docs: [FH], acc: [VN], sec: [s(FH, "aromatics-and-herbs")] }),
  pos("d3-fl17", "needs acid?", "flavor", { style: "fragment", docs: [FH], sec: [s(FH, "acidity")] }),
  pos("d3-fl18", "ok but spicier?", "flavor", { style: "followup", docs: [FH], acc: [VN], sec: [s(FH, "spice-and-heat")], topic: { type: "FOOD", food: "pho" } }),

  // ===================== CRAVINGS =====================
  pos("d3-cr01", "I could really go for a bowl of Froot Loops rn", "craving_cereal", { style: "slang", docs: [CC], acc: [MC, FL, TX], contrast: "CRAVING_VS_MACRO_LOOKUP" }),
  pos("d3-cr02", "missing my childhood chocolate cereal so bad", "craving_cereal", { style: "indirect", docs: [CC], acc: [MC, FL], sec: [s(CC, "sensory-targets")] }),
  pos("d3-cr03", "can I just have a normal bowl of cereal and measure it?", "craving_cereal", { any: [CC, MC], acc: [FL], sec: [s(CC, "approach-a-a-measured-portion-of-the-real-cereal"), s(MC, "high-leverage-strategies")] }),
  pos("d3-cr04", "what if I sprinkle the sugary cereal over greek yoghurt", "craving_cereal", { style: "conversational", any: [CC, MC], acc: [TX], sec: [s(CC, "approach-b-real-cereal-as-topping"), s(MC, "high-leverage-strategies")] }),
  pos("d3-cr05", "thèm ăn ngũ cốc socola quá", "craving_cereal", { lang: "vi", style: "indirect", docs: [CC], acc: [MC, FL], unacc: [VN], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-cr06", "need ice cream after this week, no lie", "craving_ice_cream", { style: "slang", docs: [IC], acc: [FL, TX] }),
  pos("d3-cr07", "tub of Ben & Jerry's is staring at me", "craving_ice_cream", { style: "indirect", docs: [IC], acc: [FL] }),
  pos("d3-cr08", "can I have a proper small bowl of real ice cream on a cut", "craving_ice_cream", { docs: [IC], acc: [FL], sec: [s(IC, "real-ice-cream-planned"), s(FL, "preserve-preferred-foods-where-reasonable")] }),
  pos("d3-cr09", "is protein ice cream actually the same as the real thing?", "craving_ice_cream", { docs: [IC], sec: [s(IC, "honesty-about-substitutes")] }),
  pos("d3-cr10", "lighter frozen dessert that still feels like ice cream", "craving_ice_cream", { style: "fragment", docs: [IC], acc: [TX], sec: [s(IC, "higher-protein-or-lighter-alternatives"), s(TX, "cold-and-frozen-texture")] }),
  pos("d3-cr11", "muốn ăn một ly kem nhỏ sau bữa tối, được không?", "craving_ice_cream", { lang: "vi", docs: [IC], acc: [FL], unacc: [VN], sec: [s(IC, "real-ice-cream-planned")] }),
  pos("d3-cr12", "I want something sweet but no idea what exactly", "craving_general", { style: "indirect", any: [CV, FH, IC, CC], acc: [MC, FL], sec: [s(CV, "understand-the-craving"), s(CV, "identify-the-sensory-target"), s(FH, "sweetness")], contrast: "SWEET_VS_SAVORY" }),
  pos("d3-cr13", "need something salty to munch, chips vibe", "craving_general", { style: "slang", any: [FH, TX], acc: [FF, CV], sec: [s(FH, "salt"), s(TX, "crunch")], contrast: "SWEET_VS_SAVORY" }),
  pos("d3-cr14", "kinda want Milo cereal but trying to be good", "craving_cereal", { style: "conversational", docs: [CC], acc: [MC, FL] }),
  pos("d3-cr15", "use the cereal as a topping instead of the whole bowl?", "craving_cereal", { any: [CC, MC], sec: [s(CC, "approach-b-real-cereal-as-topping"), s(MC, "high-leverage-strategies")] }),

  // ===================== MAKEOVERS =====================
  pos("d3-mk01", "KFC tonight but I'm in a deficit, how do I not wreck it", "makeover_fried_chicken", { style: "conversational", any: [FC, FF], acc: [FL], sec: [s(FF, "ordering-strategy"), s(FF, "modify-low-value-calorie-sources"), s(FC, "main-calorie-drivers")], contrast: "GENERIC_VS_SPECIFIC_MAKEOVER", trap: "generic-doc" }),
  pos("d3-mk02", "how do I get crispy chicken at home without a deep fryer", "makeover_fried_chicken", { docs: [FC], acc: [TX], sec: [s(FC, "high-leverage-strategies"), s(TX, "crispness")], trap: "generic-doc" }),
  pos("d3-mk03", "what makes fried chicken so calorie heavy anyway", "makeover_fried_chicken", { docs: [FC], acc: [FF, FL], sec: [s(FC, "main-calorie-drivers")], trap: "section-metadata" }),
  pos("d3-mk04", "my oven chicken always comes out dry and tasteless", "makeover_fried_chicken", { style: "indirect", any: [FC, FH], acc: [TX], sec: [s(FC, "high-leverage-strategies"), s(FC, "sensory-targets"), s(FH, "seasoning-and-sauces")] }),
  pos("d3-mk05", "need that crunchy chicken fix fr", "makeover_fried_chicken", { style: "slang", docs: [FC], acc: [FF, TX, FL] }),
  pos("d3-mk06", "gà rán air fryer có giòn được không?", "makeover_fried_chicken", { lang: "mixed", docs: [FC], acc: [TX], unacc: [VN], sec: [s(FC, "high-leverage-strategies"), s(TX, "crispness")], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-mk07", "fried chicken keeps blowing my calorie budget, any way to keep it in", "makeover_fried_chicken", { docs: [FC], acc: [FL], contrast: "GENERIC_VS_SPECIFIC_MAKEOVER", trap: "generic-doc" }),
  pos("d3-mk08", "is it okay to eat fried chicken at all when dieting?", "fat_loss", { any: [FL, CB], acc: [FC], sec: [s(FL, "preserve-preferred-foods-where-reasonable"), s(CB, "flexible-food-choices")], contrast: "GENERIC_VS_SPECIFIC_MAKEOVER" }),
  pos("d3-mk09", "Maccas run tonight, what should I get to not blow my day", "makeover_fast_food", { style: "slang", docs: [FF], acc: [FL, FC], sec: [s(FF, "ordering-strategy")] }),
  pos("d3-mk10", "the drink and the fries are where it goes wrong, right?", "makeover_fast_food", { style: "conversational", docs: [FF], acc: [FL], sec: [s(FF, "modify-low-value-calorie-sources"), s(FF, "main-calorie-drivers")] }),
  pos("d3-mk11", "homemade burger makeover that doesn't feel fake", "makeover_fast_food", { style: "fragment", docs: [FF], acc: [FL], sec: [s(FF, "maintain-recognizable-identity"), s(FF, "preserve-high-value-sensory-features")], trap: "section-metadata" }),
  pos("d3-mk12", "what makes a takeaway burger meal so heavy", "makeover_fast_food", { docs: [FF], acc: [FL, FC], sec: [s(FF, "main-calorie-drivers")], trap: "section-metadata" }),
  pos("d3-mk13", "đi ăn McDonald's thì nên gọi gì cho đỡ béo", "makeover_fast_food", { lang: "vi", docs: [FF], acc: [FL], unacc: [VN], sec: [s(FF, "ordering-strategy")], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-mk14", "cereal leaves me starving by 10am, fix?", "makeover_cereal", { style: "messy", docs: [MC], acc: [CC, FL], sec: [s(MC, "add-protein-and-volume-only-when-useful"), s(MC, "modify-low-value-calorie-sources"), s(FL, "satiety-and-volume")] }),
  pos("d3-mk15", "want a breakfast that still feels like cereal but packs more protein", "makeover_cereal", { docs: [MC], acc: [CC], sec: [s(MC, "add-protein-and-volume-only-when-useful"), s(MC, "high-leverage-strategies")] }),
  pos("d3-mk16", "which part of cereal should I keep, the crunch or the sweetness?", "makeover_cereal", { any: [MC, CC], sec: [s(MC, "preserve-high-value-sensory-features"), s(MC, "identify-what-the-user-actually-wants"), s(CC, "sensory-targets")], trap: "section-metadata" }),
  pos("d3-mk17", "turn my usual burger order into something that fits a cut without losing the burger", "makeover_fast_food", { style: "paraphrase", docs: [FF], acc: [FL], sec: [s(FF, "maintain-recognizable-identity"), s(FF, "ordering-strategy")], contrast: "MAKEOVER_VS_SIMPLE_EDIT" }),
  pos("d3-mk18", "lighter breading ideas for chicken tenders", "makeover_fried_chicken", { style: "fragment", docs: [FC], acc: [TX], sec: [s(FC, "high-leverage-strategies"), s(FC, "useful-substitutions")] }),
  pos("d3-mk19", "grabbing a combo at the counter, which part do I cut first", "makeover_fast_food", { style: "conversational", docs: [FF], acc: [FL], sec: [s(FF, "modify-low-value-calorie-sources"), s(FF, "ordering-strategy")] }),
  pos("d3-mk20", "turned my cereal into yoghurt mush and it's not cereal anymore lol", "makeover_cereal", { style: "messy", docs: [MC], acc: [CC], sec: [s(MC, "maintain-recognizable-identity")], trap: "section-metadata" }),
  pos("d3-mk21", "if I mix a plain crunchy cereal with the sugary one does that help", "makeover_cereal", { style: "conversational", docs: [MC], acc: [CC, TX], sec: [s(MC, "high-leverage-strategies")] }),

  // ===================== CUISINES =====================
  pos("d3-cu01", "thinking pho or bun bo hue tonight, how do I keep it light-ish", "cuisine_vietnamese", { style: "conversational", docs: [VN], acc: [FL, FH], unacc: [HK], sec: [s(VN, "broth-based-dishes"), s(VN, "rice-and-noodles")], contrast: "HAWKER_VS_VIETNAMESE" }),
  pos("d3-cu02", "com tam with grilled pork, decent choice?", "cuisine_vietnamese", { style: "fragment", docs: [VN], acc: [FL], unacc: [HK], sec: [s(VN, "grilled-vs-fried-approaches"), s(VN, "protein-choices"), s(VN, "rice-and-noodles")] }),
  pos("d3-cu03", "nuoc cham is so good but I drown everything in it", "cuisine_vietnamese", { style: "conversational", docs: [VN], acc: [FH], sec: [s(VN, "dipping-and-dressing-sauces")] }),
  pos("d3-cu04", "what makes vietnamese food taste vietnamese", "cuisine_vietnamese", { docs: [VN], acc: [FH], sec: [s(VN, "flavor-architecture")] }),
  pos("d3-cu05", "loads of fresh herbs and lime, is that the trick with viet food?", "cuisine_vietnamese", { style: "conversational", docs: [VN], acc: [FH], sec: [s(VN, "herbs-acidity-and-heat"), s(VN, "flavor-architecture")], trap: "section-metadata" }),
  pos("d3-cu06", "tối nay ăn bún chả, làm sao cho nhẹ bụng hơn", "cuisine_vietnamese", { lang: "vi", docs: [VN], acc: [FL], unacc: [HK], sec: [s(VN, "rice-and-noodles"), s(VN, "grilled-vs-fried-approaches")] }),
  pos("d3-cu07", "bánh xèo giòn mà nhiều dầu quá, có version nào lighter không", "cuisine_vietnamese", { lang: "mixed", style: "messy", docs: [VN], acc: [TX, FL], unacc: [HK], sec: [s(VN, "grilled-vs-fried-approaches")] }),
  pos("d3-cu08", "chicken rice: steamed or roasted?", "cuisine_hawker", { style: "fragment", docs: [HK], acc: [FL, UP], unacc: [VN], sec: [s(HK, "common-dish-patterns"), s(HK, "protein-choice")], contrast: "CUISINE_VS_FOOD_ENTITY" }),
  pos("d3-cu09", "economy rice, how do I pick my dishes", "cuisine_hawker", { style: "conversational", docs: [HK], acc: [FL, UP], unacc: [VN], sec: [s(HK, "common-dish-patterns"), s(HK, "protein-choice")] }),
  pos("d3-cu10", "kopitiam breakfast that won't sink my cut", "cuisine_hawker", { style: "slang", docs: [HK], acc: [FL, UP], unacc: [VN] }),
  pos("d3-cu11", "fish soup or yong tau foo, which is lighter?", "cuisine_hawker", { docs: [HK], acc: [FL, UP], unacc: [VN], sec: [s(HK, "common-dish-patterns"), s(HK, "clear-soup-strategies"), s(HK, "broth-vs-fried-preparation")] }),
  pos("d3-cu12", "nasi lemak craving, how do I make it work", "cuisine_hawker", { docs: [HK], acc: [FL], unacc: [VN], sec: [s(HK, "common-dish-patterns")], reasons: ["CUISINE", "CRAVING"] }),
  pos("d3-cu13", "portion sizes at hawker stalls are all over the place, how do I estimate", "cuisine_hawker", { docs: [HK], acc: [UP], sec: [s(HK, "rice-and-noodle-portion-uncertainty"), s(HK, "high-variability-in-oil-and-serving-size"), s(HK, "range-based-reasoning"), s(UP, "restaurant-and-hawker-uncertainty"), s(UP, "portion-uncertainty")] }),
  pos("d3-cu14", "mee goreng hay char kway teow, cái nào đỡ dầu hơn", "cuisine_hawker", { lang: "mixed", docs: [HK], acc: [FL], unacc: [VN], sec: [s(HK, "common-dish-patterns"), s(HK, "high-variability-in-oil-and-serving-size")] }),
  pos("d3-cu15", "pho or laksa for dinner?", "cuisine_mixed", { style: "fragment", docs: [VN, HK], acc: [FL], contrast: "HAWKER_VS_VIETNAMESE" }),
  pos("d3-cu16", "laksa tonight, any tips", "cuisine_hawker", { style: "fragment", docs: [HK], acc: [FL], unacc: [VN], sec: [s(HK, "common-dish-patterns"), s(HK, "sauce-and-gravy-variability")], contrast: "HAWKER_VS_VIETNAMESE" }),
  pos("d3-cu17", "vietnamese stall at the hawker centre near me, which dish is a good pick", "cuisine_mixed", { style: "conversational", docs: [VN], acc: [HK, FL], contrast: "HAWKER_VS_VIETNAMESE" }),
  pos("d3-cu18", "which proteins work best in vietnamese dishes if I want lean", "cuisine_vietnamese", { docs: [VN], acc: [FL], unacc: [HK], sec: [s(VN, "protein-choices")] }),
  pos("d3-cu19", "char kway teow seems so oily, is every stall like that", "cuisine_hawker", { style: "conversational", docs: [HK], acc: [UP], unacc: [VN], sec: [s(HK, "high-variability-in-oil-and-serving-size"), s(HK, "common-dish-patterns"), s(UP, "restaurant-and-hawker-uncertainty")] }),
  pos("d3-cu20", "sambal and gravy on everything, how do I keep that in check at the stalls", "cuisine_hawker", { docs: [HK], unacc: [VN], sec: [s(HK, "sauce-and-gravy-variability")], trap: "section-metadata" }),
  pos("d3-cu21", "near office got a food centre, usually what's lighter to order", "cuisine_hawker", { style: "messy", docs: [HK], acc: [FL, UP], unacc: [VN] }),

  // ===================== FAT LOSS / GENERAL =====================
  pos("d3-fx01", "what actually matters most when trying to lose fat", "fat_loss", { docs: [FL], acc: [CB], sec: [s(FL, "high-leverage-substitutions"), s(FL, "calorie-budget-awareness")], contrast: "FAT_LOSS_VS_GENERAL" }),
  pos("d3-fx02", "lost weight but feel like I'm losing muscle too, what do I change food-wise", "fat_loss", { style: "conversational", docs: [FL], acc: [CB, MG], sec: [s(FL, "protein-preservation"), s(CB, "protein-priority")] }),
  pos("d3-fx03", "is it bad to skip dinner to save calories", "fat_loss", { docs: [FL], acc: [CB], sec: [s(FL, "avoid-unnecessary-restriction")] }),
  pos("d3-fx04", "ate a whole pizza last night, should I fast today to make up for it", "fat_loss", { style: "conversational", any: [FL, CS], acc: [CB, FF], sec: [s(FL, "handling-an-indulgent-meal"), s(CS, "no-shaming-and-no-punishment")] }),
  pos("d3-fx05", "which change gives the most bang for buck on a cut", "fat_loss", { style: "slang", docs: [FL], sec: [s(FL, "high-leverage-substitutions")] }),
  pos("d3-fx06", "đang giảm mỡ thì ăn tối sao cho no lâu", "fat_loss", { lang: "vi", docs: [FL], acc: [CB, TX], unacc: [VN], sec: [s(FL, "satiety-and-volume"), s(CB, "satiety-and-volume")], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-fx07", "what goes into a balanced meal, generally", "principles", { docs: [CB], acc: [FL], sec: [s(CB, "meal-composition")], contrast: "FAT_LOSS_VS_GENERAL" }),
  pos("d3-fx08", "I love my nightly chocolate, do I have to drop it to lean out", "fat_loss", { style: "conversational", docs: [FL], acc: [CB], sec: [s(FL, "preserve-preferred-foods-where-reasonable"), s(CB, "flexible-food-choices")] }),

  // ===================== MUSCLE GAIN =====================
  pos("d3-mg01", "can't eat enough to grow, I'm always full", "muscle_gain", { style: "indirect", docs: [MG], sec: [s(MG, "practical-meal-density"), s(MG, "sufficient-energy-availability")] }),
  pos("d3-mg02", "is one big protein dinner enough or should I spread it out", "muscle_gain", { docs: [MG], acc: [CB], sec: [s(MG, "protein-consistency"), s(CB, "protein-priority")] }),
  pos("d3-mg03", "what should I eat before lifting", "muscle_gain", { any: [MG, CB], sec: [s(MG, "performance-supportive-meal-structure"), s(CB, "performance-considerations")] }),
  pos("d3-mg04", "rice and noodles while bulking: friend or foe?", "muscle_gain", { docs: [MG], acc: [CB], unacc: [HK, VN], sec: [s(MG, "useful-carbohydrate-inclusion")], contrast: "CUISINE_VS_FOOD_ENTITY" }),
  pos("d3-mg05", "my gains stalled, is it a food thing?", "muscle_gain", { style: "indirect", docs: [MG], sec: [s(MG, "sufficient-energy-availability")] }),
  pos("d3-mg06", "đang bulk mà lười ăn quá, có mẹo gì không", "muscle_gain", { lang: "mixed", docs: [MG], unacc: [VN], sec: [s(MG, "practical-meal-density"), s(MG, "adherence"), s(MG, "sufficient-energy-availability")], contrast: "LANGUAGE_VS_CUISINE" }),
  pos("d3-mg07", "lean bulk keeps falling apart cause I hate the food", "muscle_gain", { style: "slang", docs: [MG], acc: [FH], sec: [s(MG, "adherence")] }),

  // ===================== COACHING / UNCERTAINTY / PRINCIPLES =====================
  pos("d3-co01", "I feel like such a failure after last night's binge", "coaching", { style: "indirect", docs: [CS], acc: [FL], sec: [s(CS, "no-shaming-and-no-punishment"), s(FL, "handling-an-indulgent-meal")] }),
  pos("d3-co02", "is it bad that I call foods good and bad?", "coaching", { any: [CB, CS], sec: [s(CB, "avoiding-food-moralisation"), s(CS, "non-judgmental-food-neutral-language")] }),
  pos("d3-co03", "I know it's not the best pick but I really want the burger", "coaching", { style: "conversational", any: [CS, FF], acc: [FL], sec: [s(CS, "user-autonomy"), s(CS, "realistic-trade-offs"), s(FF, "ordering-strategy")], reasons: ["COACHING", "CRAVING", "FOOD_MAKEOVER", "GENERAL_NUTRITION"] }),
  pos("d3-up01", "I guessed my lunch portion, how off could the numbers be", "uncertainty", { style: "conversational", docs: [UP], sec: [s(UP, "portion-uncertainty"), s(UP, "user-recalled-food-uncertainty"), s(UP, "when-to-give-ranges")] }),
  pos("d3-up02", "should I trust an app's estimate or the brand's own label", "uncertainty", { docs: [UP], sec: [s(UP, "verified-fact-vs-estimate-vs-inference")] }),
  pos("d3-up03", "why do you keep giving me ranges instead of one number", "uncertainty", { docs: [UP], acc: [HK], sec: [s(UP, "when-to-give-ranges"), s(HK, "range-based-reasoning")] }),
  pos("d3-pr01", "do I need protein at every single meal", "principles", { any: [CB, MG], sec: [s(CB, "protein-priority"), s(MG, "protein-consistency")] }),
  pos("d3-pr02", "are there foods I should never eat", "principles", { docs: [CB], acc: [FL], sec: [s(CB, "flexible-food-choices")] }),

  // ===================== NEGATIVES (deterministic tools / state / no strategy) =====================
  neg("d3-n01", "calories remaining today?"),
  neg("d3-n02", "show the ingredients again"),
  neg("d3-n03", "cut the rice down by 20g", { contrast: "MAKEOVER_VS_SIMPLE_EDIT" }),
  neg("d3-n04", "log it", { style: "fragment" }),
  neg("d3-n05", "protein content of the tuna?"),
  neg("d3-n06", "make it 350 calories", { contrast: "MAKEOVER_VS_SIMPLE_EDIT" }),
  neg("d3-n07", "and in grams?", { style: "fragment" }),
  neg("d3-n08", "which option did I pick?"),
  neg("d3-n09", "undo that proposal"),
  neg("d3-n10", "greek yoghurt is disgusting to me", { style: "indirect" }),
  neg("d3-n11", "replace the tofu with prawns", { contrast: "MAKEOVER_VS_SIMPLE_EDIT" }),
  neg("d3-n12", "remind me my carb goal for today"),
  neg("d3-n13", "which of these two meals has more protein?"),
  neg("d3-n14", "is this meal okay for my macros?", { style: "indirect" }),
  neg("d3-n15", "how many kcal in a bowl of laksa?", { contrast: "CRAVING_VS_MACRO_LOOKUP" }),
  neg("d3-n16", "calories in a Big Mac?", { style: "fragment", contrast: "CRAVING_VS_MACRO_LOOKUP" }),
  neg("d3-n17", "log my pho from lunch"),
  neg("d3-n18", "add crunchy peanuts to it", { contrast: "MAKEOVER_VS_SIMPLE_EDIT" }),
  neg("d3-n19", "swap the bun for lettuce", { contrast: "MAKEOVER_VS_SIMPLE_EDIT" }),
  neg("d3-n20", "allergic to shellfish btw", { style: "slang" }),
  neg("d3-n21", "thanks bro", { style: "slang" }),
  neg("d3-n22", "yep go ahead and build that", { style: "fragment" }),
  neg("d3-n23", "xóa trứng ra khỏi món", { lang: "vi" }),
  neg("d3-n24", "ghi lại bữa trưa giúp mình", { lang: "vi" }),
  neg("d3-n25", "add thêm 50g cơm", { lang: "mixed", style: "messy" }),
  neg("d3-n26", "đang bulk, mỗi bữa cần bao nhiêu protein?", { lang: "mixed" }),
  neg("d3-n27", "and the carbs?", { style: "followup" }),
  neg("d3-n28", "I'm vegetarian now"),
  neg("d3-n29", "cool, save that", { style: "slang" }),
  neg("d3-n30", "double the portion"),
]

const KEEP = "A_DIVERSITY_KEEP" as const
const HELP = "A_DIVERSITY_HELP" as const
const META = "B_METADATA_BROADCAST" as const
const LEX = "C_LEXICAL_EVIDENCE" as const
const CANON = "D_CANONICALISATION" as const

/** v3.1 hypothesis probes (written from the corpus text before any v3.1 retrieval output was seen). */
export const PROBES_V31_DEV: V3Case[] = [
  // A — a second sibling is genuinely useful; the gold section must still win and the sibling should survive
  pos("d3-p01", "brine or yoghurt marinade so the breast doesn't dry out", "makeover_fried_chicken", { docs: [FC], acc: [TX, FH], sec: [s(FC, "high-leverage-strategies")], sib: [s(FC, "useful-substitutions")], contrast: "SIBLING_SECTIONS", hyp: [KEEP, META] }),
  pos("d3-p02", "crushed cereal as the coating, good shout?", "makeover_fried_chicken", { style: "slang", docs: [FC], acc: [TX], unacc: [CC], sec: [s(FC, "useful-substitutions")], sib: [s(FC, "high-leverage-strategies")], contrast: "METADATA_VS_LOCAL", hyp: [KEEP, META] }),
  pos("d3-p03", "eating it slowly from a bowl instead of straight from the tub", "craving_ice_cream", { style: "followup", docs: [IC], acc: [FL], sec: [s(IC, "real-ice-cream-planned")], sib: [s(IC, "sensory-targets")], topic: { type: "CRAVING", food: "ice cream" }, contrast: "SIBLING_SECTIONS", hyp: [KEEP, META] }),
  pos("d3-p04", "pho with fewer noodles and more beef but the same broth", "cuisine_vietnamese", { docs: [VN], acc: [FL], unacc: [HK], sec: [s(VN, "broth-based-dishes")], sib: [s(VN, "rice-and-noodles"), s(VN, "protein-choices")], contrast: "SIBLING_SECTIONS", hyp: [KEEP] }),
  pos("d3-p05", "lemon or vinegar first, before reaching for more salt?", "flavor", { docs: [FH], sec: [s(FH, "acidity")], sib: [s(FH, "salt")], contrast: "SIBLING_SECTIONS", hyp: [KEEP, META] }),
  pos("d3-p06", "protein spread over the day, or one big shake after the gym?", "muscle_gain", { docs: [MG], acc: [CB], sec: [s(MG, "protein-consistency")], sib: [s(MG, "performance-supportive-meal-structure")], contrast: "SIBLING_SECTIONS", hyp: [KEEP] }),
  pos("d3-p07", "curry noodles: is it the gravy or the noodles doing the damage", "cuisine_hawker", { docs: [HK], acc: [FL, UP], unacc: [VN], sec: [s(HK, "common-dish-patterns")], sib: [s(HK, "sauce-and-gravy-variability"), s(HK, "rice-and-noodle-portion-uncertainty")], contrast: "SIBLING_SECTIONS", hyp: [KEEP] }),
  pos("d3-p08", "the base is what makes it cold and creamy, can I change that part freely", "makeover_cereal", { style: "followup", docs: [MC], acc: [CC], sec: [s(MC, "preserve-high-value-sensory-features")], sib: [s(MC, "modify-low-value-calorie-sources")], topic: { type: "FOOD", food: "cereal" }, contrast: "CANONICAL_COLLAPSE", hyp: [KEEP, META, CANON] }),
  // A — two different documents are both required (diversity should help)
  pos("d3-p09", "cereal craving tonight but my protein is way under today", "craving_cereal", { docs: [CC, MC], acc: [FL], sec: [s(CC, "approach-b-real-cereal-as-topping"), s(MC, "add-protein-and-volume-only-when-useful")], contrast: "DIVERSITY_HELP", hyp: [HELP] }),
  pos("d3-p10", "hawker dinner while bulking, how do I get enough in", "cuisine_hawker", { docs: [HK, MG], acc: [UP], unacc: [VN], sec: [s(MG, "practical-meal-density"), s(MG, "sufficient-energy-availability"), s(HK, "protein-choice")], contrast: "DIVERSITY_HELP", reasons: ["CUISINE", "STRATEGY"], hyp: [HELP] }),
  pos("d3-p11", "vietnamese food on a cut: do the herbs and dipping sauce stay?", "cuisine_vietnamese", { docs: [VN, FL], unacc: [HK], sec: [s(VN, "herbs-acidity-and-heat"), s(VN, "dipping-and-dressing-sauces"), s(FL, "preserve-preferred-foods-where-reasonable")], contrast: "DIVERSITY_HELP", reasons: ["CUISINE", "STRATEGY"], hyp: [HELP] }),
  pos("d3-p12", "fried chicken that comes out crisp and actually seasoned properly", "makeover_fried_chicken", { docs: [FC], any: [TX, FH], sec: [s(FC, "high-leverage-strategies"), s(TX, "crispness"), s(FH, "seasoning-and-sauces")], contrast: "DIVERSITY_HELP", hyp: [HELP] }),
  // B — only section-local heading/body evidence separates the gold section from siblings sharing the same frontmatter
  pos("d3-p13", "my tray was too crowded and everything steamed instead of browning", "texture", { style: "indirect", docs: [TX], acc: [FC], sec: [s(TX, "crispness")], contrast: "METADATA_VS_LOCAL", hyp: [META, LEX] }),
  pos("d3-p14", "season in layers or all at the end?", "flavor", { style: "fragment", docs: [FH], sec: [s(FH, "salt")], contrast: "METADATA_VS_LOCAL", hyp: [META, LEX] }),
  pos("d3-p15", "does the milk count for much or is it mostly the cereal", "makeover_cereal", { style: "conversational", docs: [MC], acc: [CC, FL], sec: [s(MC, "main-calorie-drivers")], contrast: "METADATA_VS_LOCAL", hyp: [META] }),
  pos("d3-p16", "toasted bun and that salty edge are what make it for me", "makeover_fast_food", { style: "followup", docs: [FF], acc: [FL], sec: [s(FF, "preserve-high-value-sensory-features")], topic: { type: "FOOD", food: "burger" }, contrast: "METADATA_VS_LOCAL", hyp: [META, LEX] }),
  pos("d3-p17", "the chicken rice auntie asked if I wanted less rice, does it make much difference", "cuisine_hawker", { style: "conversational", docs: [HK], acc: [UP, FL], unacc: [VN], sec: [s(HK, "rice-and-noodle-portion-uncertainty"), s(HK, "common-dish-patterns")], contrast: "METADATA_VS_LOCAL", hyp: [META] }),
  pos("d3-p18", "lemongrass grilled pork or the fried spring rolls", "cuisine_vietnamese", { style: "fragment", docs: [VN], acc: [FH, FL], unacc: [HK], sec: [s(VN, "grilled-vs-fried-approaches")], contrast: "METADATA_VS_LOCAL", hyp: [META] }),
  pos("d3-p19", "extra cardio tomorrow to burn off tonight's dessert?", "fat_loss", { docs: [FL], acc: [CS], unacc: [IC], sec: [s(FL, "handling-an-indulgent-meal")], contrast: "CANONICAL_COLLAPSE", hyp: [META, CANON] }),
  pos("d3-p20", "is that number from a database or your guess?", "uncertainty", { style: "conversational", docs: [UP], sec: [s(UP, "verified-fact-vs-estimate-vs-inference")], contrast: "METADATA_VS_LOCAL", hyp: [META, LEX] }),
  // C — terse, indirect, one incidental corpus word, out-of-vocabulary terms, messy phrasing
  pos("d3-p21", "soggy again.", "texture", { style: "fragment", docs: [TX], acc: [FC], sec: [s(TX, "crispness")], hyp: [LEX] }),
  pos("d3-p22", "the portion looked tiny on the plate", "texture", { style: "indirect", any: [TX, FL, CB], unacc: [UP], sec: [s(TX, "volume"), s(FL, "satiety-and-volume"), s(CB, "satiety-and-volume")], hyp: [LEX] }),
  pos("d3-p23", "sotong kangkong with extra sambal belacan, steady or not", "cuisine_hawker", { style: "slang", docs: [HK], acc: [FL, UP], unacc: [VN], sec: [s(HK, "sauce-and-gravy-variability")], hyp: [LEX] }),
  pos("d3-p24", "Chickenjoy bucket with gravy tonight, damage control pls", "makeover_fried_chicken", { style: "slang", any: [FC, FF], acc: [FL], sec: [s(FF, "ordering-strategy"), s(FF, "modify-low-value-calorie-sources"), s(FC, "main-calorie-drivers")], hyp: [LEX] }),
  pos("d3-p25", "my rice bowl lunch needs something, not sure what", "flavor", { style: "indirect", any: [FH, TX], unacc: [HK, VN], hyp: [LEX] }),
  pos("d3-p26", "ok so like i love crispy stuff but my oven does NOT do crispy, help", "texture", { style: "messy", docs: [TX], acc: [FC], sec: [s(TX, "crispness")], contrast: "CRUNCH_VS_CRISPNESS", hyp: [LEX, CANON] }),
  // D — the original wording matters more than the shared canonical concept
  pos("d3-p27", "too hot out to cook, want something refreshing", "texture", { style: "indirect", any: [TX, IC], sec: [s(TX, "cold-and-frozen-texture"), s(IC, "higher-protein-or-lighter-alternatives")], contrast: "CANONICAL_COLLAPSE", hyp: [CANON] }),
  pos("d3-p28", "more chew than crunch please", "texture", { style: "fragment", docs: [TX], sec: [s(TX, "chew")], contrast: "CANONICAL_COLLAPSE", hyp: [CANON, LEX] }),
  pos("d3-p29", "unsweetened cocoa in my oats tastes harsh", "flavor", { docs: [FH], unacc: [CC], sec: [s(FH, "bitterness")], sib: [s(FH, "sweetness")], contrast: "CANONICAL_COLLAPSE", hyp: [CANON, META, KEEP] }),
  pos("d3-p30", "freezing my yoghurt makes it taste less sweet, why", "texture", { docs: [TX], acc: [IC, FH], sec: [s(TX, "cold-and-frozen-texture")], contrast: "CANONICAL_COLLAPSE", hyp: [CANON, META] }),
  pos("d3-p31", "how do I get a crisp outside on baked tofu", "texture", { docs: [TX], acc: [FC], sec: [s(TX, "crispness")], contrast: "CRUNCH_VS_CRISPNESS", hyp: [CANON] }),
  pos("d3-p32", "need something crunchy to sprinkle on my soup", "texture", { docs: [TX], sec: [s(TX, "crunch")], sib: [s(TX, "contrast")], contrast: "CRUNCH_VS_CRISPNESS", hyp: [CANON, KEEP] }),
  // strong negatives missing from v3.0: option selection, revert
  neg("d3-n31", "go with option 2", { style: "fragment" }),
  neg("d3-n32", "revert it to the original version"),
]

export const CASES_V3_DEV: V3Case[] = [...CASES_V30_DEV, ...PROBES_V31_DEV]
