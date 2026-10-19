import { it } from "vitest";
import { stripCustomerService } from "@/lib/dante-core/coherence/style";
it("cs", () => {
  for (const t of ["Recovery matters. If you have specific questions about training, nutrition, or recovery, feel free to ask!", "Your weight is 80 kg. If you have any specific goals or questions related to your training, feel free to share!", "Line one.\nI hope this helps. Keep training.", "Feel free to ask about form. Squat deep."]) console.error(JSON.stringify(stripCustomerService(t)));
});
