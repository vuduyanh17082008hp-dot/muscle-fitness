# Dự án 09 — Workout system

**Trạng thái backend:** có lớp lưu trữ local JSON chạy ngay; schema Supabase sẵn sàng khi bạn bật DB thật.

**Luồng hoàn thành (Definition of Done):**

```text
Open workout
→ Log every set
→ Complete workout
→ Save database
→ View history
→ Receive next-session recommendation
```

---

## 1. Tổng quan module

| Khối | Chức năng |
|------|-----------|
| **Exercise library** | Tên bài, nhóm cơ chính/phụ, equipment, difficulty, instructions, technique cues, video/ảnh, contraindications |
| **Workout plan builder** | Tạo plan, chia ngày, chọn bài, sets, rep range, RIR/RPE, rest, tempo, coach notes, kéo thả, duplicate day |
| **Workout player** | Start, danh sách bài, previous result, nhập weight/reps/RIR, complete set, rest timer, skip/replace, finish |
| **Progression** | Volume load, weekly sets/muscle, PR, estimated 1RM, progressive overload recommendation, deload marker, adherence |

---

## 2. Cấu trúc cần đặt vào project

```text
muscle-fitness/
├── data/                          # runtime DB local (gitignore) — workout-db.json
├── supabase/
│   └── migrations/
│       └── 20260804141000_project_09_workout_system.sql
├── docs/
│   └── PROJECT_09_WORKOUT_SYSTEM.md
└── src/
    ├── proxy.ts                   # Next.js 16 proxy (auth/session sau này)
    ├── app/
    │   ├── docs/
    │   │   └── workout-system/
    │   │       └── page.tsx       # Hướng dẫn đọc trên web
    │   ├── api/
    │   │   ├── exercises/route.ts
    │   │   ├── plans/
    │   │   │   ├── route.ts
    │   │   │   └── [id]/route.ts
    │   │   ├── sessions/
    │   │   │   ├── route.ts
    │   │   │   └── [id]/
    │   │   │       ├── route.ts
    │   │   │       └── actions/route.ts
    │   │   └── progress/route.ts
    │   └── dashboard/
    │       ├── page.tsx           # Overview + deep link luồng 09
    │       ├── workouts/page.tsx  # Open workout
    │       ├── plans/
    │       │   ├── page.tsx
    │       │   └── [id]/page.tsx # Plan builder
    │       ├── exercises/page.tsx
    │       ├── workout/[id]/page.tsx  # Workout player
    │       ├── history/page.tsx
    │       └── progress/page.tsx
    └── features/
        └── workout/
            ├── schema.ts          # Zod validate
            ├── types.ts
            ├── calculations.ts    # 1RM, volume, recommendation
            ├── seed.ts            # Exercise library + plan mẫu
            ├── store.ts           # Save database (JSON local)
            ├── actions.ts         # Server Actions
            ├── exercise-library.tsx
            ├── plan-builder.tsx
            ├── start-workout-panel.tsx
            ├── workout-player.tsx
            └── rest-timer.tsx
```

---

## 3. Cài đặt & chạy

```bash
npm install
cp .env.example .env.local   # tùy chọn — Supabase/Stripe/OpenAI sau
npm run dev
```

Mở:

