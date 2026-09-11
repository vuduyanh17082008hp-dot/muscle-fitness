export type RecoveryKnowledgeCategory =
  | "Recovery Factors"
  | "Health Conditions"
  | "Psychological Factors"
  | "Sleep"
  | "Training Load"
  | "Lifestyle"

export type RecoveryKnowledgeTopic = {
  id: string
  title: string
  category: RecoveryKnowledgeCategory
  whyItMatters: string
  trainingImpact: string
  practicalActions: string[]
  askDantePrompt: string
}

export const recoveryKnowledgeTopics: RecoveryKnowledgeTopic[] = [
  {
    id: "sleep-and-recovery",
    title: "Sleep & Recovery",
    category: "Sleep",
    whyItMatters:
      "Sleep is when most physical repair, hormone regulation and nervous-system recovery happens.",
    trainingImpact:
      "Consistently short or poor-quality sleep can blunt strength, slow recovery between sessions and increase perceived effort.",
    practicalActions: [
      "Protect a consistent sleep and wake time",
      "Keep the last hour before bed low-stimulation",
      "Treat 7–9 hours as the working target, not a luxury",
    ],
    askDantePrompt: "Explain how sleep affects recovery and training performance, with evidence.",
  },
  {
    id: "sleep-deprivation-performance",
    title: "Sleep Deprivation & Performance",
    category: "Sleep",
    whyItMatters:
      "Even a few nights of restricted sleep can measurably affect reaction time, decision-making and submaximal endurance.",
    trainingImpact:
      "Expect technique and pacing to suffer more than raw strength after one bad night — plan accordingly rather than pushing through blindly.",
    practicalActions: [
      "Lower session intensity expectations after poor sleep",
      "Prioritise sleep before adding more training volume",
      "Track sleep alongside performance to see your own pattern",
    ],
    askDantePrompt: "How does sleep deprivation affect athletic and strength performance?",
  },
  {
    id: "stress-and-adaptation",
    title: "Stress & Adaptation",
    category: "Psychological Factors",
    whyItMatters:
      "Training is a stressor; life stress adds to the same overall load your body has to recover from.",
    trainingImpact:
      "High life stress alongside high training stress can slow adaptation and raise injury risk even with a good program.",
    practicalActions: [
      "Treat total stress, not just training stress, as the variable to manage",
      "Use lighter or technique-focused sessions during high-stress weeks",
      "Build brief stress-check-ins into your routine",
    ],
    askDantePrompt: "How does psychological stress affect training adaptation and recovery?",
  },
  {
    id: "fatigue-training-load",
    title: "Fatigue & Training Load",
    category: "Training Load",
    whyItMatters:
      "Fatigue is the accumulated cost of recent training, sleep and life stress — it is normal, but needs to be managed.",
    trainingImpact:
      "Unmanaged fatigue accumulation is one of the most common paths to stalled progress and injury.",
    practicalActions: [
      "Expect fatigue to rise across a training block and fall after a deload",
      "Distinguish normal session fatigue from fatigue that persists for days",
      "Adjust volume before adjusting intensity when fatigue is high",
    ],
    askDantePrompt: "How should I manage fatigue and training load over a training block?",
  },
  {
    id: "soreness-vs-injury",
    title: "Soreness vs Injury",
    category: "Recovery Factors",
    whyItMatters:
      "Normal muscle soreness (DOMS) and injury pain feel different and need different responses.",
    trainingImpact:
      "Training through injury pain by mistaking it for normal soreness is a common cause of setbacks.",
    practicalActions: [
      "Expect DOMS to be dull, symmetric and fade within 2–4 days",
      "Treat sharp, one-sided, or joint-specific pain as a signal to modify training",
      "When unsure, reduce load and reassess rather than pushing through",
    ],
    askDantePrompt: "What's the difference between normal muscle soreness and injury pain?",
  },
  {
    id: "overreaching-overtraining",
    title: "Overreaching & Overtraining",
    category: "Training Load",
    whyItMatters:
      "Short-term overreaching is a normal part of training; overtraining is a deeper, longer-lasting state of impaired recovery.",
    trainingImpact:
      "Persistent performance decline, elevated resting heart rate, mood changes and poor sleep together are warning signs worth acting on.",
    practicalActions: [
      "Watch for a cluster of signals, not just one bad session",
      "Plan deliberate lighter weeks before fatigue forces one on you",
      "Treat persistent, multi-week decline as a reason to seek professional guidance",
    ],
    askDantePrompt: "What are the warning signs of overreaching or overtraining?",
  },
  {
    id: "mental-wellbeing-exercise",
    title: "Mental Wellbeing & Exercise",
    category: "Psychological Factors",
    whyItMatters:
      "Training interacts closely with mood, motivation and stress regulation — in both directions.",
    trainingImpact:
      "Low mood or motivation can be a recovery signal, not just a mindset issue — it belongs in the same picture as sleep and soreness.",
    practicalActions: [
      "Log mood alongside physical recovery metrics",
      "Use lighter, enjoyable sessions to maintain consistency during low-motivation periods",
      "Treat persistent low mood as a cue to check in with a professional, not only train through it",
    ],
    askDantePrompt: "How does exercise relate to mood and mental wellbeing?",
  },
  {
    id: "illness-return-to-training",
    title: "Illness & Return to Training",
    category: "Health Conditions",
    whyItMatters:
      "Training through illness can prolong recovery and, in some cases, carries real risk.",
    trainingImpact:
      "A cautious, staged return after illness protects long-term progress far more than resuming at full intensity immediately.",
    practicalActions: [
      "Rest during fever, chest symptoms or whole-body illness",
      "Return gradually, starting well below your previous training load",
      "Seek medical guidance before resuming intense training after significant illness",
    ],
    askDantePrompt: "How should I safely return to training after being sick?",
  },
  {
    id: "hydration",
    title: "Hydration",
    category: "Lifestyle",
    whyItMatters:
      "Hydration status affects performance, thermoregulation and how hard a session feels.",
    trainingImpact:
      "Even mild dehydration can raise perceived exertion and reduce output in longer or hotter sessions.",
    practicalActions: [
      "Drink to thirst across the day rather than relying on session-time only",
      "Increase fluid attention around long, hot or high-sweat sessions",
      "Use consistent bodyweight or urine-colour checks rather than guessing",
    ],
    askDantePrompt: "How does hydration affect training performance and recovery?",
  },
  {
    id: "alcohol",
    title: "Alcohol",
    category: "Lifestyle",
    whyItMatters:
      "Alcohol affects sleep quality, hydration and next-day training readiness more than most people expect.",
    trainingImpact:
      "Even moderate evening drinking is commonly linked with lighter, more fragmented sleep and reduced next-day readiness.",
    practicalActions: [
      "Notice how alcohol affects your own sleep and next-day check-in scores",
      "Avoid alcohol close to important training sessions",
      "Treat it as a recovery variable worth tracking, not a taboo topic",
    ],
    askDantePrompt: "How does alcohol affect sleep and recovery?",
  },
  {
    id: "caffeine-sleep",
    title: "Caffeine & Sleep",
    category: "Lifestyle",
    whyItMatters:
      "Caffeine's half-life means afternoon intake can still be affecting sleep onset and quality at night.",
    trainingImpact:
      "Poor sleep from late caffeine can quietly undercut the next day's recovery score even when training itself was fine.",
    practicalActions: [
      "Set a personal caffeine cut-off time in the early-to-mid afternoon",
      "Watch for a pattern between late caffeine and lower sleep-quality scores",
      "Use caffeine deliberately around key sessions rather than out of habit",
    ],
    askDantePrompt: "How late can I have caffeine without affecting my sleep?",
  },
  {
    id: "rest-days",
    title: "Rest Days",
    category: "Recovery Factors",
    whyItMatters:
      "Rest days are where a meaningful share of adaptation actually consolidates, not wasted time.",
    trainingImpact:
      "Consistently skipping rest days is one of the more common, avoidable causes of stalled progress.",
    practicalActions: [
      "Schedule rest days rather than taking them only when forced to",
      "Use active recovery (walking, light mobility) rather than full inactivity if preferred",
      "Treat a rest day as productive, not a day off from the plan",
    ],
    askDantePrompt: "How many rest days do I actually need per week?",
  },
  {
    id: "deloads",
    title: "Deloads",
    category: "Training Load",
    whyItMatters:
      "A deload is a planned reduction in training stress that lets accumulated fatigue dissipate before it forces a bigger setback.",
    trainingImpact:
      "Used well, a deload protects long-term progress; used poorly (too rare, too late) it often arrives as an injury instead.",
    practicalActions: [
      "Plan a lighter week roughly every 4–8 weeks depending on intensity and experience",
      "Reduce volume and/or intensity rather than stopping training entirely",
      "Use persistent fatigue, soreness and falling recovery scores as an earlier trigger than a fixed calendar date",
    ],
    askDantePrompt: "When should I take a deload week?",
  },
  {
    id: "pain-training-modification",
    title: "Pain & Training Modification",
    category: "Health Conditions",
    whyItMatters:
      "Pain is information. Working around it intelligently is usually better than either ignoring it or stopping all training.",
    trainingImpact:
      "Blanket rest is rarely necessary for minor, localised pain — but escalating, sharp or radiating pain needs a different response.",
    practicalActions: [
      "Modify exercise selection and range before removing training entirely",
      "Track whether pain trends better or worse across sessions",
      "Seek professional evaluation for pain that is worsening, sharp, or affects daily function",
    ],
    askDantePrompt: "How should I modify training around pain without making it worse?",
  },
]

export const recoveryKnowledgeCategories: RecoveryKnowledgeCategory[] = [
  "Sleep",
  "Recovery Factors",
  "Training Load",
  "Psychological Factors",
  "Health Conditions",
  "Lifestyle",
]
