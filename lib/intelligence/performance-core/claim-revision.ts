/**
 * One span repair for unsupported claims. Callers supply the predicate; this file does not classify.
 * A fused sentence keeps an identity head and drops the invalid tail. A following "therefore"
 * sentence is dropped only when the previous sentence was just repaired.
 */

const DEPENDENT = /^(?:therefore|thus|hence|so|that(?:'s| is) why|which means|that means|vì vậy|do đó|vì thế)\b/i;

function identityHead(sentence: string, spanInvalid: (span: string) => boolean): string | null {
  const patterns = [
    /^(.+?\b(?:is|are|là)\b.+?)\s+(?:that|which|and|và)\s+(.+)$/i,
    /^(.+?\b(?:is|are|là)\b[^;]{3,});\s*(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = sentence.match(pattern);
    if (!match) continue;
    const head = match[1].replace(/[,:;]\s*$/, "").trim();
    if (spanInvalid(match[2]) && !spanInvalid(head) && head.length >= 12 && /\b(?:is|are|là)\b\s+\S+/i.test(head)) {
      return /[.!?…]$/.test(head) ? head : `${head}.`;
    }
  }
  return null;
}

function reviseSentence(sentence: string, isInvalid: (sentence: string) => boolean, spanInvalid: (span: string) => boolean, priorTouched: boolean): string | null {
  const trimmed = sentence.trim();
  if (!trimmed) return "";
  if (DEPENDENT.test(trimmed) && (priorTouched || isInvalid(trimmed))) return null;
  if (!isInvalid(trimmed)) return sentence;
  return identityHead(trimmed, spanInvalid);
}

/** `removed` counts sentences dropped or shortened. The reply never gains a new claim. */
export function reviseClaimSpans(
  reply: string,
  isInvalid: (sentence: string) => boolean,
  spanInvalid: (span: string) => boolean = isInvalid,
): { reply: string; removed: number } {
  let removed = 0;
  let priorTouched = false;
  const revised = reply
    .split("\n")
    .map((line) => {
      const kept: string[] = [];
      // H0 cluster G: a list item whose first sentence (its subject) is removed goes whole — never "2. However, …".
      // The marker is split off first: "2." would otherwise read as a sentence of its own.
      const marker = line.match(/^\s*(?:\d+[.)]|[-*•])\s+/)?.[0] ?? "";
      const listItem = marker !== "";
      for (const [index, sentence] of line.slice(marker.length).split(/(?<=[.!?…])\s+/).entries()) {
        const next = reviseSentence(sentence, isInvalid, spanInvalid, priorTouched);
        if (next === null && listItem && index === 0) {
          removed += 1;
          priorTouched = true;
          return null;
        }
        if (next === null) {
          removed += 1;
          priorTouched = true;
          continue;
        }
        if (next !== sentence) {
          removed += 1;
          priorTouched = true;
        } else if (sentence.trim()) priorTouched = false;
        if (next.trim()) kept.push(next);
      }
      return kept.length ? `${marker}${kept.join(" ")}` : listItem ? null : "";
    })
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { reply: removed > 0 ? renumberLists(revised) : revised, removed };
}

const LIST_MARKER = /^\s*(?:\d+[.)]|[-*•])\s+/;

/**
 * Sentence-level removal / replacement that keeps list structure (H0 final closure). Splitting a line on sentence ends
 * reads the marker "2." as a sentence of its own, so a removed item heading left "2." glued to the next sentence
 * ("2. If you're already meeting your protein needs…"). Here the marker is split off first; a list item whose first
 * sentence (its subject) is removed goes whole; numbering is made contiguous again. `map` returns the sentence to keep,
 * a replacement, or null to remove it.
 */
export function mapSentencesKeepingLists(text: string, map: (sentence: string) => string | null): string {
  let changed = false;
  const out = text
    .split("\n")
    .map((line) => {
      const marker = line.match(LIST_MARKER)?.[0] ?? "";
      const kept: string[] = [];
      for (const [index, sentence] of line.slice(marker.length).split(/(?<=[.!?…])\s+/).entries()) {
        if (!sentence.trim()) continue;
        const next = map(sentence);
        if (next !== sentence) changed = true;
        if (next === null && marker && index === 0) return null;
        if (next !== null && next.trim()) kept.push(next);
      }
      if (kept.length > 0) return `${marker}${kept.join(" ")}`;
      return marker ? null : line.trim() ? null : "";
    })
    .filter((line): line is string => line !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return changed ? renumberLists(out) : text;
}

/**
 * "1., 3., 4." after a removal → "1., 2., 3.". Numbering restarts at every genuine "1." so separate lists never merge;
 * a reply whose numbers already run in order is returned unchanged.
 */
export function renumberLists(text: string): string {
  let n = 0;
  return text
    .split("\n")
    .map((line) => line.replace(/^(\s*)(\d+)([.)])(\s)/, (_match, indent: string, num: string, dot: string, space: string) => {
      n = Number(num) === 1 ? 1 : n + 1;
      return `${indent}${n}${dot}${space}`;
    }))
    .join("\n");
}
