import { foldText } from "@/lib/dante-core/coherence/understanding";

/**
 * H0 cluster F (entity resolution): a PubChem name lookup returns SOME compound for an acronym ("BCAA" → bromochloroacetic
 * acid). The record is evidence only when its title actually names what was asked — same words, or one contains the other.
 * No fuzzy matching: precision over recall (a missed lookup is "no match", a wrong one is a false source).
 */
export function pubChemTitleMatches(asked: string, title: string): boolean {
  const norm = (text: string) => foldText(text).replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(asked);
  const t = norm(title);
  if (!a || !t) return false;
  return t === a || t.includes(a) || (a.length > 6 && a.includes(t));
}
