import { it } from "vitest";
import { buildIntelligenceBrief, buildContextWorkingSet } from "@/lib/intelligence/performance-core";
it("dbg", () => {
  const ws = buildContextWorkingSet({ priorUserMessages: ["I'm on a steroid cycle."], message: "What should I do?" });
  console.error(JSON.stringify(ws.facts));
  const b = buildIntelligenceBrief({ message: "What should I do?", coach: "DANTE", priorUserMessages: ["I'm on a steroid cycle."] });
  console.error(JSON.stringify(b.posture));
});
