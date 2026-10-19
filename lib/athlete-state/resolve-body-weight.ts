/**
 * H0 cluster E — which bodyweight is "current", with every quality axis kept separate (never one overloaded enum):
 *
 *   ORIGIN        where the number came from: USER_CORRECTION (said in this chat) · WEIGH_IN (dated entry) · PROFILE (static field)
 *   TEMPORAL      CURRENT (applies now) · HISTORICAL (an older value kept for context)
 *   FRESHNESS     how old a dated value is: FRESH (≤14 d) · AGING (≤60 d) · STALE (>60 d) · UNDATED (profile field)
 *   AVAILABILITY  whether any value exists at all
 *
 * Precedence for "current": USER_CORRECTION > FRESH/AGING WEIGH_IN > PROFILE > STALE WEIGH_IN (dated, said as such).
 * A successful database read is not an objective verification: a profile field is UNDATED, never "up to date".
 */

export type WeightOrigin = "USER_CORRECTION" | "WEIGH_IN" | "PROFILE";
export type WeightFreshness = "FRESH" | "AGING" | "STALE" | "UNDATED";

export type ResolvedWeight = {
  valueKg: number;
  origin: WeightOrigin;
  temporal: "CURRENT" | "HISTORICAL";
  freshness: WeightFreshness;
  /** ISO date of a weigh-in; null for a profile field or a chat statement. */
  measuredOn: string | null;
  ageDays: number | null;
};

export type BodyWeightState = {
  available: boolean;
  current: ResolvedWeight | null;
  /** Other known values, older or outranked — context only, never used for a calculation. */
  alsoKnown: ResolvedWeight[];
  /** One line for the model: what to use and how to speak about its freshness. */
  rule: string;
};

const DAY = 86_400_000;
const freshnessOf = (ageDays: number): WeightFreshness => (ageDays <= 14 ? "FRESH" : ageDays <= 60 ? "AGING" : "STALE");

/** Re-resolve an existing state with a value the user stated in this chat on top (it becomes current; the rest is history). */
export function withUserStatedWeight(state: BodyWeightState, statedKg: number, now: Date): BodyWeightState {
  const known = [state.current, ...state.alsoKnown].filter((entry): entry is ResolvedWeight => entry !== null);
  return resolveBodyWeight({
    userStatedKg: statedKg,
    weighIns: known.filter((entry) => entry.origin === "WEIGH_IN" && entry.measuredOn).map((entry) => ({ kg: entry.valueKg, date: entry.measuredOn! })),
    profileKg: known.find((entry) => entry.origin === "PROFILE")?.valueKg ?? null,
    now,
  });
}

