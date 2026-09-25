/**
 * Phase 2 — deterministic, lossless input understanding.
 *
 *   RAW INPUT (authoritative provenance, never rewritten)
 *     → LOSSLESS NORMALIZATION   token-wise form repair: accents, slang, abbreviations, Telex/typing leftovers
 *     → DISCOURSE SEGMENTATION   punctuation AND discourse markers ("à khoan", "với lại", "đừng …")
 *
 * Normalization repairs FORM only. It never changes negation, temporal relation, laterality, attribution,
 * correction direction, action truth or uncertainty: an abbreviation expands to the *same* word ("k" → "khong",
 * never dropped), and every normalized token keeps the raw offsets it came from, so a segment can always be
 * quoted back as the user's own words. No LLM, no I/O.
 */

export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d");
}

export type NormalizedToken = {
  raw: string;
  /** Offsets into the raw input. */
  start: number;
  end: number;
  /** Folded + repaired words this raw token stands for (may be several, e.g. "hnay" → "hom nay"). */
  norm: string;
  /** Trailing sentence punctuation that was attached to the raw token ("." "?" "!" ";" "…" "—"). */
  punct: string;
  /** True when a line break precedes the token in the raw input. */
  lineBreakBefore: boolean;
  repaired: boolean;
};

export type NormalizedInput = {
  raw: string;
  tokens: NormalizedToken[];
  /** Folded, repaired text with sentence punctuation kept (word boundaries preserved). */
  text: string;
  /** Human-readable list of the form repairs applied, for provenance/debugging. */
  repairs: string[];
};

/** Same-meaning abbreviation expansion. Negation words expand to negation; nothing here inverts anything. */
const ABBREVIATIONS: Record<string, string> = {
  k: "khong",
  ko: "khong",
  hok: "khong",
  hem: "khong",
  khg: "khong",
  kh: "khong",
  dg: "dang",
  dag: "dang",
  lm: "lam",
  hnay: "hom nay",
  hqua: "hom qua",
  hqa: "hom qua",
  qa: "qua",
  nma: "nhung ma",
  nhma: "nhung ma",
  nhg: "nhung",
  dc: "duoc",
  dk: "duoc",
  trc: "truoc",
  j: "gi",
  ntn: "nhu the nao",
  bt: "binh thuong",
  r: "roi",
  cx: "cung",
  cg: "cung",
  tl: "tra loi",
  bn: "bao nhieu",
  vd: "vi du",
  lun: "luon",
  mk: "minh",
  wa: "qua",
  ok: "ok",
  oke: "ok",
};

/** Domain words that typo/Telex repair may snap to. Kept small on purpose: repair must be unambiguous. */
const LEXICON = new Set([
  "trai", "phai", "vai", "hom", "qua", "nay", "toi", "tao", "may", "dau", "nguc", "ngan", "gon", "dai",
  "nhung", "khong", "roi", "thoi", "ngu", "tap", "nghi", "luu", "viet", "cau", "bai", "dung", "doi", "ngon",
  "sua", "lai", "thu", "khoan", "nham", "nho", "tra", "loi", "chi", "can", "them", "ngay", "tuan", "thang",
  "chong", "mat", "kho", "tho", "tay", "met", "moi", "dung", "nhe", "nha", "voi", "duoc", "cua", "cho",
]);

const TELEX_TONE_KEYS = /[sfrxjz]$/;

function repairWord(word: string): { out: string; repaired: boolean } {
  if (LEXICON.has(word) || word.length < 3) return { out: word, repaired: false };
  const collapsed = word.replace(/(.)\1{2,}/g, "$1");
  if (collapsed !== word && (LEXICON.has(collapsed) || collapsed.length >= 3)) {
    if (LEXICON.has(collapsed)) return { out: collapsed, repaired: true };
  }
  const deduped = word.replace(/(.)\1+/g, "$1");
  if (deduped !== word && LEXICON.has(deduped)) return { out: deduped, repaired: true };
  if (word.length >= 4 && TELEX_TONE_KEYS.test(word)) {
    const base = word.slice(0, -1);
    if (LEXICON.has(base)) return { out: base, repaired: true };
  }
  if (word.startsWith("dd") && LEXICON.has(word.replace(/^dd/, "d"))) {
    return { out: word.replace(/^dd/, "d"), repaired: true };
  }
  return { out: word, repaired: false };
}

