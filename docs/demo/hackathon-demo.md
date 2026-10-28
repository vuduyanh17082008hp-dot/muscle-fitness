# Hackathon demo — 2 November 2026

Localhost demo against the local Supabase stack. It is not a deployed build.

## Reset the demo data (safe, local only)

```bash
# from the repo root, with .env.local pointing at the LOCAL stack (http://127.0.0.1:…)
DEMO_PASSWORD='<pick a password, 12+ chars>' npx tsx scripts/demo/seed-demo.ts
```

- The script refuses to run unless `NEXT_PUBLIC_SUPABASE_URL` is a localhost URL.
- It only touches the account `demo.athlete@muscle-fitness.local`. Override it with `DEMO_EMAIL`; set the profile timezone with `DEMO_TIMEZONE` (default `Asia/Singapore`).
- Running it again deletes and rebuilds that one account, so it is safe to run between rehearsals and right before the demo.
- Seeded data is fictional: "Maya Chen", plan "Strength Foundations" (Full Body A/B/C), and 4 completed sessions over the last ~10 days.
- There are 6 check-ins, all without pain, scored by the app's own engine. Yesterday's meals plus one breakfast today are entered manually.
- Today has **no check-in and no session**, so the demo does both live.

## Demo sequence (3–5 minutes)

1. **Login → Today.** Sign in as the demo athlete. Today shows "Next in your plan: Full Body B", a recovery check-in prompt, and Fuel 390 kcal from today's breakfast.
2. **Recovery → check-in.** Open Recovery and complete the check-in with no pain. Show the single verdict, the "From today's check-in" signals and the 7-day trend.
3. **Workout.** Go back to Today and tap Start Workout. Log two sets (the carry-forward hint fills the values), then tap Complete workout → Finish Anyway. You land on History, which now shows the new session.
4. **Nutrition.** Tap Add food and search "chicken breast". If USDA/Open Food Facts are unreachable, the honest outage notice plus local fallback results appear. Pick one, set 150 g, then Add to Today. Edit the portion, delete it, and point out that the Nutrition Coach strip updates each time.
5. **Dante.** Ask *"What should I focus on for the rest of today?"*. The reply streams in. Go to Nutrition and back, and the same conversation is restored.
6. **Progress and Calendar.** The new session appears in this week's totals and under Today in the Calendar.
7. **Settings.** Open the menu, then Settings. Every row opens a real page.

### Optional safety moment

Redo the check-in with **Unusual pain or illness: Yes**. Recovery says "Recovery first today", Start disappears everywhere, and the server refuses a start.

### If something external is down

- Food search falls back to local data with a visible outage notice.
- Dante shows "couldn't complete that response" with Retry.
- Never claim live provider data that isn't there.

## Known limits

- Real iOS/Android keyboard behaviour has not been tested.
- The production build is unverified: it needs a real HTTPS Supabase project, because the build guard rejects the local http URL by design.
- The `start_workout` database RPC is still directly callable by a signed-in user over PostgREST. The training-hold check lives in the app server (Start action, Dante tool, adjustment apply), not in the database.