export function resolveBodyWeight(input: {
  /** A bodyweight the user stated or corrected in this chat (context working set), already in kg. */
  userStatedKg?: number | null;
  weighIns?: ReadonlyArray<{ kg: number; date: string }>;
  profileKg?: number | null;
  now: Date;
}): BodyWeightState {
  const candidates: ResolvedWeight[] = [];
  const stated = input.userStatedKg ?? null;
  if (stated !== null && stated > 0) candidates.push({ valueKg: stated, origin: "USER_CORRECTION", temporal: "CURRENT", freshness: "FRESH", measuredOn: null, ageDays: 0 });
  const weighIns = [...(input.weighIns ?? [])]
    .filter((entry) => entry.kg > 0 && Number.isFinite(Date.parse(entry.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .map((entry): ResolvedWeight => {
      const ageDays = Math.max(0, Math.floor((input.now.getTime() - Date.parse(entry.date)) / DAY));
      return { valueKg: entry.kg, origin: "WEIGH_IN", temporal: "CURRENT", freshness: freshnessOf(ageDays), measuredOn: entry.date.slice(0, 10), ageDays };
    });
  const profile = input.profileKg && input.profileKg > 0 ? { valueKg: input.profileKg, origin: "PROFILE" as const, temporal: "CURRENT" as const, freshness: "UNDATED" as const, measuredOn: null, ageDays: null } : null;

  const latest = weighIns[0];
  const ordered: ResolvedWeight[] = [
    ...candidates,
    ...(latest && latest.freshness !== "STALE" ? [latest] : []),
    ...(profile ? [profile] : []),
    ...(latest && latest.freshness === "STALE" ? [latest] : []),
    ...weighIns.slice(1),
  ];
  const [current, ...rest] = ordered;
  if (!current) return { available: false, current: null, alsoKnown: [], rule: "No bodyweight is known. Do not assume one; ask if a per-kg number is needed." };
  const alsoKnown = rest.filter((entry) => entry !== current).slice(0, 3).map((entry) => ({ ...entry, temporal: "HISTORICAL" as const }));
  const rule =
    current.origin === "USER_CORRECTION"
      ? `Use ${current.valueKg} kg — the user stated it in this chat, which outranks the stored profile and older weigh-ins. Every per-kg number this turn uses ${current.valueKg} kg. Stored nutrition targets were set from the older stored weight, not from ${current.valueKg} kg: if you mention one, say that and compare it honestly, never call it "within range" unless the numbers show it. Do not claim the profile was updated.`
      : current.origin === "WEIGH_IN" && current.freshness !== "STALE"
        ? `Use ${current.valueKg} kg — the latest weigh-in (${current.measuredOn}, ${current.ageDays} days ago). It outranks the static profile value.`
        : current.origin === "PROFILE"
          ? `Use ${current.valueKg} kg from the profile. It is an undated profile field: never call it current, recent or up to date.`
          : `The only weight is a weigh-in from ${current.measuredOn} (${current.ageDays} days ago): say "your last weigh-in, on ${current.measuredOn}, was ${current.valueKg} kg" — never "your current weight is" — and ask for today's weight if a per-kg number matters.`;
  return { available: true, current, alsoKnown, rule };
}

/** The plan formula re-run at a weight stated in chat, beside the saved plan's numbers (computed from the stored weight). */
export type PlanTargetsAtCurrentWeight = {
  basisKg: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  storedFromKg: number;
  storedCalories: number;
  storedProteinG: number;
};

/**
 * H1-WEIGHT / H1-LM numeric provenance: while the user's stated weight differs from the stored one, a saved-plan number
 * (SAVED_NUTRITION_TARGET, computed from the stored weight) may appear only attributed to that stored weight, and never
 * as fitting a range computed at the stated weight. A sentence that breaks this is replaced by the canonical provenance
 * statement (once); a reply that never gives the numbers at the stated weight gets them. Deterministic; nothing is saved.
 */
export function withCurrentWeightTargets(reply: string, t: PlanTargetsAtCurrentWeight | undefined, language: "en" | "vi"): string {
  if (!t) return reply;
  const number = (n: number) => String.raw`(?<![\d.,])(?:${n}|${String(n).replace(/\B(?=(\d{3})+$)/g, ",")})(?![\d])`;
  const savedNumber = new RegExp(`${number(t.storedCalories)}|${number(t.storedProteinG)}`);
  const storedWeight = new RegExp(String.raw`(?<![\d.])${t.storedFromKg}\s?(?:kg|kí|ký|can)`, "i");
  // Claims that put the saved number inside, on, or near a range computed at the stated weight (EN + VI).
  const fitsRange = /\b(?:within|in (?:this|that|the|your) range|on the (?:higher|upper|high) end|at the (?:top|upper end)|(?:slightly|a bit|bit) (?:above|over)|fits?|aligns?|aligned|matches|consistent with|in line with|appropriate for|suitable for|based on your current|for your current|calculated for|set for|trong (?:khoang|khoảng)|phù hợp|phu hop|nằm trong|nam trong)\b/i;
  const canonical = language === "vi"
    ? `Mục tiêu đã lưu (${t.storedCalories} kcal, ${t.storedProteinG} g protein) được tính từ cân nặng cũ ${t.storedFromKg} kg, không phải từ ${t.basisKg} kg; ở ${t.basisKg} kg, cùng công thức kế hoạch cho khoảng ${t.calories} kcal và ${t.proteinG} g protein mỗi ngày (chưa lưu cho đến khi bạn cập nhật cân nặng trong hồ sơ).`
    : `Your saved targets (${t.storedCalories} kcal, ${t.storedProteinG} g protein) were calculated from your stored ${t.storedFromKg} kg, not from ${t.basisKg} kg; at ${t.basisKg} kg the same plan formula gives about ${t.calories} kcal and ${t.proteinG} g protein a day (not saved until you update your profile weight).`;
  // The other direction: the number at the stated weight presented as what the SAVED plan says ("your nutrition plan targets
  // 120 g") — nothing was saved. Naming the stated weight in the sentence makes it the honest recomputed target.
  const currentNumber = new RegExp(`${number(t.calories)}|${number(t.proteinG)}`);
  const basisWeight = new RegExp(String.raw`(?<![\d.])${t.basisKg}\s?(?:kg|kí|ký|can)`, "i");
  const planClaim = /\b(?:(?:nutrition|meal|current|saved|your) )?plan(?:'s)? (?:currently |now |still )?(?:targets?|sets?|calls for|says|is set|has you)|\bsaved (?:targets?|plan)|\btarget (?:is )?(?:currently |now )?(?:set|stands) at\b|kế hoạch dinh dưỡng (?:hiện tại )?(?:đặt|là|nhắm)|mục tiêu đã lưu/i;
  // Nothing was saved: "your weight is now officially set at 60 kg" (H1 M05) claims a profile change that did not happen.
  const weightSetClaim = /\b(?:body ?)?weight\b[^.!?\n]{0,40}\b(?:(?:has been|is now|now|officially|been) (?:officially )?(?:set|updated|saved|changed|recorded|noted)|(?:was|got) (?:set|updated|saved|changed))\b|\b(?:i'?ve|i have) (?:set|updated|saved|changed|recorded) your (?:body ?)?weight\b|cân nặng[^.!?\n]{0,30}đã (?:được )?(?:cập nhật|lưu)/i;
  const negated = /\b(?:not|can'?t|cannot|haven'?t|hasn'?t|nothing|isn'?t|until|chưa|không)\b/i;
  const weightLine = language === "vi"
    ? `Mình dùng ${t.basisKg} kg cho cuộc trò chuyện này; cân nặng đã lưu trong hồ sơ (${t.storedFromKg} kg) chưa thay đổi.`
    : `I'll use ${t.basisKg} kg for this conversation; your saved profile weight (${t.storedFromKg} kg) hasn't changed.`;
  reply = reply.replace(/(?:[^.!?\n]|[.!?](?=\S))+[.!?]*/g, (sentence) =>
    weightSetClaim.test(sentence) && !negated.test(sentence) ? `${sentence.match(/^\s*/)![0]}${weightLine}` : sentence);
  let replaced = false;
  // A sentence ends at . ! ? followed by whitespace or the end — "2.0 g/kg" stays one sentence.
  reply = reply.replace(/(?:[^.!?\n]|[.!?](?=\S))+[.!?]*/g, (sentence) => {
    const recomputedAsSaved = currentNumber.test(sentence) && planClaim.test(sentence) && !basisWeight.test(sentence) && !savedNumber.test(sentence);
    if (!recomputedAsSaved && (!savedNumber.test(sentence) || (storedWeight.test(sentence) && !fitsRange.test(sentence)))) return sentence;
    if (replaced) return "";
    replaced = true;
    return `${sentence.match(/^\s*/)![0]}${canonical}`;
  }).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const says = (n: number) => new RegExp(number(n)).test(reply);
  if (replaced || !(says(t.storedCalories) || says(t.storedProteinG)) || says(t.calories) || says(t.proteinG)) return reply;
  const line = language === "vi"
    ? `Ở ${t.basisKg} kg, cùng công thức kế hoạch cho khoảng ${t.calories} kcal và ${t.proteinG} g protein mỗi ngày; mục tiêu đã lưu (${t.storedCalories} kcal, ${t.storedProteinG} g) vẫn tính theo ${t.storedFromKg} kg cho đến khi bạn cập nhật cân nặng trong hồ sơ.`
    : `At ${t.basisKg} kg, the same plan formula gives about ${t.calories} kcal and ${t.proteinG} g protein a day; your saved targets (${t.storedCalories} kcal, ${t.storedProteinG} g) still use ${t.storedFromKg} kg until you update your profile weight.`;
  return `${reply}\n\n${line}`;
}
