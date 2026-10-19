import { it } from "vitest";
import { buildIntelligenceBrief } from "@/lib/intelligence/performance-core";
it("hist probe", () => {
  const b = buildIntelligenceBrief({ message: "what supplements?", coach: "DANTE", canRetrieve: true, priorUserMessages: ["I'm pregnant", "can I keep lifting?"] });
  console.error(JSON.stringify({ posture: b.posture, need: b.need }));
  console.error(b.promptBlock.length, b.promptBlock);
});
