import type { NutritionIntent } from "../../../coach/conversation"

/**
 * nutrition-retrieval-eval-v2 (N1.6.3-R1).
 *
 * Written from the corpus headings (knowledge/nutrition/**) and the product's
 * own gate contract BEFORE any v2 retrieval output was looked at, then split
 * ~70/30 by id prefix (`d2-` dev, `h2-` held-out). The held-out set is FROZEN:
 * no alias, regex, weight, threshold or prompt may be adjusted after looking at
 * its failures. If a later iteration needs new cases, add `nutrition-retrieval-
 * eval-v3` — never edit this file's held-out rows.
 * (One held-out row, an exact duplicate of v1 h-7, was removed before any v2 held-out tuning decision was made; it is still
 * counted in v1.)
 *
 * Held-out rows are deliberately lexically different from dev rows (dev
 * "Can we give this more bite?" / held-out "I want more snap in this"), and
 * negatives include near-misses that share food/macro vocabulary with
 * positives but need no knowledge.
 *
 * v1 (cases.ts) stays as the historical N1.6.3 set and is still run unchanged.
 */
export const EVAL_VERSION = "nutrition-retrieval-eval-v2"

export type EvalTag = "direct" | "indirect" | "messy" | "bilingual" | "negative" | "near-miss"

export type EvalCaseV2 = {
  id: string
  split: "dev" | "heldout"
  message: string
  tag: EvalTag
  intent?: NutritionIntent
  /** Should knowledge be retrieved for this message at all? */
  gate: boolean
  /** Mandatory documents: each must appear among the first 3 distinct documents retrieved. */
  docs?: string[]
  /** Documents that are fine alongside the mandatory ones. Anything else in the top 3 is a wrong document. */
  acceptable?: string[]
  /** Expected section (heading slug) inside a document. */
  section?: { doc: string; heading: string }
}

const G = ["core.basics", "coaching.craving_conversation", "coaching.coaching_style"]
const FL = "goal.fat_loss"
const MG = "goal.muscle_gain"
const TX = "flavor_texture.texture_hacks"
const FH = "flavor_texture.flavor_hacks"
const HK = "cuisine.singapore_hawker"
const VN = "cuisine.vietnamese"
const CC = "craving.cereal"
const IC = "craving.ice_cream"
const MC = "food_makeovers.cereal"
const FF = "food_makeovers.fast_food"
const FC = "food_makeovers.fried_chicken"
const UP = "core.uncertainty_provenance"

type Opts = { docs?: string[]; acc?: string[]; sec?: [string, string]; tag?: EvalTag; intent?: NutritionIntent }
const pos = (id: string, message: string, o: Opts = {}): EvalCaseV2 => ({
  id,
  split: id.startsWith("h2-") ? "heldout" : "dev",
  message,
  tag: o.tag ?? "direct",
  gate: true,
  ...(o.intent ? { intent: o.intent } : {}),
  ...(o.docs ? { docs: o.docs } : {}),
  acceptable: [...(o.acc ?? []), ...G],
  ...(o.sec ? { section: { doc: o.sec[0], heading: o.sec[1] } } : {}),
})
const neg = (id: string, message: string, tag: EvalTag = "negative"): EvalCaseV2 => ({ id, split: id.startsWith("h2-") ? "heldout" : "dev", message, tag, gate: false })

