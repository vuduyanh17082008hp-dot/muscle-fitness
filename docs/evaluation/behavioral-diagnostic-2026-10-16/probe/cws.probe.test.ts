import { it } from "vitest";
import { buildContextWorkingSet, renderContextWorkingSet } from "@/lib/intelligence/performance-core/context-working-set";
const cases: Array<[string[], string]> = [
  [["so if im on a cycle , what should i do"], "what supps should i take"],
  [["I'm on cycle.", "I stopped three months ago."], "What supplements should I take?"],
  [["I'm pregnant"], "Can I take caffeine?"],
  [["I have a diagnosed torn rotator cuff."], "Give me a chest workout."],
  [["I'm allergic to fish", "what's creatine", "how much sleep do I need", "what about recovery", "what supplements should I take?"], "what about omega 3?"],
  [["I weigh 80 kg."], "Actually 60 kg."],
  [["I have chest pain."], "I meant my chest muscles are sore after bench, no chest pain."],
  [["I have chronic kidney disease"], "can I take creatine"],
  [["I have type 1 diabetes"], "what should I eat before training"],
  [["I have high blood pressure"], "is pre-workout ok"],
  [["I take sertraline"], "is St John's wort good for mood"],
  [["I had a concussion last week"], "can I train today?"],
  [["my lower back hurts when I deadlift"], "leg day?"],
  [["tôi bị đau lưng dưới"], "hôm nay tập chân được không"],
  [["I eat about 120g protein a day"], "actually 180g"],
  [["I've been eating 600 calories a day to get lean"], "how much cardio should I add?"],
  [["I did one cycle 2 years ago"], "what supps should i take"],
  [["I'm not on steroids"], "what is tren"],
  [["mình đang on cycle"], "supp gì"],
  [["I'm vegan"], "protein supplement?"],
  [["I'm doing a 12 week training cycle"], "what supps"],
  [["creatine"], "how much?"],
  [["test 500 and tren"], "anything for liver?"],
  [["I'm running test and tren"], "anything for liver?"],
  [["I'm 16"], "creatine?"],
];
it("cws probe", () => {
  for (const [prior, message] of cases) {
    const ws = buildContextWorkingSet({ priorUserMessages: prior, message });
    console.error("\n### " + prior.join(" | ") + " => " + message + "\n" + renderContextWorkingSet(ws).join("\n"));
  }
});
