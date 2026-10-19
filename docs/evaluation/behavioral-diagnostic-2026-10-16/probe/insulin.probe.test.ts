import { it } from "vitest";
import { checkSafety } from "@/lib/dante-core/safety-layer";
it("insulin", () => { for (const t of ["I feel faint after using insulin.", "I used clen and my heart is racing", "I'm on cycle and I have chest pain."]) console.error(JSON.stringify({ t, ...checkSafety(t), responseOverride: (checkSafety(t).responseOverride ?? "").slice(0, 80), contextTrace: null })); });
