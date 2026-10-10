import type { NutritionIntent } from "../../../coach/conversation"

/**
 * N1.6.3 evaluation set. Ground truth was written from the corpus content
 * (knowledge/nutrition/**) BEFORE looking at any retrieval output, then split
 * ~70/30. Held-out cases deliberately differ LEXICALLY from the dev cases
 * (e.g. dev "Make this meal crunchier" / held-out "I want more bite and
 * crispness"): no alias, weight or threshold may be tuned against them before
 * the configuration is frozen.
 *
 * Document ids are the corpus ids without the "nutrition." prefix; section ids
 * are `<doc>::<heading-slug>`.
 */
export type EvalCase = {
  id: string
  split: "dev" | "heldout"
  message: string
  intent?: NutritionIntent
  /** Should the Knowledge Need Gate fire at all? */
  gate: boolean
  /** Mandatory documents: each must appear among the first 3 distinct documents retrieved. */
  docs?: string[]
  /** Documents that are fine to see alongside the mandatory ones. Anything else in the top 3 is a wrong document. */
  acceptable?: string[]
  /** Expected section (heading slug) inside a document. */
  section?: { doc: string; heading: string }
}

const GENERIC = ["core.basics", "coaching.craving_conversation", "coaching.coaching_style"]

export const CASES: EvalCase[] = [
  // ---------- gate: must NOT retrieve (deterministic tools / state answer these) ----------
  { id: "d-no-1", split: "dev", message: "How much protein is in 150g chicken?", gate: false },
  { id: "d-no-2", split: "dev", message: "Make this bowl under 400 calories.", gate: false },
  { id: "d-no-3", split: "dev", message: "Log this meal.", gate: false },
  { id: "d-no-4", split: "dev", message: "How many calories do I have left?", gate: false },
  { id: "d-no-5", split: "dev", message: "I hate Greek yogurt.", gate: false },
  { id: "d-no-6", split: "dev", message: "Remove the rice.", gate: false },
  { id: "d-no-7", split: "dev", message: "ingredients?", gate: false },
  { id: "d-no-8", split: "dev", message: "macros?", gate: false },
  { id: "d-no-9", split: "dev", message: "how much tuna?", gate: false },
  { id: "d-no-10", split: "dev", message: "Swap the chicken for fish.", gate: false },
  { id: "h-no-1", split: "heldout", message: "What are the macros of 200g rice?", gate: false },
  { id: "h-no-2", split: "heldout", message: "Delete the oil from this.", gate: false },
  { id: "h-no-3", split: "heldout", message: "Save this meal to my log.", gate: false },
  { id: "h-no-4", split: "heldout", message: "I dislike broccoli.", gate: false },
  { id: "h-no-5", split: "heldout", message: "Tell me how much protein I have left today.", gate: false },

  // ---------- gate: should retrieve (strategy the engine cannot represent) ----------
  { id: "d-1", split: "dev", message: "I'm craving Coco Pops.", gate: true, docs: ["craving.cereal", "food_makeovers.cereal"], acceptable: [...GENERIC, "goal.fat_loss"] },
  { id: "d-2", split: "dev", message: "I'm craving fried chicken while cutting.", gate: true, docs: ["food_makeovers.fried_chicken", "goal.fat_loss"], acceptable: [...GENERIC, "food_makeovers.fast_food"] },
  { id: "d-3", split: "dev", message: "I want something Vietnamese tonight.", gate: true, docs: ["cuisine.vietnamese"], acceptable: [...GENERIC, "goal.fat_loss", "flavor_texture.flavor_hacks"] },
  { id: "d-4", split: "dev", message: "What should I eat at a hawker centre tonight?", gate: true, docs: ["cuisine.singapore_hawker"], acceptable: [...GENERIC, "goal.fat_loss", "core.uncertainty_provenance"] },
  { id: "d-5", split: "dev", message: "Make this meal crunchier.", gate: true, docs: ["flavor_texture.texture_hacks"], acceptable: ["flavor_texture.flavor_hacks", ...GENERIC], section: { doc: "flavor_texture.texture_hacks", heading: "crunch" } },
  { id: "d-6", split: "dev", message: "I want something frozen and creamy.", gate: true, docs: ["flavor_texture.texture_hacks", "craving.ice_cream"], acceptable: ["food_makeovers.cereal", ...GENERIC], section: { doc: "flavor_texture.texture_hacks", heading: "cold-and-frozen-texture" } },
  { id: "d-7", split: "dev", message: "I'm craving ice cream but I'm cutting.", gate: true, docs: ["craving.ice_cream", "goal.fat_loss"], acceptable: GENERIC },
  { id: "d-8", split: "dev", message: "I want fast food but don't want to blow my calories.", gate: true, docs: ["food_makeovers.fast_food"], acceptable: [...GENERIC, "goal.fat_loss", "food_makeovers.fried_chicken"] },
  { id: "d-9", split: "dev", message: "How can I make this cereal bowl taste better?", gate: true, docs: ["food_makeovers.cereal"], acceptable: ["craving.cereal", "flavor_texture.flavor_hacks", "flavor_texture.texture_hacks", ...GENERIC] },
  { id: "d-10", split: "dev", message: "Is cereal bad for cutting?", gate: true, docs: ["goal.fat_loss"], acceptable: ["craving.cereal", "food_makeovers.cereal", ...GENERIC] },
  { id: "d-11", split: "dev", message: "I feel guilty about eating pizza.", gate: true, docs: ["coaching.coaching_style"], acceptable: [...GENERIC, "goal.fat_loss", "food_makeovers.fast_food"] },
  { id: "d-12", split: "dev", message: "How do I add more heat to this dish?", gate: true, docs: ["flavor_texture.flavor_hacks"], acceptable: GENERIC, section: { doc: "flavor_texture.flavor_hacks", heading: "spice-and-heat" } },
  { id: "d-13", split: "dev", message: "This is bland, it needs more acidity.", gate: true, docs: ["flavor_texture.flavor_hacks"], acceptable: GENERIC, section: { doc: "flavor_texture.flavor_hacks", heading: "acidity" } },
  { id: "d-14", split: "dev", message: "How do I handle rice portions at the hawker centre?", gate: true, docs: ["cuisine.singapore_hawker"], acceptable: [...GENERIC, "core.uncertainty_provenance", "goal.fat_loss"], section: { doc: "cuisine.singapore_hawker", heading: "rice-and-noodle-portion-uncertainty" } },
  { id: "d-15", split: "dev", message: "Vietnamese noodle soup tips while cutting.", gate: true, docs: ["cuisine.vietnamese", "goal.fat_loss"], acceptable: GENERIC, section: { doc: "cuisine.vietnamese", heading: "broth-based-dishes" } },
  { id: "d-16", split: "dev", message: "I'm bulking, how should I structure my meals?", gate: true, docs: ["goal.muscle_gain"], acceptable: [...GENERIC] },
  { id: "d-17", split: "dev", message: "How should I think about protein while cutting?", gate: true, docs: ["goal.fat_loss"], acceptable: [...GENERIC], section: { doc: "goal.fat_loss", heading: "protein-preservation" } },
  { id: "d-18", split: "dev", message: "Can I still eat chicken rice at a hawker stall while cutting?", gate: true, docs: ["cuisine.singapore_hawker", "goal.fat_loss"], acceptable: GENERIC },
  { id: "d-19", split: "dev", message: "I want something crunchy and salty.", gate: true, docs: ["flavor_texture.texture_hacks"], acceptable: ["flavor_texture.flavor_hacks", "food_makeovers.fast_food", "food_makeovers.cereal", ...GENERIC], section: { doc: "flavor_texture.texture_hacks", heading: "crunch" } },
  { id: "d-20", split: "dev", message: "How do I make a burger meal lighter?", gate: true, docs: ["food_makeovers.fast_food"], acceptable: [...GENERIC, "goal.fat_loss", "food_makeovers.fried_chicken"] },
  { id: "d-21", split: "dev", message: "I want the crunch of fried chicken but lighter.", gate: true, docs: ["food_makeovers.fried_chicken"], acceptable: ["flavor_texture.texture_hacks", "goal.fat_loss", ...GENERIC], section: { doc: "food_makeovers.fried_chicken", heading: "high-leverage-strategies" } },
  { id: "d-22", split: "dev", message: "Is a restaurant calorie estimate reliable?", gate: true, docs: ["core.uncertainty_provenance"], acceptable: ["cuisine.singapore_hawker", ...GENERIC] },

  { id: "h-1", split: "heldout", message: "I want more bite and crispness.", gate: true, docs: ["flavor_texture.texture_hacks"], acceptable: ["flavor_texture.flavor_hacks", "food_makeovers.fried_chicken", ...GENERIC], section: { doc: "flavor_texture.texture_hacks", heading: "crunch" } },
  { id: "h-2", split: "heldout", message: "Something smooth and silky would hit the spot.", gate: true, docs: ["flavor_texture.texture_hacks"], acceptable: ["craving.ice_cream", ...GENERIC], section: { doc: "flavor_texture.texture_hacks", heading: "creaminess" } },
  { id: "h-3", split: "heldout", message: "Anything from a Singaporean food court that works for weight loss?", gate: true, docs: ["cuisine.singapore_hawker", "goal.fat_loss"], acceptable: GENERIC },
  { id: "h-4", split: "heldout", message: "Trying to lose weight but I really want a cheeseburger.", gate: true, docs: ["food_makeovers.fast_food", "goal.fat_loss"], acceptable: GENERIC },
  { id: "h-5", split: "heldout", message: "I fancy a bowl of sugary chocolate flakes.", gate: true, docs: ["craving.cereal"], acceptable: ["food_makeovers.cereal", ...GENERIC, "goal.fat_loss"] },
  { id: "h-6", split: "heldout", message: "My food tastes flat, it needs to pop more.", gate: true, docs: ["flavor_texture.flavor_hacks"], acceptable: GENERIC },
  { id: "h-7", split: "heldout", message: "Pho but make it fit my macros.", gate: true, docs: ["cuisine.vietnamese"], acceptable: [...GENERIC, "goal.fat_loss"] },
  { id: "h-8", split: "heldout", message: "Frozen dessert idea without wrecking my day.", gate: true, docs: ["craving.ice_cream"], acceptable: ["goal.fat_loss", "flavor_texture.texture_hacks", ...GENERIC] },
  { id: "h-9", split: "heldout", message: "How do I build muscle faster with food?", gate: true, docs: ["goal.muscle_gain"], acceptable: GENERIC },
  { id: "h-10", split: "heldout", message: "I overate yesterday and feel awful about it.", gate: true, docs: ["coaching.coaching_style"], acceptable: ["goal.fat_loss", ...GENERIC] },
  { id: "h-11", split: "heldout", message: "Deep-fried wings: any way to enjoy them in a deficit?", gate: true, docs: ["food_makeovers.fried_chicken"], acceptable: ["goal.fat_loss", "food_makeovers.fast_food", ...GENERIC] },
  { id: "h-12", split: "heldout", message: "Is the portion at a noodle stall reliable?", gate: true, docs: ["cuisine.singapore_hawker", "core.uncertainty_provenance"], acceptable: GENERIC },
]