- App workout: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- Hướng dẫn web: [http://localhost:3000/docs/workout-system](http://localhost:3000/docs/workout-system)

**Lưu ý:** Mặc định dữ liệu ghi vào `data/workout-db.json` (không cần Supabase để demo đủ luồng).

---

## 4. Exercise library

**Route:** `/dashboard/exercises`

Mỗi bài tập (`Exercise`) gồm:

- `name`
- `primaryMuscle` / `secondaryMuscles[]`
- `equipment` · `difficulty`
- `instructions[]` · `techniqueCues[]`
- `mediaUrl` / `mediaType` (`image` | `video`)
- `contraindications[]`

Seed sẵn trong `src/features/workout/seed.ts` (bench, squat, RDL, row, …).

API:

- `GET /api/exercises`
- `POST /api/exercises` — upsert

---

## 5. Workout plan builder

**Routes:** `/dashboard/plans` · `/dashboard/plans/[id]`

Trong builder bạn có thể:

1. Đặt tên / mô tả plan  
2. Thêm ngày tập · **Duplicate workout day**  
3. **Chọn bài** từ library  
4. Sửa **sets**, **rep min/max**, **RIR**, **RPE**, **rest (s)**, **tempo**, **coach notes**  
5. **Kéo thả** (HTML5 DnD) hoặc nút ↑↓ để đổi thứ tự  
6. **Save plan** → `PUT /api/plans/:id` (hoặc `savePlanAction`)

Plan mẫu: **Push / Pull / Legs** được seed lần đầu.

---

## 6. Workout player (log set)

**Routes:** `/dashboard/workouts` (open) → `/dashboard/workout/[sessionId]` (player)

### 6.1 Open workout

1. Chọn **plan** + **day**  
2. Bấm **Start workout**  
3. Server tạo `WorkoutSession` (`in_progress`), prefill sets, gắn **previous best** nếu có  

### 6.2 Log every set

Với từng set:

- Nhập **weight (kg)**  
- Nhập **reps**  
- Nhập **RIR**  
- Bấm **Complete set** → lưu DB + bật **rest timer**  

Khác:

- **Skip exercise**  
- **Replace exercise** (đổi bài trong session)  
- Xem **previous result** trên đầu bài  

### 6.3 Finish workout

Bấm **Finish workout** → `status: completed` + `completedAt` → sinh **next-session recommendation**.

---

## 7. Progression

**Route:** `/dashboard/progress`

| Metric | Cách tính (rút gọn) |
|--------|---------------------|
| Volume load | `Σ weight × reps` các set completed |
| Weekly sets / muscle | primary = 1 set, secondary = 0.5 set |
| Estimated 1RM | Epley: `w × (1 + reps/30)` |
| Personal record | Max e1RM theo bài |
| Overload recommendation | Hit top rep range + RIR ≥ 2 → gợi ý +2.5 kg |
| Deload marker | Nhiều set RIR ≈ 0 hoặc e1RM giảm >5% |
| Adherence | `completed / all sessions × 100` |

Logic: `src/features/workout/calculations.ts`.

---

## 8. Save database

### 8.1 Local (mặc định — dùng ngay)

- File: `data/workout-db.json`  
- CRUD qua `src/features/workout/store.ts`  
- API REST + Server Actions (`actions.ts`) cùng gọi store  

### 8.2 Supabase (khi sẵn sàng)

1. Tạo project Supabase  
2. Chạy migration:

```bash
# SQL Editor hoặc CLI
supabase db push
# hoặc paste file:
# supabase/migrations/20260804141000_project_09_workout_system.sql
```

3. Điền `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

4. (Bước tiếp) thay `store.ts` bằng repository Supabase — schema đã khớp bảng: `exercises`, `workout_plans`, `workout_days`, `plan_exercises`, `workout_sessions`, `session_exercises`, `logged_sets`.

---

## 9. Checklist hoàn thành (DoD)

Làm lần lượt trên UI:

| # | Bước | Chỗ bấm |
|---|------|---------|
| 1 | Open workout | Dashboard → **Open workout** → Start |
| 2 | Log every set | Player → weight / reps / RIR → **Complete set** |
| 3 | Complete workout | **Finish workout** |
| 4 | Save database | Tự động (`data/workout-db.json`) |
| 5 | View history | **History** |
| 6 | Next-session recommendation | Mở lại session đã completed / màn hình sau Finish |

Khi 6 bước trên chạy được end-to-end → **Dự án 09 đạt DoD**.

---

## 10. Server Actions & API nhanh

**Actions** (`src/features/workout/actions.ts`):

- `createPlanAction` · `savePlanAction` · `deletePlanAction`
- `startWorkoutAction`
- `logSetAction` · `skipExerciseAction` · `replaceExerciseAction`
- `completeWorkoutAction` → trả `recommendation`

**REST** (tùy client / mobile sau này):

| Method | Path | Việc |
|--------|------|------|
| GET/POST | `/api/exercises` | Library |
| GET/POST | `/api/plans` | List / create plan |
| GET/PUT/DELETE | `/api/plans/:id` | Builder save |
| GET/POST | `/api/sessions` | History / start |
| POST | `/api/sessions/:id/actions` | log_set, skip, replace, complete |
| GET | `/api/progress` | Progression JSON |

---

## 11. Gợi ý mở rộng

- Auth user_id trên Supabase (RLS đã phác trong migration)  
- Đồng bộ store JSON → Supabase repository  
- Media upload (Supabase Storage) cho video kỹ thuật  
- Export tuần (volume / sets) ra CSV  

---

*Muscle Fitness · Dự án 09 — Workout system*
