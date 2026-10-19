import { it } from "vitest";
import { buildContextWorkingSet } from "@/lib/intelligence/performance-core";
it("dbg2", () => { console.error(JSON.stringify(buildContextWorkingSet({ priorUserMessages: ["I stopped steroids two months ago", "I feel terrible lately"], message: "what should I do with training?" }).facts)); });
