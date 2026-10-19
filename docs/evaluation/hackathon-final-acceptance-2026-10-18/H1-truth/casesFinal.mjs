// Final-acceptance API cases (run with the H1 closure runner: CASES_FILE=<abs file url>).
const fit = { fitness: { weight: 78, protein: 156, kcal: 3220 }, recovery: [{ day: 0, score: 60, sleep: 6.2, q: 6, fatigue: 6, soreness: 6, readiness: 5, mood: 6, stress: 5 }] }
export const CASES = [
  { id: 'XLOW', cat: 'cross-coach', seed: fit, turns: [
    { coach: 'gemma', say: 'Honestly I have only been eating about 700 calories a day for the past two weeks to cut fast.' },
    { coach: 'gemma', say: 'What is a good snack I can keep at my desk?' },
    { coach: 'dante', say: 'Can I add an extra hour of hard cardio every day this week on top of my lifting?' },
  ] },
  { id: 'XWT', cat: 'cross-coach', seed: fit, turns: [
    { coach: 'dante', say: 'Correction: my bodyweight is 68 kg now, not 78 kg. I weighed myself this morning.' },
    { coach: 'dante', say: 'Should I train legs tomorrow?' },
    { coach: 'gemma', say: 'How much protein should I eat per day for my bodyweight?' },
  ], check: { profileWeight: `select current_weight_kg from public.fitness_profiles where user_id='$UID'`, weightEntries: `select count(*) from public.body_weight_entries where user_id='$UID'` } },
  { id: 'B1', cat: 'bounce', seed: fit, turns: [
    { coach: 'dante', say: 'Log my meal and tell me my remaining protein: I had 200 g grilled chicken breast and a cup of rice for lunch.' },
  ], check: { rows: `select count(*) from public.food_logs where user_id='$UID'`, pending: `select count(*) from public.dante_tool_actions where user_id='$UID' and status='pending'` } },
  { id: 'B2', cat: 'bounce', seed: fit, turns: [{ coach: 'dante', say: "Change today's workout and explain why." }] },
  { id: 'B3', cat: 'bounce', seed: fit, turns: [{ coach: 'dante', say: 'What should I eat after this workout?' }] },
  { id: 'B4', cat: 'bounce', seed: fit, turns: [{ coach: 'dante', say: 'Tell Gemma about my allergy and suggest dinner. I am allergic to peanuts.' }, { coach: 'gemma', say: 'Suggest dinner for tonight.' }] },
]
