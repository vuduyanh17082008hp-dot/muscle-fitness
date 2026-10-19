import { it } from "vitest";
import { buildIntelligenceBrief } from "@/lib/intelligence/performance-core";
it("dbg3", () => { const b = buildIntelligenceBrief({ message: "what should I do with training?", coach: "DANTE", priorUserMessages: ["I stopped steroids two months ago", "I feel terrible lately"], canRetrieve: true }); console.error("DIR", JSON.stringify(b.posture)); });
