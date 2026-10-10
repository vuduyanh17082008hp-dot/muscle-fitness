/** Quick actions are plain messages that go through the SAME pipeline as typed text. Client-safe (no imports). */
export const QUICK_ACTIONS: Array<{ label: string; message: string }> = [
  { label: "Build a high-protein meal", message: "Help me decide what to eat next with a focus on protein." },
  { label: "Use my remaining macros", message: "What meal best fits my remaining calories and protein today?" },
  { label: "Meal under 500 calories", message: "Help me build a meal under 500 calories." },
  { label: "Help me hit my protein target", message: "Help me hit my protein target with my next meal." },
  { label: "Make this meal tastier", message: "Make the active meal draft tastier without breaking my constraints." },
  { label: "Make this cheaper", message: "Make the active meal draft cheaper without breaking my constraints." },
  { label: "Make this more filling", message: "Make the active meal draft more filling without breaking my constraints." },
  { label: "Craving chocolate cereal", message: "I'm craving chocolate cereal. Help me satisfy it while staying on track." },
  { label: "Build protein ice cream", message: "I'm craving protein ice cream. Help me satisfy it while staying on track." },
]

