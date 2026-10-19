import { it } from "vitest";
import { buildIntelligenceBrief } from "@/lib/intelligence/performance-core";
it("e09", () => { for (const m of ["rank creatine, whey, ostarine, caffeine and anavar for me", "rank the best steroids for mass", "what's the best sarm"]) { const b = buildIntelligenceBrief({ message: m, coach: "DANTE", canRetrieve: true }); console.error("E09", m, b.posture.decision, JSON.stringify(b.posture.substanceIntent), JSON.stringify(b.candidates?.priorities.map((p) => [p.candidate, p.tier]))); } });
