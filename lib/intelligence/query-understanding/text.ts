import type { QueryLanguage } from "./types";

/**
 * Safe normalization. Diacritics are PRESERVED: folding "ngủ" (sleep) to "ngu" (stupid) caused a real
 * social-router misroute. Classification reads `normalized` (diacritic-intact); `fold()` exists only for
 * alias lookups where the folded form is known to be unambiguous (see FOLD_SAFE below).
 */

/** Common typos → canonical token. Applied per whole word, diacritics untouched. */
const TYPOS: Record<string, string> = {
  protien: "protein", protine: "protein", proten: "protein", protein5: "protein",
  calory: "calorie", calorys: "calories", callories: "calories", calorie5: "calories", kalories: "calories",
  recoverry: "recovery", recovry: "recovery", recvery: "recovery", reocvery: "recovery",
  excersise: "exercise", exersise: "exercise", excercise: "exercise", exercize: "exercise",
  carbss: "carbs", carbz: "carbs", carbohydrates: "carbs", macross: "macros", macroes: "macros",
  deadlfit: "deadlift", deadift: "deadlift", dedlift: "deadlift", squatt: "squat", benchh: "bench",
  tmrw: "tomorrow", tmr: "tomorrow", tmw: "tomorrow", tn: "tonight", tonite: "tonight", tonigth: "tonight",
  yday: "yesterday", yest: "yesterday", im: "i'm", ive: "i've", dont: "don't", cant: "can't",
  grilld: "grilled", cooked5: "cooked",
};

/** Informal shorthand → canonical. Whole-word only. */
const SLANG: Record<string, string> = {
  ko: "không", hok: "không", hong: "không", "ko.": "không", vs: "versus",
  ur: "your", u: "you", pls: "please", plz: "please", thx: "thanks", wanna: "want to", gonna: "going to",
  macro: "macros", cals: "calories", cal: "calories", kcals: "calories", kcal: "calories", calo: "calories",
  rep: "reps", lbs: "lb",
};

/** Words whose accent-folded form is an ambiguous or different word → never fold-match these. */
const FOLD_UNSAFE = new Set(["ngủ", "ngu", "ngực", "nguc", "đau", "dau", "mỏi", "moi", "đói", "doi"]);

export function foldDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** True when the diacritic-free spelling of `word` may safely stand in for the accented word. */
export function isFoldSafe(word: string): boolean {
  return !FOLD_UNSAFE.has(word);
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'_.]*/gu;

/** Bounded edit distance ≤ 1 (insert/delete/substitute/transposition) — cheap typo tolerance for long vocabulary words. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // transposition
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** Vocabulary the fuzzy corrector may snap to (long, distinctive words only — short words never fuzzy-match). */
const FUZZY_VOCAB = [
  "protein", "calories", "calorie", "recovery", "exercise", "carbs", "macros", "deadlift", "squat", "bench",
  "tomorrow", "tonight", "yesterday", "breakfast", "dinner", "lunch", "workout", "training", "fatigue", "sleep",
  "chicken", "salmon", "yogurt", "grilled", "cooked", "volume", "intensity", "readiness",
];

function correctWord(word: string): string {
  if (TYPOS[word]) return TYPOS[word];
  if (SLANG[word]) return SLANG[word];
  if (word.length >= 6 && /^[a-z]+$/.test(word)) {
    const hit = FUZZY_VOCAB.find((candidate) => candidate.length >= 6 && withinOneEdit(word, candidate));
    if (hit) return hit;
  }
  return word;
}

export function normalizeQueryText(raw: string): string {
  const nfc = raw.normalize("NFC").toLowerCase();
  return nfc.replace(WORD, (word) => correctWord(word)).replace(/\s+/g, " ").trim();
}

const VI_DIACRITIC = /[ăâêôơưđạảãấầẩẫậắằẳẵặẹẻẽếềểễệỉĩịọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹý]/iu;
const VI_WORDS = new Set([
  "không", "ko", "hôm", "qua", "nay", "tối", "sáng", "thì", "sao", "bao", "nhiêu", "nên", "ăn", "gì", "để", "tập",
  "chân", "ngực", "vai", "lưng", "mỏi", "đau", "ngủ", "đói", "giữ", "nhưng", "giảm", "tăng", "được", "chưa", "rồi",
  "vl", "vcl", "tôi", "mình", "mới", "có", "và", "của", "cá", "gà", "cơm", "trứng", "bò", "heo", "đủ", "sau",
  "nặng", "nhẹ", "ngày", "mai", "tuần", "này", "với", "hơn", "ít", "nhiều", "rất", "quá", "thật", "tệ", "tốt",
  "calo", "hồi", "phục", "bữa", "thịt", "sữa", "rau", "củ", "quả", "ngu", "dau", "nguc", "toi", "khong", "nay",
]);
/** Vietnamese words that are NOT also English words, so they alone prove VI content even without diacritics. */
const VI_STRONG_ACCENTLESS = new Set(["khong", "toi", "nguc", "hom", "qua", "sao", "thi", "vl", "vcl", "nhung", "duoc", "bao", "nhieu"]);
const EN_WORDS = new Set([
  "the", "and", "what", "should", "should", "my", "is", "are", "how", "why", "for", "with", "eat", "train", "squat",
  "bench", "deadlift", "protein", "macros", "calories", "recovery", "workout", "heavy", "legs", "day", "today",
  "tonight", "tomorrow", "i", "i'm", "me", "can", "do", "does", "it", "about", "same", "but", "give", "lower",
  "dinner", "lunch", "breakfast", "meal", "gym", "cod", "chicken", "rice", "deload", "session", "set", "reps",
]);

/** Product/gym vocabulary Vietnamese users write in English; it is not evidence the message is English. */
const LOANWORDS = new Set(["recovery", "workout", "gym", "squat", "bench", "deadlift", "deload", "session", "set", "reps", "heavy", "legs", "train"]);

export function detectLanguage(raw: string): QueryLanguage {
  const text = raw.normalize("NFC").toLowerCase();
  const words = text.match(WORD) ?? [];
  if (words.length === 0) return "UNKNOWN";
  let vi = VI_DIACRITIC.test(text) ? 1 : 0;
  let en = 0;
  for (const word of words) {
    if (VI_WORDS.has(word) || VI_STRONG_ACCENTLESS.has(word)) vi++;
    if (EN_WORDS.has(word) && !LOANWORDS.has(word)) en++;
  }
  if (vi > 0 && en > 0) return "MIXED";
  if (vi > 0) return "VI";
  if (en > 0) return "EN";
  return /^[\d\s.,gkgml%]+$/.test(text) ? "UNKNOWN" : "EN";
}
