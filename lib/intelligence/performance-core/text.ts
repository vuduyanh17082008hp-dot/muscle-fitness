/** Lower-case, strip diacritics, đ→d. The one text form every matcher in the core reads. */
export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/[’`]/g, "'");
}

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-term match on already-folded text ("nac" never matches "snack"). */
export function hasTerm(folded: string, term: string): boolean {
  return new RegExp(`(?<![a-z0-9])${escape(term)}(?![a-z0-9])`).test(folded);
}

/** Every whole-term occurrence of `term` in folded text, as [start, end) spans. */
export function termSpans(folded: string, term: string): Array<[number, number]> {
  return [...folded.matchAll(new RegExp(`(?<![a-z0-9])${escape(term)}(?![a-z0-9])`, "g"))].map((hit) => [hit.index, hit.index + term.length]);
}

export function tokens(folded: string): string[] {
  return folded.match(/[a-z0-9'-]+/g) ?? [];
}

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
}
