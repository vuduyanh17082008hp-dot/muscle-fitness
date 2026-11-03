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
- Every date is relative to the day you run it, in the athlete's timezone. **Reseed on the demo day itself** (2 November, Singapore date). A seed from an earlier day leaves today's breakfast and check-in history on the wrong days.
- Seeded data is fictional: "Maya Chen", plan "Strength Foundations" (Full Body A/B/C), and 4 completed sessions over the last ~10 days.
- There are 6 check-ins, all without pain, scored by the app's own engine. Yesterday's meals plus one breakfast today are entered manually.
- Today has **no check-in and no session**, so the demo does both live.

## Demo sequence (3–5 minutes)

1. **Login → Today.** Sign in as the demo athlete. Today shows "Next in your plan: Full Body B", a recovery check-in prompt, and Fuel 390 kcal from today's breakfast.
2. **Recovery → check-in.** Open Recovery and complete the check-in with no pain. Show the single verdict, the "From today's check-in" signals and the 7-day trend.
3. **Workout.** Go back to Today and tap Start Workout. Log two sets (the carry-forward hint fills the values), then tap Complete workout → Finish Anyway. You land on History, which now shows the new session.
4. **Nutrition.** Tap Add food and search "chicken breast". If USDA/Open Food Facts are unreachable, the honest outage notice plus local fallback results appear. Pick one, set 150 g, then Add to Today. Edit the portion, delete it, and point out that the day totals update each time.
5. **Dante.** Ask *"I finished Full Body B today. What should I prioritize tonight?"*. The reply streams in. Go to Nutrition and back, and the same conversation is restored.
   - In the 28 Oct rehearsals, this question got grounded replies twice: Full Body B, protein left, kcal left.
   - Fixed 29 Oct: a "Based on my …, what should I …" question used to get a train-or-skip lead prepended ("That's not enough reason to skip. If the trip is unsafe, stay home."). That lead now only appears for real go/skip questions (`lib/dante-core/__tests__/p1-basis-question-decision.test.ts`).
   - "…the rest of today?" can be answered as if it were morning ("a protein-rich breakfast"), because Dante gets no clock time.
6. **Progress and Calendar.** The new session appears under Today in the Calendar and in this week's totals. 2 November 2026 is a Monday, so the week starts fresh: before the workout, Progress reads 0 sessions this week, and after it, 1 session. The volume comparison against last week will look low; that's expected on a Monday.
7. **Settings.** Open the menu, then Settings. Every row opens a real page.

### Optional safety moment

Redo the check-in with **Unusual pain or illness: Yes**. Recovery says "Recovery first today", Start disappears everywhere, and the server refuses a start.

### If something external is down

- Food search falls back to local data with a visible outage notice.
- If OpenAI is unreachable, Dante answers "I wasn't able to produce a fully verified answer for this one…" and invents nothing. Just ask again. If the stream itself breaks mid-reply, Dante shows "couldn't complete that response" with Retry.
- Never claim live provider data that isn't there.

## Known limits

- Real iOS/Android keyboard behaviour has not been tested.
- The production build is unverified: it needs a real HTTPS Supabase project, because the build guard rejects the local http URL by design.
- **Production blocker:** the `start_workout` database RPC is still directly callable by a signed-in user over PostgREST, bypassing the training hold. The hold check lives in the app server (Start action, Dante tool, adjustment apply), not in the database. It needs a reviewed migration before any real deployment. It is out of scope for the localhost demo.
