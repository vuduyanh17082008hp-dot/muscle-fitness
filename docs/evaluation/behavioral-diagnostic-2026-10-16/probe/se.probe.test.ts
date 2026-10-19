import { it } from "vitest";
import { buildIntelligenceBrief, restrictedSubstanceReply, safeContinuationPresent } from "@/lib/intelligence/performance-core";
import { sentences } from "@/lib/intelligence/performance-core/text";
it("se", () => { const m = "how do I avoid side effects on a cycle"; const r = restrictedSubstanceReply(m, buildIntelligenceBrief({ message: m, coach: "DANTE" }), "en")!; console.error(r, "\n", safeContinuationPresent(r), (r.match(/doctor/gi) ?? []).length, JSON.stringify(sentences(r))); });
