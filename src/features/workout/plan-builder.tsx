"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type {
  Exercise,
  PlanExercise,
  WorkoutDay,
  WorkoutPlan,
} from "@/features/workout/types";
import { createId } from "@/features/workout/store-client-ids";

function newPlanExercise(exerciseId: string, order: number): PlanExercise {
  return {
    id: createId("pe"),
    exerciseId,
    order,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSeconds: 90,
    tempo: "2-0-1-0",
    coachNotes: "",
  };
}

export function PlanBuilder({
  initialPlan,
  exercises,
}: {
  initialPlan: WorkoutPlan;
  exercises: Exercise[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [activeDayId, setActiveDayId] = useState(
    initialPlan.days[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const exerciseMap = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises],
  );

  const activeDay = plan.days.find((d) => d.id === activeDayId) ?? plan.days[0];

  function updateDay(dayId: string, updater: (day: WorkoutDay) => WorkoutDay) {
    setPlan((current) => ({
      ...current,
      days: current.days.map((d) => (d.id === dayId ? updater(d) : d)),
    }));
  }

  function reorder(from: number, to: number) {
    if (!activeDay || from === to || to < 0) return;
    updateDay(activeDay.id, (day) => {
      const next = [...day.exercises].sort((a, b) => a.order - b.order);
      if (to >= next.length) return day;
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return {
        ...day,
        exercises: next.map((ex, index) => ({ ...ex, order: index })),
      };
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPlan(data.plan);
      setMessage("Plan saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function addDay() {
    const day: WorkoutDay = {
      id: createId("day"),
      name: `Day ${plan.days.length + 1}`,
      order: plan.days.length,
      exercises: [],
    };
    setPlan((current) => ({ ...current, days: [...current.days, day] }));
    setActiveDayId(day.id);
  }

  function duplicateDay(day: WorkoutDay) {
    const clone: WorkoutDay = {
      ...structuredClone(day),
      id: createId("day"),
      name: `${day.name} (copy)`,
      order: plan.days.length,
      exercises: day.exercises.map((ex, index) => ({
        ...structuredClone(ex),
        id: createId("pe"),
        order: index,
      })),
    };
    setPlan((current) => ({ ...current, days: [...current.days, clone] }));
    setActiveDayId(clone.id);
  }

  if (!activeDay) {
    return <p className="text-sm text-steel">No days yet. Add a day to start.</p>;
  }

  const sorted = [...activeDay.exercises].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1 space-y-2">
          <input
            value={plan.name}
            onChange={(e) => setPlan({ ...plan, name: e.target.value })}
            className="w-full border-b border-ink/20 bg-transparent font-display text-3xl tracking-wide text-ink outline-none"
          />
          <input
            value={plan.description}
            onChange={(e) =>
              setPlan({ ...plan, description: e.target.value })
            }
            placeholder="Plan description"
            className="w-full bg-transparent text-sm text-steel outline-none"
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-lime px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
        >
          <Save size={16} />
          {saving ? "Saving..." : "Save plan"}
        </button>
      </div>
      {message && <p className="text-sm text-steel">{message}</p>}

      <div className="flex flex-wrap gap-2">
        {plan.days
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((day) => (
            <button
              key={day.id}
              type="button"
              onClick={() => setActiveDayId(day.id)}
              className={`px-3 py-2 text-sm ${
                day.id === activeDay.id
                  ? "bg-ink text-lime"
                  : "border border-ink/15 text-ink hover:bg-mist"
              }`}
            >
              {day.name}
            </button>
          ))}
        <button
          type="button"
          onClick={addDay}
          className="inline-flex items-center gap-1 border border-dashed border-ink/30 px-3 py-2 text-sm text-steel hover:border-ink hover:text-ink"
        >
          <Plus size={14} /> Day
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={activeDay.name}
          onChange={(e) =>
            updateDay(activeDay.id, (day) => ({
              ...day,
              name: e.target.value,
            }))
          }
          className="border border-ink/15 bg-bone px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => duplicateDay(activeDay)}
          className="inline-flex items-center gap-1 border border-ink/15 px-3 py-2 text-sm hover:bg-mist"
        >
          <Copy size={14} /> Duplicate day
        </button>
      </div>

      <div className="space-y-3">
        {sorted.map((item, index) => {
          const ex = exerciseMap.get(item.exerciseId);
          return (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex === null) return;
                reorder(dragIndex, index);
                setDragIndex(null);
              }}
              className="cursor-grab border border-ink/10 bg-bone p-4 active:cursor-grabbing"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-ink">
                    {ex?.name ?? item.exerciseId}
                  </p>
                  <p className="text-xs text-steel">
                    Drag to reorder · {ex?.primaryMuscle}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => reorder(index, index - 1)}
                    className="border border-ink/10 p-1 hover:bg-mist"
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => reorder(index, index + 1)}
                    className="border border-ink/10 p-1 hover:bg-mist"
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises
                          .filter((e) => e.id !== item.id)
                          .map((e, i) => ({ ...e, order: i })),
                      }))
                    }
                    className="border border-ink/10 p-1 text-steel hover:bg-mist hover:text-ink"
                    aria-label="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
                <label className="text-xs text-steel">
                  Sets
                  <input
                    type="number"
                    min={1}
                    value={item.sets}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? { ...exItem, sets: Number(e.target.value) }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="text-xs text-steel">
                  Rep min
                  <input
                    type="number"
                    min={1}
                    value={item.repMin}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? { ...exItem, repMin: Number(e.target.value) }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="text-xs text-steel">
                  Rep max
                  <input
                    type="number"
                    min={1}
                    value={item.repMax}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? { ...exItem, repMax: Number(e.target.value) }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="text-xs text-steel">
                  RIR
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={item.targetRir ?? ""}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? {
                                ...exItem,
                                targetRir:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="text-xs text-steel">
                  RPE
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={item.targetRpe ?? ""}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? {
                                ...exItem,
                                targetRpe:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="text-xs text-steel">
                  Rest (s)
                  <input
                    type="number"
                    min={0}
                    value={item.restSeconds}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? {
                                ...exItem,
                                restSeconds: Number(e.target.value),
                              }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
                <label className="text-xs text-steel">
                  Tempo
                  <input
                    value={item.tempo ?? ""}
                    onChange={(e) =>
                      updateDay(activeDay.id, (day) => ({
                        ...day,
                        exercises: day.exercises.map((exItem) =>
                          exItem.id === item.id
                            ? { ...exItem, tempo: e.target.value }
                            : exItem,
                        ),
                      }))
                    }
                    className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                  />
                </label>
              </div>
              <label className="mt-2 block text-xs text-steel">
                Coach notes
                <input
                  value={item.coachNotes ?? ""}
                  onChange={(e) =>
                    updateDay(activeDay.id, (day) => ({
                      ...day,
                      exercises: day.exercises.map((exItem) =>
                        exItem.id === item.id
                          ? { ...exItem, coachNotes: e.target.value }
                          : exItem,
                      ),
                    }))
                  }
                  className="mt-1 w-full border border-ink/15 bg-mist px-2 py-1 text-sm text-ink"
                />
              </label>
            </div>
          );
        })}
      </div>

      <div className="border border-dashed border-ink/20 p-4">
        <p className="text-sm font-medium text-ink">Add exercise</p>
        <select
          className="mt-2 w-full border border-ink/15 bg-bone px-3 py-2 text-sm"
          defaultValue=""
          onChange={(e) => {
            const exerciseId = e.target.value;
            if (!exerciseId) return;
            updateDay(activeDay.id, (day) => ({
              ...day,
              exercises: [
                ...day.exercises,
                newPlanExercise(exerciseId, day.exercises.length),
              ],
            }));
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Choose from library...
          </option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name} ({ex.primaryMuscle})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
