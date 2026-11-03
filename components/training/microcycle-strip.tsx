import { createClient } from "@/lib/supabase/server";
import { resolveUserTimeZone } from "@/lib/training/load-today-session";
import { cn } from "@/lib/utils";

const WEEK = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
] as const;
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * V4 microcycle: the active plan's week as it is stored (workout_days.scheduled_weekday), with the
 * athlete's today marked. Read-only and informational — it offers no Start (Today and the session
 * page own that, behind the hold). Unscheduled days are shown as the rotation they run in.
 * A failed read renders nothing; the page's hero already reports an unknown status.
 */
export async function MicrocycleStrip({ planId, userId }: { planId: string; userId: string }) {
  const supabase = await createClient();
  const [timeZone, { data, error }] = await Promise.all([
    resolveUserTimeZone(supabase, userId),
    supabase.from("workout_days").select("name, day_order, scheduled_weekday, rest_day").eq("workout_plan_id", planId).order("day_order"),
  ]);
  const days = (data ?? []) as Array<{ name: string | null; day_order: number; scheduled_weekday: number | null; rest_day: boolean | null }>;
  if (error || days.length === 0) return null;

  const today = WEEKDAY[new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date())];
  const training = days.filter((day) => day.rest_day !== true);
  const rotation = training.filter((day) => day.scheduled_weekday === null);

  return (
    <div className="mb-4 rounded-xl border border-mf-glass-border bg-mf-glass-surface p-3 sm:p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-mf-glass-text-muted">This week</p>
      <ol className="grid grid-cols-7 gap-1">
        {WEEK.map(([weekday, label]) => {
          const day = training.find((item) => item.scheduled_weekday === weekday);
          return (
            <li
              key={label}
              aria-current={weekday === today ? "date" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-md border px-0.5 text-center",
                weekday === today ? "border-2 border-mf-glass-text" : "border-mf-glass-border",
                day ? "bg-mf-glass-bg" : "bg-transparent",
              )}
            >
              <span className="text-xs font-bold uppercase text-mf-glass-text-muted">{label}</span>
              <span className="mt-0.5 line-clamp-2 text-xs font-semibold leading-tight text-mf-glass-text">{day ? day.name ?? "Workout" : "—"}</span>
            </li>
          );
        })}
      </ol>
      {rotation.length > 0 ? (
        <p className="mt-2 text-sm text-mf-glass-text-secondary">
          Rotation (any day): {rotation.map((day) => day.name ?? "Workout").join(" → ")}
        </p>
      ) : null}
    </div>
  );
}