const EDGE_PUNCT = /^[\s"'“”‘’()[\]{}<>«»*_`~]+|[\s"'“”‘’()[\]{}<>«»*_`~]+$/g;
const TRAILING_SENTENCE_PUNCT = /([.!?;…—–]+)$/;

export function normalizeInput(raw: string): NormalizedInput {
  const tokens: NormalizedToken[] = [];
  const repairs: string[] = [];
  const matcher = /\S+/g;
  let prevEnd = 0;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(raw)) !== null) {
    const rawToken = match[0];
    const start = match.index;
    const end = start + rawToken.length;
    const gap = raw.slice(prevEnd, start);
    prevEnd = end;

    // A dash standing alone ("phải — à khoan") is a clause boundary, not a word.
    if (/^[—–-]+$/.test(rawToken)) {
      const last = tokens.at(-1);
      if (last && !last.punct) last.punct = "—";
      continue;
    }

    let core = rawToken;
    let punct = "";
    const trailing = TRAILING_SENTENCE_PUNCT.exec(core.replace(/[,:"'”’)\]]+$/g, ""));
    if (trailing) punct = trailing[1];
    // Commas/colons are clause hints but not sentence ends; keep them as a soft punctuation mark.
    const soft = /[,:]$/.test(core.replace(/["'”’)\]]+$/g, "")) ? "," : "";
    core = core.replace(EDGE_PUNCT, "").replace(/[.!?;…,:]+$/g, "");
    // "3–4" is a range, not "34": keep the dash between digits before stripping non-word characters.
    const folded = foldText(core.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")).replace(/[^a-z0-9+\-/%]/g, "");
    if (!folded) {
      const last = tokens.at(-1);
      if (last && punct && !last.punct) last.punct = punct;
      continue;
    }

    let norm = folded;
    let repaired = false;
    const abbreviation = ABBREVIATIONS[folded];
    if (abbreviation && abbreviation !== folded) {
      norm = abbreviation;
      repaired = true;
    } else {
      const fixed = repairWord(folded);
      norm = fixed.out;
      repaired = fixed.repaired;
    }
    if (repaired) repairs.push(`${core}→${norm}`);
    tokens.push({
      raw: rawToken,
      start,
      end,
      norm,
      punct: punct || soft,
      lineBreakBefore: /\n/.test(gap),
      repaired,
    });
  }
  // A line break is a sentence boundary even with no punctuation; keep it visible to text-level matchers.
  const text = tokens
    .map((t, i) => `${t.norm}${t.punct}${tokens[i + 1]?.lineBreakBefore && !/[.!?;…]/.test(t.punct) ? "." : ""}`)
    .join(" ");
  return { raw, tokens, text, repairs };
}

export type DiscourseSegment = {
  index: number;
  /** Raw offsets — the segment quotes the user's own words. */
  start: number;
  end: number;
  raw: string;
  /** Folded + repaired text of the segment. */
  text: string;
  hasQuestionMark: boolean;
};

/** Multi-token discourse markers that open a new unit of talk even with no punctuation. */
const OPENERS: string[][] = [
  ["a", "khoan"], ["khoan", "da"], ["voi", "lai"], ["con", "nua"], ["quay", "lai"], ["cuoi", "cung"],
  ["y", "tao", "la"], ["y", "toi", "la"], ["ngoai", "ra"], ["them", "nua"], ["tiep", "theo"], ["sau", "do"],
  ["by", "the", "way"], ["btw"], ["also"], ["another", "thing"], ["one", "more", "thing"], ["finally"],
  ["anyway"], ["oh", "and"], ["vay", "thi"], ["vay"], ["khong", "can"], ["khoi"], ["bo", "qua"], ["ignore"], ["forget"],
];
/** "đừng" and "đúng" both fold to "dung": it is a prohibition only in front of a verb, not after "mới/là/có". */
const PROHIBITION_VERBS = new Set([
  "luu", "nhac", "show", "doi", "de", "cho", "noi", "goi", "lam", "hoi", "tra", "viet", "giai", "in", "ke",
  "tiet", "dua", "them", "bo", "lap", "kem", "save", "store", "share", "switch", "change", "reveal", "ghi",
]);
const NOT_PROHIBITION_BEFORE = new Set(["moi", "la", "co", "rat", "hoan", "toan"]);
/** Sentence-final particles: the clause is over even without a full stop. */
const FINAL_PARTICLES = new Set(["nhe", "nha", "nhen", "nhi"]);

function startsWith(tokens: NormalizedToken[], at: number, phrase: string[]): boolean {
  return phrase.every((word, offset) => tokens[at + offset]?.norm.split(" ")[0] === word);
}

function opensNewUnit(tokens: NormalizedToken[], at: number): boolean {
  if (OPENERS.some((phrase) => startsWith(tokens, at, phrase))) return true;
  const token = tokens[at];
  if (token?.norm === "dung") {
    const next = tokens[at + 1]?.norm.split(" ")[0];
    const before = tokens[at - 1]?.norm;
    return Boolean(next && PROHIBITION_VERBS.has(next) && !(before && NOT_PROHIBITION_BEFORE.has(before)));
  }
  return false;
}

export function segmentDiscourse(input: NormalizedInput): DiscourseSegment[] {
  const { tokens, raw } = input;
  const segments: DiscourseSegment[] = [];
  let from = 0;
  const flush = (to: number): void => {
    if (to <= from) return;
    const slice = tokens.slice(from, to);
    const start = slice[0].start;
    const end = slice[slice.length - 1].end;
    const text = slice.map((t) => `${t.norm}${t.punct}`).join(" ");
    segments.push({
      index: segments.length,
      start,
      end,
      raw: raw.slice(start, end),
      text,
      hasQuestionMark: slice.some((t) => t.punct.includes("?")),
    });
    from = to;
  };

  for (let i = 0; i < tokens.length; i += 1) {
    if (i > from && (tokens[i].lineBreakBefore || opensNewUnit(tokens, i))) flush(i);
    // "… thu 3 moi dung <new request>": the confirmation "mới đúng" closes its clause.
    const closesConfirmation = tokens[i].norm === "dung" && tokens[i - 1]?.norm === "moi";
    const hard = /[.!?;…]/.test(tokens[i].punct) || FINAL_PARTICLES.has(tokens[i].norm) || closesConfirmation;
    if (hard) flush(i + 1);
  }
  flush(tokens.length);
  return segments;
}