export const CASES_V2: EvalCaseV2[] = [
  // ================= DEV · positives =================
  pos("d2-p01", "Can we give this more bite?", { tag: "indirect", docs: [TX], acc: [FH, FC], sec: [TX, "crunch"] }),
  pos("d2-p02", "The texture is boring.", { tag: "indirect", docs: [TX], acc: [FH] }),
  pos("d2-p03", "This tastes kind of flat.", { tag: "indirect", docs: [FH], acc: [TX] }),
  pos("d2-p04", "How do I make this less bland?", { tag: "indirect", docs: [FH], acc: [TX] }),
  pos("d2-p05", "This is missing something.", { tag: "indirect", docs: [FH], acc: [TX] }),
  pos("d2-p06", "I want something that feels more satisfying.", { tag: "indirect", acc: [FL, TX, "core.basics"] }),
  pos("d2-p07", "I'm craving fried chicken.", { docs: [FC], acc: [FF, FL] }),
  pos("d2-p08", "I'm craving chocolate cereal for breakfast.", { docs: [CC], acc: [MC, FL] }),
  pos("d2-p09", "ice cream is calling my name", { tag: "indirect", docs: [IC], acc: [FL, TX] }),
  pos("d2-p10", "What should I order at a hawker centre?", { docs: [HK], acc: [FL, UP] }),
  pos("d2-p11", "I want Vietnamese food.", { docs: [VN], acc: [FL, FH] }),
  pos("d2-p12", "Bring on the pho tonight.", { tag: "indirect", docs: [VN], acc: [FL, FH] }),
  pos("d2-p13", "Banh mi or bun cha for dinner, thoughts?", { tag: "indirect", docs: [VN], acc: [FL, FH] }),
  pos("d2-p14", "What's the smart pick at a food court?", { tag: "indirect", docs: [HK], acc: [FL, UP] }),
  pos("d2-p15", "How do I make a burger less of a calorie bomb?", { tag: "indirect", docs: [FF], acc: [FL, FC] }),
  pos("d2-p16", "Drive-thru dinner but I'm in a deficit.", { tag: "indirect", docs: [FF, FL], acc: [FC] }),
  pos("d2-p17", "How can I make fried chicken lighter?", { docs: [FC], acc: [FL, FF, TX], sec: [FC, "high-leverage-strategies"] }),
  pos("d2-p18", "Is cereal okay while cutting?", { docs: [FL], acc: [CC, MC] }),
  pos("d2-p19", "How do I eat enough to gain muscle?", { docs: [MG] }),
  pos("d2-p20", "Lean bulk meal ideas: what's the structure?", { docs: [MG], sec: [MG, "practical-meal-density"] }),
  pos("d2-p21", "How should I handle protein in a deficit?", { docs: [FL], sec: [FL, "protein-preservation"] }),
  pos("d2-p22", "How do I stop feeling like I failed after pizza night?", { tag: "indirect", docs: ["coaching.coaching_style"], acc: [FL, FF], sec: ["coaching.coaching_style", "no-shaming-and-no-punishment"] }),
  pos("d2-p23", "I keep bingeing at night.", { tag: "indirect", docs: ["coaching.coaching_style"], acc: [FL] }),
  pos("d2-p24", "I want something salty and crispy.", { docs: [TX], acc: [FH, FF, FC, MC], sec: [TX, "crispness"] }),
  pos("d2-p25", "How can I add some heat?", { docs: [FH], sec: [FH, "spice-and-heat"] }),
  pos("d2-p26", "It needs more tang.", { tag: "indirect", docs: [FH], sec: [FH, "acidity"] }),
  pos("d2-p27", "Give me something creamy and cold.", { docs: [TX], acc: [IC, MC], sec: [TX, "cold-and-frozen-texture"] }),
  pos("d2-p28", "I want it chewier.", { tag: "indirect", docs: [TX], sec: [TX, "chew"] }),
  pos("d2-p29", "How do I add savoury depth to a broth?", { docs: [FH], acc: [VN], sec: [FH, "umami"] }),
  pos("d2-p30", "Fresh herb ideas to brighten up this dish?", { tag: "indirect", docs: [FH], acc: [VN], sec: [FH, "aromatics-and-herbs"] }),
  pos("d2-p31", "How do I deal with oily gravy at a hawker stall?", { docs: [HK], acc: [FL], sec: [HK, "sauce-and-gravy-variability"] }),
  pos("d2-p32", "Soup noodles or fried noodles at the hawker centre, which is smarter?", { docs: [HK], acc: [FL, VN], sec: [HK, "broth-vs-fried-preparation"] }),
  pos("d2-p33", "What about dipping sauces in Vietnamese food?", { docs: [VN], acc: [FH], sec: [VN, "dipping-and-dressing-sauces"] }),
  pos("d2-p34", "Are calorie numbers for restaurant dishes accurate?", { docs: [UP], acc: [HK], sec: [UP, "restaurant-and-hawker-uncertainty"] }),
  pos("d2-p35", "After a huge dinner out, how do I get back on track?", { tag: "indirect", docs: [FL], acc: ["coaching.coaching_style"], sec: [FL, "handling-an-indulgent-meal"] }),
  pos("d2-p36", "How do I order at a drive-thru without wrecking my macros?", { docs: [FF], acc: [FL], sec: [FF, "ordering-strategy"] }),
  pos("d2-p37", "What's a smarter way to eat cereal?", { tag: "indirect", docs: [MC], acc: [CC, FL] }),
  pos("d2-p38", "Want something cold and sweet.", { tag: "indirect", docs: [IC], acc: [CC, MC, TX, FL] }),
  pos("d2-p39", "My meal prep feels dull, how do I make it exciting?", { tag: "indirect", docs: [FH], acc: [TX] }),
  pos("d2-p40", "I need a sweet fix that fits my day.", { tag: "indirect", acc: [CC, IC, MC, FL] }),
  pos("d2-p41", "ngl craving sum fried chicken rn", { tag: "messy", docs: [FC], acc: [FF, FL] }),
  pos("d2-p42", "pizza?? feeling guilty ngl", { tag: "messy", docs: ["coaching.coaching_style"], acc: [FF, FL] }),
  pos("d2-p43", "wat shud i eat at hawker", { tag: "messy", docs: [HK], acc: [FL, UP] }),
  pos("d2-p44", "pho tonite but staying lean", { tag: "messy", docs: [VN], acc: [FL, FH] }),
  pos("d2-p45", "can we make it crispier", { tag: "messy", docs: [TX], acc: [FH, FC], sec: [TX, "crispness"] }),
  pos("d2-p46", "Why is satiety so hard on a cut? I'm always hungry.", { tag: "indirect", docs: [FL], acc: ["core.basics"], sec: [FL, "satiety-and-volume"] }),
  pos("d2-p47", "How do I fit rice at a hawker stall without guessing the portion?", { docs: [HK], acc: [FL, UP], sec: [HK, "rice-and-noodle-portion-uncertainty"] }),
  pos("d2-p48", "What carbs should I lean on when bulking?", { docs: [MG], sec: [MG, "useful-carbohydrate-inclusion"] }),
  pos("d2-p49", "Any fresh, herby Vietnamese noodle soup tips?", { docs: [VN], acc: [FH], sec: [VN, "broth-based-dishes"] }),
  pos("d2-p50", "Can I keep real ice cream in my plan?", { docs: [IC], acc: [FL], sec: [IC, "real-ice-cream-planned"] }),
  pos("d2-p51", "How do I make my cereal bowl more filling without ruining it?", { docs: [MC], acc: [CC, FL, "core.basics"] }),
  pos("d2-p52", "Is chicken with grilled meats the better pick in Vietnamese food?", { tag: "indirect", docs: [VN], acc: [FL], sec: [VN, "grilled-vs-fried-approaches"] }),
  pos("d2-p53", "How can I make this taste sweeter without adding sugar?", { docs: [FH], sec: [FH, "sweetness"] }),
  pos("d2-p54", "These greens are really bitter, how do I fix that?", { docs: [FH], sec: [FH, "bitterness"] }),
  pos("d2-p55", "Is there a smart way to add more salt to the dish?", { docs: [FH], sec: [FH, "salt"] }),
  pos("d2-p56", "Do I really have to eat above maintenance to build muscle?", { tag: "indirect", docs: [MG], sec: [MG, "sufficient-energy-availability"] }),
  pos("d2-p57", "How consistent should my protein be across the day on a bulk?", { docs: [MG], sec: [MG, "protein-consistency"] }),
  pos("d2-p58", "How do I mix textures in one bowl so it's not one-dimensional?", { tag: "indirect", docs: [TX], sec: [TX, "contrast"] }),
  // bilingual / mixed (retrieval is ASCII English only: Vietnamese-only rows can reach a document only through the Layer-2 closed-vocabulary facets)
  pos("d2-v01", "Tôi muốn ăn món Việt tối nay.", { tag: "bilingual", docs: [VN], acc: [FL, FH] }),
  pos("d2-v02", "Thèm kem quá.", { tag: "bilingual", docs: [IC], acc: [FL, TX] }),
  pos("d2-v03", "Món này nhạt quá, thêm vị gì đây?", { tag: "bilingual", docs: [FH], acc: [TX] }),

  // ================= DEV · negatives (deterministic tools / state answer these) =================
  neg("d2-n01", "How many calories do I have left?"),
  neg("d2-n02", "Show me the macros."),
  neg("d2-n03", "Remove the rice."),
  neg("d2-n04", "Log this meal."),
  neg("d2-n05", "Make this under 400 calories."),
  neg("d2-n06", "How much protein is in this?"),
  neg("d2-n07", "I hate Greek yogurt."),
  neg("d2-n08", "Is this 400 calories?", "near-miss"),
  neg("d2-n09", "Make it cheaper.", "near-miss"),
  neg("d2-n10", "Add chicken.", "near-miss"),
  neg("d2-n11", "How many grams of rice?", "near-miss"),
  neg("d2-n12", "What did I eat earlier?", "near-miss"),
  neg("d2-n14", "Swap rice for noodles.", "near-miss"),
  neg("d2-n15", "What's my protein target?", "near-miss"),
  neg("d2-n16", "Why this one?", "near-miss"),
  neg("d2-n17", "detailed ingredients", "near-miss"),
  neg("d2-n20", "Give me a 600 kcal lunch with chicken and rice.", "near-miss"),
  neg("d2-n21", "Add an egg.", "near-miss"),
  neg("d2-n22", "I'm allergic to peanuts.", "near-miss"),
  neg("d2-n25", "Can I get more protein in this?", "near-miss"),
  neg("d2-n26", "Make it vegetarian.", "near-miss"),
  neg("d2-n27", "ok save it", "messy"),
  neg("d2-n28", "wat r my macros rn", "messy"),
  neg("d2-n30", "Còn bao nhiêu calo hôm nay?", "bilingual"),
  neg("d2-n31", "Xoá cơm đi.", "bilingual"),

  // ================= HELD-OUT · positives (lexically unlike dev) =================
  pos("h2-p01", "I want more snap in this.", { tag: "indirect", docs: [TX], acc: [FH, FC], sec: [TX, "crunch"] }),
  pos("h2-p02", "It feels kinda one-note, lacks depth.", { tag: "indirect", docs: [FH], acc: [TX] }),
  pos("h2-p03", "Honestly the mouthfeel is dull.", { tag: "indirect", docs: [TX], acc: [FH] }),
  pos("h2-p04", "Something velvety would hit the spot.", { tag: "indirect", docs: [TX], acc: [IC, MC], sec: [TX, "creaminess"] }),
  pos("h2-p05", "It needs to taste sharper and brighter.", { tag: "indirect", docs: [FH], sec: [FH, "acidity"] }),
  pos("h2-p06", "Thinking laksa or Hainanese chicken rice tonight.", { tag: "indirect", docs: [HK], acc: [FL, UP] }),
  pos("h2-p07", "I could murder some wings right now.", { tag: "indirect", docs: [FC], acc: [FF, FL] }),
  pos("h2-p08", "Anything sweet and chocolatey for later?", { tag: "indirect", acc: [CC, IC, MC, FL] }),
  pos("h2-p09", "Is it realistic to put on size without feeling stuffed?", { tag: "indirect", docs: [MG] }),
  pos("h2-p10", "Quick tips so I don't blow my deficit when we eat out.", { docs: [FL], acc: [FF, HK] }),
  pos("h2-p11", "Rough day, ate way too much, feeling pretty rubbish.", { tag: "indirect", docs: ["coaching.coaching_style"], acc: [FL] }),
  pos("h2-p12", "Want a cold creamy treat but I'm watching my weight.", { tag: "indirect", docs: [IC, FL], acc: [TX] }),
  pos("h2-p13", "Cheeseburger vibes today, trying not to overdo it.", { tag: "indirect", docs: [FF], acc: [FL, FC] }),
  pos("h2-p14", "How trustworthy are calorie counts on menus?", { docs: [UP], acc: [HK], sec: [UP, "restaurant-and-hawker-uncertainty"] }),
  pos("h2-p15", "Spicier please. How?", { tag: "messy", docs: [FH], sec: [FH, "spice-and-heat"] }),
  pos("h2-p16", "Hawker rice portions: how do I eyeball them?", { docs: [HK], acc: [UP, FL], sec: [HK, "rice-and-noodle-portion-uncertainty"] }),
  pos("h2-p17", "Give me protein tips when I'm trying to shed fat.", { docs: [FL], sec: [FL, "protein-preservation"] }),
  pos("h2-p18", "Need a satisfying crunch that isn't deep fried.", { tag: "indirect", docs: [TX], acc: [FC, FH], sec: [TX, "crunch"] }),
  pos("h2-p19", "Frozen treat idea that won't wreck my day.", { tag: "indirect", docs: [IC], acc: [FL, TX], sec: [IC, "higher-protein-or-lighter-alternatives"] }),
  pos("h2-p21", "Which noodle bowl at the stalls is the lighter pick?", { tag: "indirect", docs: [HK], acc: [FL, VN], sec: [HK, "clear-soup-strategies"] }),
  pos("h2-p22", "Is a surplus meant to feel like a chore?", { tag: "indirect", docs: [MG], sec: [MG, "adherence"] }),
  // bilingual / mixed
  pos("h2-v01", "Làm sao cho món này giòn hơn?", { tag: "bilingual", docs: [TX], acc: [FH, FC] }),
  pos("h2-v02", "Hôm nay muốn ăn hawker food.", { tag: "bilingual", docs: [HK], acc: [FL, UP] }),
  pos("h2-v03", "Tôi thèm cereal ngọt quá.", { tag: "bilingual", docs: [CC], acc: [MC, FL] }),

  // ================= HELD-OUT · negatives =================
  neg("h2-n01", "What are the totals so far today?"),
  neg("h2-n02", "Take the sauce out."),
  neg("h2-n03", "Is this under 500?", "near-miss"),
  neg("h2-n04", "More chicken please.", "near-miss"),
  neg("h2-n05", "How many grams of chicken is this?", "near-miss"),
  neg("h2-n06", "Add 50g more rice.", "near-miss"),
  neg("h2-n07", "Save it.", "near-miss"),
  neg("h2-n08", "I'm not eating mushrooms.", "near-miss"),
  neg("h2-n09", "What's my calorie goal?", "near-miss"),
  neg("h2-n10", "Grams of protein in two eggs?", "near-miss"),
  neg("h2-n11", "Can you lower the carbs?", "near-miss"),
  neg("h2-n12", "Bigger portion pls", "messy"),
  neg("h2-n13", "What's the weather like?", "near-miss"),
  neg("h2-n14", "Thank u!!", "messy"),
  neg("h2-n15", "Cảm ơn nhé.", "bilingual"),
]
