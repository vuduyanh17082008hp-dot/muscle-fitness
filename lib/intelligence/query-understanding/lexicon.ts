/**
 * Single shared vocabulary for query understanding. Add aliases HERE — never as ad-hoc regexes in a coach.
 * Keys are canonical English; aliases keep Vietnamese diacritics (accentless variants listed only where unambiguous).
 */

export const FOOD_ALIASES: Record<string, string[]> = {
  cod: ["cod", "cod fish", "cod fillet", "cod fillets", "cá tuyết", "ca tuyet"],
  salmon: ["salmon", "salmon fillet", "cá hồi", "ca hoi"],
  tuna: ["tuna", "cá ngừ", "ca ngu"],
  tilapia: ["tilapia", "cá rô phi"],
  shrimp: ["shrimp", "prawns", "prawn", "tôm"],
  chicken_breast: ["chicken breast", "chicken breasts", "ức gà", "uc ga"],
  chicken: ["chicken", "gà"],
  beef: ["beef", "steak", "thịt bò", "bò"],
  pork: ["pork", "thịt heo", "thịt lợn"],
  egg: ["egg", "eggs", "trứng"],
  egg_whites: ["egg whites", "egg white", "lòng trắng trứng"],
  white_rice: ["white rice", "cơm trắng", "cơm"],
  rice: ["rice", "gạo"],
  oats: ["oats", "oatmeal", "yến mạch"],
  greek_yogurt: ["greek yogurt", "greek yoghurt", "sữa chua hy lạp"],
  yogurt: ["yogurt", "yoghurt", "sữa chua"],
  tofu: ["tofu", "đậu hũ", "đậu phụ"],
  milk: ["milk", "sữa"],
  banana: ["banana", "chuối"],
  potato: ["potato", "potatoes", "khoai tây"],
  sweet_potato: ["sweet potato", "khoai lang"],
  bread: ["bread", "toast", "bánh mì"],
  broccoli: ["broccoli", "bông cải xanh"],
  whey: ["whey", "whey protein"],
  avocado: ["avocado", "bơ"],
  pasta: ["pasta", "spaghetti", "mì ý"],
  pho: ["pho", "phở"],
  noodles: ["noodles", "mì", "bún"],
};

/** Variety modifiers that stay attached to the food ("atlantic cod", "basmati rice", "skinless chicken breast"). */
export const FOOD_VARIETY_WORDS = ["atlantic", "pacific", "wild", "farmed", "skinless", "boneless", "lean", "basmati", "jasmine", "brown", "white", "sockeye", "coho", "king", "whole", "skim", "low-fat", "nonfat", "fat-free", "extra"];

export const PREPARATION: Record<string, { state: "raw" | "cooked"; method?: string }> = {
  raw: { state: "raw" }, sống: { state: "raw" },
  cooked: { state: "cooked" }, chín: { state: "cooked" },
  grilled: { state: "cooked", method: "grilled" }, nướng: { state: "cooked", method: "grilled" },
  baked: { state: "cooked", method: "baked" }, boiled: { state: "cooked", method: "boiled" }, luộc: { state: "cooked", method: "boiled" },
  steamed: { state: "cooked", method: "steamed" }, hấp: { state: "cooked", method: "steamed" },
  fried: { state: "cooked", method: "fried" }, chiên: { state: "cooked", method: "fried" }, rán: { state: "cooked", method: "fried" },
  roasted: { state: "cooked", method: "roasted" }, poached: { state: "cooked", method: "poached" },
};

export const EXERCISE_ALIASES: Record<string, string[]> = {
  bench_press: ["bench press", "bench", "bp", "chest press"],
  squat: ["squat", "squats", "back squat", "front squat"],
  deadlift: ["deadlift", "deadlifts", "dl", "rdl", "romanian deadlift"],
  overhead_press: ["overhead press", "ohp", "shoulder press", "military press"],
  row: ["barbell row", "bent over row", "row", "rows"],
  pull_up: ["pull up", "pull-up", "pullup", "pull ups", "chin up"],
  leg_press: ["leg press"],
  hip_thrust: ["hip thrust"],
};

export const MUSCLE_ALIASES: Record<string, string[]> = {
  legs: ["legs", "leg", "leg day", "quads", "quad", "hamstrings", "glutes", "chân", "chan"],
  chest: ["chest", "pecs", "ngực"],
  back: ["back", "lats", "lưng"],
  shoulders: ["shoulders", "shoulder", "delts", "vai"],
  arms: ["arms", "biceps", "triceps", "tay"],
};

export const RESTAURANTS = ["mcdonalds", "mcdonald's", "mcdonald", "kfc", "burger king", "subway", "pizza hut", "hawker", "hawker centre", "food court", "nhà hàng", "quán"];

/** Weight/volume units we convert deterministically; the rest are count-style and need a verified serving mapping. */
export const MASS_UNITS_TO_GRAMS: Record<string, number> = { g: 1, gram: 1, grams: 1, gr: 1, gam: 1, kg: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592 };
export const COUNT_UNITS = ["serving", "servings", "piece", "pieces", "slice", "slices", "cup", "cups", "fillet", "fillets", "ml"];

export const NUTRITION_WORDS = [
  "eat", "ate", "eaten", "eating", "food", "meal", "macros", "macro", "protein", "calories", "calorie", "carbs", "carb", "fat",
  "fiber", "sugar", "dinner", "lunch", "breakfast", "snack", "hungry", "craving", "diet", "recipe", "kcal",
  "ăn", "bữa", "calo", "đói", "thèm", "món",
];
export const TRAINING_WORDS = [
  "squat", "bench", "deadlift", "press", "row", "workout", "session", "sets", "set", "reps", "rep", "rpe", "rir", "volume",
  "intensity", "train", "training", "lift", "lifting", "program", "deload", "pr", "1rm", "exercise", "heavy", "load",
  "tập", "buổi", "hiệp",
];
export const RECOVERY_WORDS = [
  "recovery", "recover", "sore", "soreness", "tired", "fatigue", "fatigued", "sleep", "slept", "readiness", "hrv", "rest",
  "exhausted", "drained", "ngủ", "mỏi", "mệt", "hồi phục", "phục hồi",
];
export const PERFORMANCE_WORDS = ["dropped", "worse", "weaker", "weak", "stalled", "plateau", "declining", "decline", "regress", "regressed", "pr", "stronger", "slower", "yếu", "tệ", "tụt"];
export const SYMPTOM_WORDS = ["hurts", "hurt", "pain", "painful", "sharp", "dizzy", "numb", "tingling", "chest pain", "đau", "chóng mặt", "choáng", "tê"];
