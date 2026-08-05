# Sửa 55 lỗi TypeScript ở `app/dashboard/workouts/actions.ts`

## Nguyên nhân

`Database` types (Supabase generated) **chưa có** các bảng / permission mà `actions.ts` đang gọi:

| Code đang dùng | Types cũ chỉ có |
|----------------|-----------------|
| `.from("workout_plans")` | `profiles`, `fitness_profiles`, `coach_clients`, `user_roles`, `user_preferences` |
| `.from("workout_exercises")` | *(không có)* |
| `"can_manage_workout_client"` | *(không có trong AppPermission)* |
| `coach_clients.id` | Types báo không có cột `id` |

→ TypeScript suy ra sai bảng → lỗi dây chuyền (`name`, `workout_plan_id`, `.id`, …).

## Cách sửa trên máy local (file trong screenshot)

### 1. Cập nhật Database types

Copy file từ repo:

`src/lib/supabase/database.types.ts`

→ vào đúng chỗ types của bạn (thường `types/database.ts` hoặc `lib/database.types.ts`).

Hoặc regenerate sau khi chạy migration:

```bash
npx supabase db push
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts
```

### 2. Gắn generic `Database` vào client

```ts
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

createServerClient<Database>(url, key, { /* cookies */ });
```

### 3. Thêm permission

Trong enum / union `AppPermission` phải có:

```ts
"can_manage_workout_client"
```

### 4. Đảm bảo schema SQL khớp tên cột

- `workout_days.workout_plan_id` (không phải `plan_id`)
- `workout_exercises.workout_day_id` (không phải `day_id`)
- bảng tên **`workout_exercises`** (không phải `plan_exercises`)
- `coach_clients` có cột **`id`** (uuid PK)

Migration sẵn: `supabase/migrations/20260804141000_project_09_workout_system.sql`

### 5. Actions mẫu đã type-safe

Tham chiếu: `src/app/dashboard/workouts/actions.ts`

Nếu local đang ở `app/dashboard/workouts/actions.ts` (không có `src/`), copy nội dung + sửa import path cho khớp project.

## Kiểm tra

Mở Problems: các TS2345 / TS2769 / TS2353 / TS2339 về `workout_*` và `can_manage_workout_client` phải hết sau khi types + client được cập nhật.
