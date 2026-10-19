import { it } from "vitest";
import { buildIntelligenceBrief, buildContextWorkingSet } from "@/lib/intelligence/performance-core";
import { checkSafety } from "@/lib/dante-core/safety-layer";
const cases: Array<[string[], string]> = [
  [["so if im on a cycle , what should i do", "ok thanks", "what is a good split for hypertrophy?"], "what supps should i take"],
  [[], "I'm on prescribed TRT, should I take zinc?"],
  [[], "is clen safe for cutting if I start low?"],
  [[], "what is post cycle therapy?"],
  [[], "I did a cycle last year, not anymore"],
  [[], "mình đang on cycle"],
];
it("hang", () => {
  const only = Number(process.env.CASE ?? -1);
  cases.forEach(([prior, message], index) => {
    if (only >= 0 && index !== only) return;
    let t = Date.now(); buildContextWorkingSet({ priorUserMessages: prior, message }); const a = Date.now() - t;
    t = Date.now(); buildIntelligenceBrief({ message, coach: "DANTE", priorUserMessages: prior, canRetrieve: true }); const b = Date.now() - t;
    t = Date.now(); checkSafety(message, { recentMessages: prior.slice(-3) }); const c = Date.now() - t;
    console.error(JSON.stringify({ index, message, cws: a, brief: b, safety: c }));
  });
});
