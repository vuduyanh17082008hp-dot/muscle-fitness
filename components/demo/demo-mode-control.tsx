"use client"

import { useEffect, useState } from "react"
import { Loader2, TestTube2 } from "lucide-react"

type Scenario = { id: string; label: string; description: string }

/**
 * Competition-safe Demo Data Control (spec Part "2. DEMO DATA
 * CONTROL"). Deliberately placed on an internal/admin surface, not a
 * normal client-facing settings page — turning this on only ever
 * changes what THIS account sees (its own wearable snapshot +
 * Experiment Lab step-count exposure), but the label stays explicit
 * everywhere the data surfaces (see AthleteState.wearable.isDemo) so
 * it can never be mistaken for a real device connection.
 */
export function DemoModeControl() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [scenario, setScenario] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  useEffect(() => {
    fetch("/api/demo/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setEnabled(data.settings.enabled);
          setScenario(data.settings.scenario);
          setScenarios(data.scenarios ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(next: { enabled: boolean; scenario: string | null }) {
    setSaving(true);
    try {
      const response = await fetch("/api/demo/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json();
      if (data.ok) {
        setEnabled(next.enabled);
        setScenario(next.scenario);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="size-3.5 animate-spin" /> Loading demo controls…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TestTube2 className="size-4 text-sky-400" aria-hidden="true" />
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-sky-300">
          Demo Data Control (this account only)
        </p>
      </div>

      <p className="text-xs leading-5 text-zinc-500">
        Enables a fixture wearable scenario for the Athlete Digital Twin, Recovery Radar, and
        Experiment Lab on THIS account only. Every surface that uses it is labeled demo — this
        never touches or hides your real logged data.
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={saving}
            onClick={() => void save({ enabled: true, scenario: s.id })}
            className={`rounded-xl border p-3 text-left transition-colors duration-200 disabled:opacity-50 ${
              enabled && scenario === s.id
                ? "border-sky-400/40 bg-sky-400/10"
                : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
          >
            <p className="text-xs font-bold text-white">{s.label}</p>
            <p className="mt-1 text-[11px] leading-4 text-zinc-500">{s.description}</p>
          </button>
        ))}
      </div>

      {enabled ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => void save({ enabled: false, scenario: null })}
          className="text-xs font-bold text-zinc-500 hover:text-rose-400 disabled:opacity-50"
        >
          Turn off demo mode
        </button>
      ) : null}
    </div>
  );
}
