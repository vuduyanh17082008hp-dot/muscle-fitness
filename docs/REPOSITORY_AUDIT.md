# Muscle Fitness — Repository Audit & Delivery Status

**Updated:** 2026-08-05  
**Source of truth:** Root Next.js app (`app/`, `components/`, `lib/`, `features/`, `supabase/`)  
**Nested scaffold excluded:** `muscle-fitness/` (Project 09 copy; excluded from `tsconfig`)

---

## How to run

See **[RUN_LOCAL.md](./RUN_LOCAL.md)**.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Phase delivery status (this session)

| Phase | Status | What shipped |
|---|---|---|
| 1. Build / TypeScript | Done for root | Nested app excluded; story/plan-builder/motion/RPC typing fixed; deps declared |
| 2. Auth | Stabilized | `/auth/callback` accepts publishable or anon key; redirects to `/login` |
| 3. Database types | Improved | RPC function map expanded in `types/app-database.types.ts` |
| 4. Onboarding | Preserved | Existing wizard left intact |
| 5. Dashboard data | Improved | Nav sections no longer 404; real targets shown on nutrition/progress/today |
| 6. Workout system | Wired | Session mutations + API routes for save/skip/replace/finish |
| 7. Nutrition | Partial | Dashboard nutrition shows real targets; meal-plan calculator still client-side |
| 8. Progress | Partial | Progress section + `/api/progress` weight update path |
| 9. AI Coach | Partial | Honest coach pages + chatbot; not full OpenAI production coach |
| 10. Google | Preserved | Existing Drive sync left intact |
| 11. Polish | Partial | Invalid next.config; run docs exported |

---

## Critical architecture notes

1. Do **not** develop inside nested `muscle-fitness/` for the live app.
2. Workout player actions call server mutations in `lib/workouts/session-mutations.ts`.
3. Schema drift between Project 09 SQL and later migrations may still affect some column names at runtime — verify against your live Supabase project.
4. Landing `/images/*` assets may still be missing from `public/`.

---

## Validation

```bash
npm run type-check
npm run lint
npm run build
```

Type-check target: root app only (nested folder excluded).
